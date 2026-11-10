import hashlib
from datetime import datetime, timezone, timedelta
from uuid import UUID
from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, Response, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from database import get_db
from models.patient_document import PatientDocument
from models.telemetry import Prediction
from models.user import Hospital, User, UserRole
from routers.patients import latest_vitals
from services import audit
from services.document_pdf import normalise_document, signed_document
from services.patient_card import bundle_from_patient, render_patient_pdf, score_bundle
from services.security import get_accessible_patient, require_roles

router = APIRouter(prefix="/api/documents", tags=["patient-documents"])
DOCTOR = require_roles(UserRole.neonatologist)


def out(d):
    return {"id": str(d.id), "patient_id": d.patient_id, "encounter_ref": d.encounter_ref, "filename": d.filename, "source": d.source,
            "status": d.status, "document_at": d.document_at, "created_at": d.created_at, "signer_name": d.signer_name,
            "signed_at": d.signed_at, "note": d.note, "original_sha256": d.original_sha256}


async def own(db, user, doc_id, lock=False):
    q = select(PatientDocument).where(PatientDocument.id == doc_id, PatientDocument.hospital_id == user.hospital_id)
    if lock:
        q = q.with_for_update()
    d = (await db.execute(q)).scalar_one_or_none()
    if not d:
        raise HTTPException(404, "Document not found")
    await get_accessible_patient(db, user, d.patient_id)
    return d


@router.get("")
async def list_documents(db: AsyncSession = Depends(get_db), user: User = Depends(DOCTOR)):
    rows = (await db.execute(select(PatientDocument).where(PatientDocument.hospital_id == user.hospital_id).order_by(PatientDocument.created_at.desc()).limit(200))).scalars().all()
    return [out(d) for d in rows]


@router.get("/patients/{patient_id}/bundle")
async def patient_bundle(patient_id: str, db: AsyncSession = Depends(get_db), user: User = Depends(DOCTOR)):
    p = await get_accessible_patient(db, user, patient_id)
    pred = (await db.execute(select(Prediction).where(Prediction.patient_id == p.id).order_by(Prediction.created_at.desc()).limit(1))).scalar_one_or_none()
    hospital = await db.get(Hospital, p.hospital_id)
    return score_bundle(bundle_from_patient(p, await latest_vitals(db, p.id), pred, hospital.name if hospital else p.hospital_id))


class GeneratedIn(BaseModel):
    patient_id: str = Field(min_length=1, max_length=32)
    encounter_ref: str = Field(min_length=1, max_length=128)
    document_at: datetime
    bundle: dict


def require_time(value):
    if value.tzinfo is None:
        raise HTTPException(422, "Date/time must include a timezone")
    if value.year < 2000 or value > datetime.now(timezone.utc).replace(microsecond=0) + timedelta(days=1):
        raise HTTPException(422, "Invalid document date")


@router.post("/generated", status_code=201)
async def generated(body: GeneratedIn, request: Request, db: AsyncSession = Depends(get_db), user: User = Depends(DOCTOR)):
    p = await get_accessible_patient(db, user, body.patient_id)
    require_time(body.document_at)
    if body.bundle.get("patient", {}).get("patient_id") != p.id:
        raise HTTPException(422, "Patient and document do not match")
    if body.bundle.get("encounter", {}).get("encounter_id") != body.encounter_ref:
        raise HTTPException(422, "Encounter and document do not match")
    # Recompute predictions; the client cannot submit fabricated model results.
    bundle = score_bundle(body.bundle)
    bundle["encounter"]["document_at"] = body.document_at.isoformat()
    pdf = render_patient_pdf(bundle)
    d = PatientDocument(hospital_id=p.hospital_id, patient_id=p.id, encounter_ref=body.encounter_ref, filename=f"{p.id}_patient_card.pdf",
                        source="generated_demo" if bundle.get("synthetic") else "generated", original_pdf=pdf,
                        original_sha256=hashlib.sha256(pdf).hexdigest(), document_at=body.document_at, created_by=user.id)
    db.add(d); await db.flush()
    await audit.record(db, user, "document.queue", f"document:{d.id}", {"patient": p.id}, request)
    await db.commit(); await db.refresh(d)
    return out(d)


@router.post("/upload", status_code=201)
async def upload(request: Request, patient_id: str = Form(...), encounter_ref: str = Form(...), document_at: datetime = Form(...),
                 file: UploadFile = File(...), db: AsyncSession = Depends(get_db), user: User = Depends(DOCTOR)):
    p = await get_accessible_patient(db, user, patient_id)
    require_time(document_at)
    if not encounter_ref.strip() or len(encounter_ref) > 128:
        raise HTTPException(422, "Encounter is required")
    try:
        pdf = normalise_document(await file.read(10 * 1024 * 1024 + 1), file.filename or "document")
    except Exception as exc:
        raise HTTPException(422, "Use a readable PDF, JPG, PNG or WEBP, up to 10 MB") from exc
    d = PatientDocument(hospital_id=p.hospital_id, patient_id=p.id, encounter_ref=encounter_ref.strip(), filename=(file.filename or "document")[:250],
                        source="upload", original_pdf=pdf, original_sha256=hashlib.sha256(pdf).hexdigest(), document_at=document_at, created_by=user.id)
    db.add(d); await db.flush()
    await audit.record(db, user, "document.upload", f"document:{d.id}", {"patient": p.id}, request)
    await db.commit(); await db.refresh(d)
    return out(d)


@router.get("/{doc_id}/pdf")
async def document_pdf(doc_id: UUID, request: Request, db: AsyncSession = Depends(get_db), user: User = Depends(DOCTOR)):
    d = await own(db, user, doc_id)
    await audit.record(db, user, "document.read", f"document:{d.id}", request=request); await db.commit()
    return Response(d.signed_pdf if d.status == "signed" else d.original_pdf, media_type="application/pdf", headers={"Cache-Control": "private, no-store", "Content-Disposition": f'inline; filename="{d.id}.pdf"'})


class SignIn(BaseModel):
    note: str = Field(default="", max_length=2000)


@router.post("/{doc_id}/sign")
async def sign_document(doc_id: UUID, body: SignIn, request: Request, db: AsyncSession = Depends(get_db), user: User = Depends(DOCTOR)):
    d = await own(db, user, doc_id, lock=True)
    if d.status != "pending":
        raise HTTPException(409, "Document already signed")
    signed_at = datetime.now(timezone.utc)
    d.signed_pdf = signed_document(d.original_pdf, doc_id=str(d.id), patient_id=d.patient_id, encounter_ref=d.encounter_ref, signer=user.full_name,
                                  signed_at=signed_at.isoformat(), document_at=d.document_at.isoformat(), digest=d.original_sha256, note=body.note)
    d.status = "signed"; d.signed_by = user.id; d.signer_name = user.full_name; d.signed_at = signed_at; d.note = body.note
    await audit.record(db, user, "document.sign", f"document:{d.id}", {"sha256": d.original_sha256}, request)
    await db.commit()
    return out(d)
