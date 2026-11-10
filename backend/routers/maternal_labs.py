"""Portal 3 · maternal lab history: upload a report, check what was read, confirm, see the trend.

Mother role only; every query is filtered by the current user's id, so one mother can never reach another's
documents (requests for someone else's id return 404). Values never go to the audit trail — only counts.
Contract: docs/maternal_labs.md.
"""
import asyncio
import hashlib
import io
import json
import uuid
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import quote

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, Response, UploadFile, status
from pydantic import BaseModel, Field
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models.clinical import MaternalRecord
from models.maternal_labs import LabDocument, LabObservation
from models.user import User, UserRole
from services import audit
from services.lab_extraction import CATALOG, catalog_public, convert, evaluate_rules, extract_text, parse_text, sniff_type, unit_key, reference_bounds

from services.security import require_roles

router = APIRouter(prefix="/api/maternal/labs", tags=["maternal-labs"])
MOTHER = require_roles(UserRole.mother)
MAX_BYTES = 10 * 1024 * 1024
CONFIRMED = ("verified", "corrected", "manual")


# ----------------------------------------------------------------------------------------------- helpers
async def _ga_context(db: AsyncSession, user: User) -> tuple[float, date] | None:
    rec = (await db.execute(select(MaternalRecord).where(MaternalRecord.user_id == user.id).order_by(MaternalRecord.updated_at.desc()).limit(1))).scalar_one_or_none()
    if not rec or rec.gestational_age_wk is None:
        return None
    upd = rec.updated_at or datetime.now(timezone.utc)
    return rec.gestational_age_wk * 7, upd.date()


def _ga_at(ctx: tuple[float, date] | None, d: date | None) -> int | None:
    """Gestational age in days on date d, from the pregnancy record (weeks on its last update)."""
    if not ctx or not d:
        return None
    ga = round(ctx[0] - (ctx[1] - d).days)
    return ga if 0 <= ga <= 322 else None


def _iso(d) -> str | None:
    return d.isoformat() if d else None


def _obs_out(o: LabObservation, ctx) -> dict:
    return {"id": str(o.id), "document_id": str(o.document_id) if o.document_id else None, "code": o.code, "original_name": o.original_name, "value": o.value,
            "value_text": o.value_text, "unit": o.unit, "original_value": o.original_value, "original_unit": o.original_unit, "reference_range": o.reference_range,
            "ref_low": o.ref_low, "ref_high": o.ref_high, "converted": bool(o.converted), "confidence": o.confidence, "status": o.status,
            "specimen_date": _iso(o.specimen_date), "gestational_age_days": _ga_at(ctx, o.specimen_date), "source_line": o.source_line}


def _doc_out(d: LabDocument, obs: list[LabObservation], ctx) -> dict:
    return {"id": str(d.id), "filename": d.filename, "content_type": d.content_type, "size": d.size, "uploaded_at": d.uploaded_at.isoformat() if d.uploaded_at else None,
            "laboratory": d.laboratory, "specimen_date": _iso(d.specimen_date), "report_date": _iso(d.report_date), "gestational_age_days": _ga_at(ctx, d.specimen_date),
            "status": d.status, "verified_at": d.verified_at.isoformat() if d.verified_at else None,
            "demo": d.provenance.get("source") in ("demo", "demo_history", "demo_seed"),
            "example": d.provenance.get("source") == "example",
            "summary": d.provenance.get("summary"),
            "report": d.provenance.get("report"),
            "source": d.provenance.get("source", "upload"),
            "ai": d.provenance.get("ai"),
            "extraction": {"method": d.extraction_method, "message": d.extraction_message, "confidence": round(d.extraction_confidence or 0, 2)},
            "observations": [_obs_out(o, ctx) for o in obs]}


async def _own_doc(db: AsyncSession, user: User, doc_id: str) -> LabDocument:
    try:
        uid = uuid.UUID(str(doc_id))
    except ValueError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Document not found")
    d = (await db.execute(select(LabDocument).where(LabDocument.id == uid, LabDocument.user_id == user.id))).scalar_one_or_none()
    if not d:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Document not found")
    return d


async def _doc_obs(db: AsyncSession, d: LabDocument) -> list[LabObservation]:
    return list((await db.execute(select(LabObservation).where(LabObservation.document_id == d.id).order_by(LabObservation.created_at, LabObservation.code))).scalars().all())


def _apply_parse(d: LabDocument, user: User, text: str, method: str, message: str | None, db: AsyncSession) -> list[LabObservation]:
    parsed = parse_text(text, method) if text else None
    obs: list[LabObservation] = []
    if parsed:
        for e in parsed.observations:
            obs.append(LabObservation(user_id=user.id, document_id=d.id, status="extracted", specimen_date=parsed.specimen_date, provenance={"method": method}, **e.dict()))
        d.laboratory = d.laboratory or parsed.laboratory
        d.specimen_date = d.specimen_date or parsed.specimen_date
        d.report_date = d.report_date or parsed.report_date
    if text and not obs and not message:
        message = "nothing_found"
    d.raw_text = (text or "")[:200_000]
    d.extraction_method = method
    d.extraction_message = message
    d.extraction_confidence = round(sum(o.confidence for o in obs) / len(obs), 2) if obs else 0.0
    for o in obs:
        db.add(o)
    return obs


async def _ingest(db: AsyncSession, user: User, data: bytes, filename: str, declared: str | None, request: Request, source: str = "upload") -> dict:
    if len(data) > MAX_BYTES:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "File is larger than 10 MB")
    if not data:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Empty file")
    ctype = sniff_type(data, declared, filename)
    if not ctype:
        raise HTTPException(status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, "Supported: PDF, JPG, PNG, WEBP, TXT")
    sha = hashlib.sha256(data).hexdigest()
    dup = (await db.execute(select(LabDocument.id).where(LabDocument.user_id == user.id, LabDocument.sha256 == sha))).scalar_one_or_none()
    if dup:
        raise HTTPException(status.HTTP_409_CONFLICT, {"code": "duplicate", "document_id": str(dup)})
    text, method, message = await asyncio.to_thread(extract_text, data, ctype)
    d = LabDocument(id=uuid.uuid4(), user_id=user.id, hospital_id=getattr(user, "hospital_id", None), filename=(filename or "document")[:255], content_type=ctype, size=len(data),
                    sha256=sha, data=data, status="needs_review", provenance={"source": source}, uploaded_at=datetime.now(timezone.utc))
    db.add(d)
    obs = _apply_parse(d, user, text, method, message, db)
    await audit.record(db, user, "maternal.labs.upload", f"lab_document:{d.id}", detail={"values": len(obs), "method": method}, request=request)
    await db.commit()
    return _doc_out(d, obs, await _ga_context(db, user))


def _clean_obs(code: str, value: float | None, value_text: str | None, unit: str | None) -> tuple[float | None, str | None, str]:
    """Validate a value she confirmed or typed; return it in canonical units. Raises 422 with a machine-readable code."""
    t = CATALOG.get(code)
    if not t:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, {"code": "unknown_test", "test": code})
    if value is None and not (value_text and value_text.strip()):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, {"code": "empty", "test": code})
    if value is None:
        if not (t.get("qual") or t.get("kind") == "qualitative"):
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, {"code": "numeric_required", "test": code})
        return None, value_text.strip()[:60], t["unit"]
    key = unit_key(unit or "", code)
    if key is None or (key not in t["conv"] and key != ""):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, {"code": "unit", "test": code, "unit": unit})
    canon, _, _ = convert(code, float(value), unit or "")
    lo, hi = t["plaus"]
    if not lo <= canon <= hi:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, {"code": "range", "test": code, "value": canon, "min": lo, "max": hi})
    return canon, (value_text.strip()[:60] if value_text else None), t["unit"]


def _check_date(d: date) -> None:
    if d > date.today() + timedelta(days=1) or d < date(2000, 1, 1):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, {"code": "date", "date": d.isoformat()})


# ----------------------------------------------------------------------------------------------- schemas
class TextIn(BaseModel):
    text: str = Field(max_length=200_000)
    method: str = Field(default="client_ocr", pattern="^(client_ocr|text)$")


class AIIn(BaseModel):
    consent: bool = False
    question: str = Field(default="", max_length=1000)
    language: str = Field(default="ru", pattern="^(ru|en|kz)$")
    mode: str = Field(default="extract", pattern="^(extract|explain)$")


class ManualIn(BaseModel):
    code: str = Field(max_length=32)
    value: float | None = None
    value_text: str | None = Field(default=None, max_length=60)
    unit: str = Field(default="", max_length=40)
    specimen_date: date


# ----------------------------------------------------------------------------------------------- endpoints
@router.get("/catalog")
async def catalog(user: User = Depends(require_roles(UserRole.mother, UserRole.neonatologist, UserRole.admin))):
    return {"tests": catalog_public()}


@router.get("/documents")
async def list_documents(db: AsyncSession = Depends(get_db), user: User = Depends(MOTHER)):
    docs = (await db.execute(select(LabDocument).where(LabDocument.user_id == user.id).order_by(LabDocument.uploaded_at.desc()))).scalars().all()
    ids = [d.id for d in docs]
    obs = (await db.execute(select(LabObservation).where(LabObservation.document_id.in_(ids)).order_by(LabObservation.created_at, LabObservation.code))).scalars().all() if ids else []
    by_doc: dict = {}
    for o in obs:
        by_doc.setdefault(o.document_id, []).append(o)
    ctx = await _ga_context(db, user)
    return [_doc_out(d, by_doc.get(d.id, []), ctx) for d in docs]


@router.post("/documents", status_code=status.HTTP_201_CREATED)
async def upload_document(request: Request, file: UploadFile = File(...), db: AsyncSession = Depends(get_db), user: User = Depends(MOTHER)):
    data = await file.read(MAX_BYTES + 1)
    return await _ingest(db, user, data, file.filename or "document", file.content_type, request)


class DemoIn(BaseModel):
    kind: str = Field(default="cbc", pattern="^(cbc|biochem|ogtt|thyroid|urine|fetal_us|pelvic_us)$")
    seed: int | None = None  # tests pass a seed; otherwise every example gets new random values


def render_demo(kind: str, specimen: date, seed: int | None = None) -> bytes:
    """Realistic fictional report (services/demo_reports.py): lab blank or ultrasound protocol, new values each time."""
    import random

    from services import demo_reports as dr
    r = random.Random(seed)
    if kind == "pelvic_us":
        return dr.render_pelvic_pdf(specimen, dr.pelvic_values(r))
    if kind == "fetal_us":
        return dr.render_fetal_pdf(specimen, dr.fetal_values(r))
    return dr.render_lab_pdf(kind, specimen, r)


@router.post("/demo", status_code=status.HTTP_201_CREATED)
async def demo_document(request: Request, body: DemoIn | None = None, db: AsyncSession = Depends(get_db), user: User = Depends(MOTHER)):
    """A fictional report of the chosen kind, rendered as a PDF and read by the same pipeline as a real upload."""
    body = body or DemoIn()
    kind = body.kind
    data = await asyncio.to_thread(render_demo, kind, date.today() - timedelta(days=2), body.seed)
    return await _ingest(db, user, data, f"demo_{kind}_{date.today().isoformat()}_{uuid.uuid4().hex[:4]}.pdf", "application/pdf", request, source="demo")


class DemoHistoryIn(BaseModel):
    end_date: date


# Typical laboratory reference intervals printed on the fictional demo reports. Blood pressure, weight and fetal sizes have
# no laboratory interval (thresholds / gestational charts apply), so none is printed for them.
DEMO_REFS = {"hb": (110, 150), "rbc": (3.5, 5.0), "plt": (150, 400), "glucose": (4.1, 5.9), "ferritin": (10, 120), "tsh": (0.4, 4.0), "urine_protein": (0, 0.14)}


@router.post("/demo/history")
async def demo_history(body: DemoHistoryIn, request: Request, db: AsyncSession = Depends(get_db), user: User = Depends(MOTHER)):
    """Explicitly save fictional, dated examples; a repeated request does not duplicate them."""
    _check_date(body.end_date)
    if body.end_date > date.today() + timedelta(days=1) or body.end_date < date(2000, 4, 1):  # +1 day: local time zones ahead of UTC (Kazakhstan UTC+5)
        raise HTTPException(422, "Choose a past or current date after 2000-04-01")
    ctx = await _ga_context(db, user)
    created = 0
    values = {"hb": [124, 119, 113, 116], "rbc": [4.2, 4.1, 4.0, 4.1], "plt": [245, 238, 230, 242],
              "glucose": [4.5, 4.7, 4.6, 4.8], "bp_sys": [112, 116, 120, 118], "bp_dia": [72, 75, 78, 76],
              "weight": [60, 62, 64, 66], "ferritin": [38, 32, 25, 30], "tsh": [1.8, 2.0, 2.1, 1.9],
              "urine_protein": [0.05, 0.07, 0.06, 0.05], "bpd": [42, 52, 62, 72]}
    for i, days in enumerate([84, 56, 28, 0]):
        specimen = body.end_date - timedelta(days=days)
        text = "DEMO: fictional data, not a medical report\n" + f"Specimen: {specimen.isoformat()}\n" + "\n".join(
            f"{code}: {vv[i]} {CATALOG[code]['unit']}" + (f"  ref {DEMO_REFS[code][0]:g}-{DEMO_REFS[code][1]:g}" if code in DEMO_REFS else "") for code, vv in values.items())
        data = text.encode("utf-8")
        sha = hashlib.sha256(data).hexdigest()
        exists = (await db.execute(select(LabDocument.id).where(LabDocument.user_id == user.id, LabDocument.sha256 == sha))).scalar_one_or_none()
        if exists:
            continue
        d = LabDocument(id=uuid.uuid4(), user_id=user.id, hospital_id=user.hospital_id, filename=f"DEMO_history_{specimen.isoformat()}.txt",
                        content_type="text/plain", size=len(data), sha256=sha, data=data, raw_text=text, laboratory="NeoOutcome DEMO",
                        specimen_date=specimen, status="verified", verified_at=datetime.now(timezone.utc),
                        extraction_method="text", provenance={"source": "demo_history"})
        db.add(d)
        for code, vv in values.items():
            db.add(LabObservation(user_id=user.id, document_id=d.id, code=code, value=vv[i], unit=CATALOG[code]["unit"],
                                  specimen_date=specimen, gestational_age_days=_ga_at(ctx, specimen), status="verified", confidence=1,
                                  original_name=CATALOG[code]["names"]["ru"], original_value=str(vv[i]), original_unit=CATALOG[code]["unit"],
                                  reference_range=f"{DEMO_REFS[code][0]:g} - {DEMO_REFS[code][1]:g}" if code in DEMO_REFS else None,
                                  ref_low=DEMO_REFS.get(code, (None, None))[0], ref_high=DEMO_REFS.get(code, (None, None))[1],
                                  provenance={"source": "demo_history"}))
        created += 1
    await audit.record(db, user, "maternal.labs.demo_history", "lab_documents", detail={"created": created}, request=request)
    await db.commit()
    return {"created": created}


@router.delete("/demo/history")
async def remove_demo_history(request: Request, db: AsyncSession = Depends(get_db), user: User = Depends(MOTHER)):
    docs = (await db.execute(select(LabDocument).where(LabDocument.user_id == user.id))).scalars().all()
    ids = [d.id for d in docs if d.provenance.get("source") == "demo_history"]
    if ids:
        await db.execute(delete(LabObservation).where(LabObservation.user_id == user.id, LabObservation.document_id.in_(ids)))
        await db.execute(delete(LabDocument).where(LabDocument.user_id == user.id, LabDocument.id.in_(ids)))
    await audit.record(db, user, "maternal.labs.demo_history_delete", "lab_documents", detail={"deleted": len(ids)}, request=request)
    await db.commit()
    return {"deleted": len(ids)}


@router.get("/ai/status")
async def ai_status(user: User = Depends(MOTHER)):
    from config import get_settings
    from services.openai_labs import configured
    return {"configured": configured(), "model": get_settings().openai_model, "provider": "OpenAI"}


@router.post("/documents/{doc_id}/ai")
async def ai_document(doc_id: str, body: AIIn, request: Request, db: AsyncSession = Depends(get_db), user: User = Depends(MOTHER)):
    from services.openai_labs import AIError, request_report
    from config import get_settings
    if not body.consent:
        raise HTTPException(422, "Подтвердите отправку этого документа в OpenAI.")
    d = await _own_doc(db, user, doc_id)
    if body.mode == "extract" and d.status != "needs_review":
        raise HTTPException(409, "Подтверждённые значения не перезаписываются. Выберите пояснение.")
    data, content_type = d.data, d.content_type
    await db.commit()  # Release the connection while waiting for the external API.
    try:
        parsed = await asyncio.to_thread(request_report, data, content_type, body.question, body.language)
    except AIError as exc:
        raise HTTPException(503, str(exc)) from None
    d = (await db.execute(select(LabDocument).where(LabDocument.id == d.id, LabDocument.user_id == user.id).with_for_update().execution_options(populate_existing=True))).scalar_one_or_none()
    if not d:
        raise HTTPException(404, "Document not found")
    if body.mode == "extract" and d.status != "needs_review":
        raise HTTPException(409, "Документ уже подтверждён в другом окне; значения сохранены.")
    warnings = list(parsed["warnings"][:10])
    observations = []
    if body.mode == "extract":
        seen = set()
        for row in parsed["observations"]:
            code = row["code"]
            if code not in CATALOG or code in seen:
                continue
            try:
                value, value_text, unit = _clean_obs(code, row["value"], row["value_text"], row["unit"])
            except HTTPException:
                warnings.append(f"Проверьте показатель {code}: значение или единица не прошли проверку.")
                continue
            seen.add(code)
            low, high = reference_bounds(row["reference_range"])
            converted = False
            if row["value"] is not None:
                _, converted, _ = convert(code, row["value"], row["unit"])
            if low is not None:
                low = convert(code, low, row["unit"])[0]
            if high is not None:
                high = convert(code, high, row["unit"])[0]
            observations.append(LabObservation(user_id=user.id, document_id=d.id, code=code, value=value, value_text=value_text, unit=unit,
                                               original_name=row["original_name"][:200], original_value=str(row["value"] if row["value"] is not None else row["value_text"] or ""),
                                               original_unit=row["unit"][:40], reference_range=(f"{low:g} - {high:g}" if low is not None and high is not None else row["reference_range"]),
                                               ref_low=low, ref_high=high, converted=converted, confidence=0, status="extracted", source_line=row["source_line"][:300],
                                               provenance={"method": "openai", "model": get_settings().openai_model}))
        if observations:
            await db.execute(delete(LabObservation).where(LabObservation.document_id == d.id, LabObservation.status == "extracted"))
            d.laboratory = (parsed["laboratory"] or d.laboratory or "")[:120] or None
            for field in ("specimen_date", "report_date"):
                value = parsed[field]
                if value:
                    try:
                        day = date.fromisoformat(value); _check_date(day)
                        setattr(d, field, day)
                    except (ValueError, HTTPException):
                        warnings.append("Проверьте дату в документе вручную.")
            for observation in observations:
                observation.specimen_date = d.specimen_date
                db.add(observation)
            d.extraction_method = "openai"; d.extraction_message = None; d.extraction_confidence = 0
        else:
            warnings.append("Новые значения не сохранены: распознанные данные требуют ручной проверки.")
    d.provenance = {**d.provenance, "ai": {"provider": "OpenAI", "model": get_settings().openai_model,
                                             "summary": parsed["summary"][:4000], "questions": parsed["questions"][:8], "warnings": warnings[:12],
                                             "mode": body.mode, "at": datetime.now(timezone.utc).isoformat()}}
    await audit.record(db, user, "maternal.labs.ai", f"lab_document:{d.id}", {"mode": body.mode, "values": len(observations)}, request)
    await db.commit()
    return _doc_out(d, await _doc_obs(db, d), await _ga_context(db, user))


@router.post("/documents/{doc_id}/text")
async def document_text(doc_id: str, body: TextIn, request: Request, db: AsyncSession = Depends(get_db), user: User = Depends(MOTHER)):
    """Text recognised in the browser (when the server has no OCR) is parsed by the same server code."""
    d = await _own_doc(db, user, doc_id)
    if d.status != "needs_review":
        raise HTTPException(status.HTTP_409_CONFLICT, {"code": "already_verified"})
    if await _doc_obs(db, d):
        raise HTTPException(status.HTTP_409_CONFLICT, {"code": "already_read"})  # browser OCR only fills a file with no values read yet
    obs = _apply_parse(d, user, body.text, body.method, None if body.text.strip() else "no_text", db)
    await audit.record(db, user, "maternal.labs.text", f"lab_document:{d.id}", detail={"values": len(obs), "method": body.method}, request=request)
    await db.commit()
    return _doc_out(d, obs, await _ga_context(db, user))


@router.get("/documents/{doc_id}/file")
async def document_file(doc_id: str, request: Request, db: AsyncSession = Depends(get_db), user: User = Depends(MOTHER)):
    d = await _own_doc(db, user, doc_id)
    await audit.record(db, user, "maternal.labs.file", f"lab_document:{d.id}", request=request)
    await db.commit()
    return Response(content=d.data, media_type=d.content_type, headers={"Content-Disposition": f"inline; filename*=UTF-8''{quote(d.filename)}", "Cache-Control": "private, no-store"})


class ReportIn(BaseModel):
    comment: str = Field(default="", max_length=500)


@router.post("/documents/{doc_id}/confirm")
async def confirm_document(doc_id: str, request: Request, db: AsyncSession = Depends(get_db), user: User = Depends(MOTHER)):
    """She confirms that the values read from HER document match the original. She cannot type, edit or add values:
    everything that reaches the timeline comes from the document itself (parser, OCR or the AI reader)."""
    d = await _own_doc(db, user, doc_id)
    if d.status != "needs_review":
        raise HTTPException(status.HTTP_409_CONFLICT, {"code": "already_verified"})
    if d.provenance.get("report"):
        raise HTTPException(status.HTTP_409_CONFLICT, {"code": "reported"})
    obs = await _doc_obs(db, d)
    if not d.specimen_date or not obs:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, {"code": "incomplete", "date": bool(d.specimen_date), "values": len(obs)})
    ctx = await _ga_context(db, user)
    for o in obs:
        o.status = "verified"
        o.specimen_date = d.specimen_date
        o.gestational_age_days = _ga_at(ctx, d.specimen_date)
    d.status = "verified"
    d.verified_at = datetime.now(timezone.utc)
    await audit.record(db, user, "maternal.labs.confirm", f"lab_document:{d.id}", detail={"values": len(obs)}, request=request)
    await db.commit()
    return _doc_out(d, obs, ctx)


@router.post("/documents/{doc_id}/report")
async def report_document(doc_id: str, body: ReportIn, request: Request, db: AsyncSession = Depends(get_db), user: User = Depends(MOTHER)):
    """She reports that the reading does not match the original. The values stay off the timeline; nothing is changed."""
    d = await _own_doc(db, user, doc_id)
    if d.status != "needs_review":
        raise HTTPException(status.HTTP_409_CONFLICT, {"code": "already_verified"})
    d.provenance = {**d.provenance, "report": {"comment": body.comment.strip()[:500], "at": datetime.now(timezone.utc).isoformat()}}
    await audit.record(db, user, "maternal.labs.report", f"lab_document:{d.id}", request=request)
    await db.commit()
    return _doc_out(d, await _doc_obs(db, d), await _ga_context(db, user))


# ----------------------------------------------------------------------------------------------- staff: delete / correct
# A mother cannot delete or change a document. If a document must be removed or a reading corrected, her doctor does it
# here, with a reason that goes to the audit trail. Clinicians see only mothers of their own hospital (admin: all).
STAFF = require_roles(UserRole.neonatologist, UserRole.admin)


class StaffDeleteIn(BaseModel):
    reason: str = Field(min_length=5, max_length=500)


class StaffObsIn(BaseModel):
    code: str = Field(max_length=32)
    value: float | None = None
    value_text: str | None = Field(default=None, max_length=60)
    unit: str = Field(default="", max_length=40)
    reference_range: str | None = Field(default=None, max_length=60)


class StaffCorrectIn(BaseModel):
    reason: str = Field(min_length=5, max_length=500)
    specimen_date: date
    observations: list[StaffObsIn] = Field(min_length=1, max_length=200)


def _staff_scope(query, user: User):
    return query if user.role == UserRole.admin else query.where(LabDocument.hospital_id == user.hospital_id)


async def _staff_doc(db: AsyncSession, user: User, doc_id: str) -> LabDocument:
    try:
        uid = uuid.UUID(str(doc_id))
    except ValueError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Document not found")
    d = (await db.execute(_staff_scope(select(LabDocument).where(LabDocument.id == uid), user))).scalar_one_or_none()
    if not d:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Document not found")
    return d


@router.get("/staff/mothers")
async def staff_mothers(db: AsyncSession = Depends(get_db), user: User = Depends(STAFF)):
    q = select(User).where(User.role == UserRole.mother)
    if user.role != UserRole.admin:
        q = q.where(User.hospital_id == user.hospital_id)
    mothers = (await db.execute(q.order_by(User.full_name))).scalars().all()
    docs = (await db.execute(_staff_scope(select(LabDocument.user_id, LabDocument.status, LabDocument.provenance), user))).all()
    out = []
    for m in mothers:
        mine = [d for d in docs if d.user_id == m.id]
        out.append({"id": str(m.id), "full_name": m.full_name, "hospital_id": m.hospital_id, "documents": len(mine),
                    "reported": sum(bool((d.provenance or {}).get("report")) for d in mine), "pending": sum(d.status == "needs_review" for d in mine)})
    return out


@router.get("/staff/mothers/{mother_id}/documents")
async def staff_documents(mother_id: str, request: Request, db: AsyncSession = Depends(get_db), user: User = Depends(STAFF)):
    try:
        mid = uuid.UUID(mother_id)
    except ValueError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not found")
    docs = (await db.execute(_staff_scope(select(LabDocument).where(LabDocument.user_id == mid), user).order_by(LabDocument.specimen_date.desc().nulls_last(), LabDocument.uploaded_at.desc()))).scalars().all()
    await audit.record(db, user, "maternal.staff.documents", f"mother:{mid}", detail={"documents": len(docs)}, request=request)
    await db.commit()
    return [{**_doc_out(d, await _doc_obs(db, d), None), "corrections": d.provenance.get("corrections", [])} for d in docs]


@router.get("/staff/documents/{doc_id}/file")
async def staff_document_file(doc_id: str, request: Request, db: AsyncSession = Depends(get_db), user: User = Depends(STAFF)):
    d = await _staff_doc(db, user, doc_id)
    await audit.record(db, user, "maternal.staff.file", f"lab_document:{d.id}", request=request)
    await db.commit()
    return Response(content=d.data, media_type=d.content_type, headers={"Content-Disposition": f"inline; filename*=UTF-8''{quote(d.filename)}", "Cache-Control": "private, no-store"})


@router.put("/staff/documents/{doc_id}")
async def staff_correct_document(doc_id: str, body: StaffCorrectIn, request: Request, db: AsyncSession = Depends(get_db), user: User = Depends(STAFF)):
    """The doctor corrects the reading against the original. Previous values are kept in the document history."""
    d = await _staff_doc(db, user, doc_id)
    _check_date(body.specimen_date)
    old = await _doc_obs(db, d)
    seen: set[str] = set()
    new = []
    for item in body.observations:
        if item.code in seen:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, {"code": "duplicate_test", "test": item.code})
        seen.add(item.code)
        value, value_text, unit = _clean_obs(item.code, item.value, item.value_text, item.unit)
        lo, hi = reference_bounds(item.reference_range)
        if lo is not None:
            lo = convert(item.code, lo, item.unit)[0]
        if hi is not None:
            hi = convert(item.code, hi, item.unit)[0]
        prev = next((o for o in old if o.code == item.code), None)
        changed = prev is None or prev.value != value or (prev.value_text or None) != (value_text or None) or (prev.reference_range or None) != (item.reference_range or None)
        new.append(LabObservation(user_id=d.user_id, document_id=d.id, code=item.code, value=value, value_text=value_text, unit=unit,
                                  original_name=prev.original_name if prev else "", original_value=prev.original_value if prev else "",
                                  original_unit=prev.original_unit if prev else "", reference_range=item.reference_range, ref_low=lo, ref_high=hi,
                                  converted=bool(prev.converted) if prev else False, confidence=1.0, status="corrected" if changed else "verified",
                                  specimen_date=body.specimen_date, source_line=prev.source_line if prev else None,
                                  provenance={"corrected_by": str(user.id)} if changed else (prev.provenance if prev else {})))
    history = list(d.provenance.get("corrections", []))
    history.append({"at": datetime.now(timezone.utc).isoformat(), "by": user.full_name, "role": user.role.value, "reason": body.reason.strip(),
                    "before": [{"code": o.code, "value": o.value, "value_text": o.value_text, "unit": o.unit} for o in old],
                    "specimen_date_before": _iso(d.specimen_date)})
    await db.execute(delete(LabObservation).where(LabObservation.document_id == d.id))
    for o in new:
        db.add(o)
    d.specimen_date = body.specimen_date
    d.status = "verified"
    d.verified_at = datetime.now(timezone.utc)
    d.provenance = {k: v for k, v in {**d.provenance, "corrections": history}.items() if k != "report"}  # the reported mismatch is resolved
    await audit.record(db, user, "maternal.staff.correct", f"lab_document:{d.id}", detail={"values": len(new), "reason": body.reason.strip()[:200]}, request=request)
    await db.commit()
    return {**_doc_out(d, new, None), "corrections": history}


@router.delete("/staff/documents/{doc_id}")
async def staff_delete_document(doc_id: str, body: StaffDeleteIn, request: Request, db: AsyncSession = Depends(get_db), user: User = Depends(STAFF)):
    d = await _staff_doc(db, user, doc_id)
    await db.execute(delete(LabObservation).where(LabObservation.document_id == d.id))
    await db.delete(d)
    await audit.record(db, user, "maternal.staff.delete", f"lab_document:{d.id}", detail={"mother": str(d.user_id), "filename": d.filename[:120], "reason": body.reason.strip()[:200]}, request=request)
    await db.commit()
    return {"deleted": str(d.id)}


@router.post("/observations", status_code=status.HTTP_201_CREATED)
async def add_observation(body: ManualIn, request: Request, db: AsyncSession = Depends(get_db), user: User = Depends(MOTHER)):
    """A value she measured or copied by hand (e.g. home blood pressure)."""
    _check_date(body.specimen_date)
    value, value_text, unit = _clean_obs(body.code, body.value, body.value_text, body.unit)
    ctx = await _ga_context(db, user)
    o = LabObservation(id=uuid.uuid4(), user_id=user.id, document_id=None, code=body.code, value=value, value_text=value_text, unit=unit, original_name="",
                       original_value=str(body.value if body.value is not None else body.value_text), original_unit=body.unit or "", confidence=1.0, status="manual",
                       specimen_date=body.specimen_date, gestational_age_days=_ga_at(ctx, body.specimen_date), provenance={"method": "manual"},
                       created_at=datetime.now(timezone.utc))
    db.add(o)
    await audit.record(db, user, "maternal.labs.manual", f"lab_observation:{o.id}", request=request)
    await db.commit()
    return _obs_out(o, ctx)


@router.delete("/observations/{obs_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_observation(obs_id: str, request: Request, db: AsyncSession = Depends(get_db), user: User = Depends(MOTHER)):
    try:
        uid = uuid.UUID(obs_id)
    except ValueError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Observation not found")
    o = (await db.execute(select(LabObservation).where(LabObservation.id == uid, LabObservation.user_id == user.id))).scalar_one_or_none()
    if not o:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Observation not found")
    if o.status != "manual":
        raise HTTPException(status.HTTP_409_CONFLICT, {"code": "not_manual"})
    await db.delete(o)
    await audit.record(db, user, "maternal.labs.manual_delete", f"lab_observation:{o.id}", request=request)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/timeline")
async def timeline(db: AsyncSession = Depends(get_db), user: User = Depends(MOTHER)):
    rows = (await db.execute(select(LabObservation).where(LabObservation.user_id == user.id, LabObservation.status.in_(CONFIRMED))
                             .order_by(LabObservation.specimen_date, LabObservation.created_at))).scalars().all()
    ctx = await _ga_context(db, user)
    series: dict[str, list[dict]] = {}
    last_at = None
    for o in rows:
        if o.specimen_date is None:
            continue
        series.setdefault(o.code, []).append({"date": o.specimen_date.isoformat(), "ga_days": _ga_at(ctx, o.specimen_date), "value": o.value, "value_text": o.value_text,
                                              "unit": o.unit, "document_id": str(o.document_id) if o.document_id else None, "observation_id": str(o.id),
                                              "manual": o.status == "manual", "ref_low": o.ref_low, "ref_high": o.ref_high})
    docs = (await db.execute(select(LabDocument.verified_at).where(LabDocument.user_id == user.id, LabDocument.verified_at.is_not(None)))).scalars().all()
    stamps = [x for x in docs if x] + [o.created_at for o in rows if o.status == "manual" and o.created_at]
    if stamps:
        last_at = max(s if s.tzinfo else s.replace(tzinfo=timezone.utc) for s in stamps).isoformat()
    return {"gestational_age_today_days": _ga_at(ctx, date.today()), "last_verified_at": last_at, "series": series, "alerts": evaluate_rules(series)}


# ----------------------------------------------------------------------------------------------- examples
# De-identified real documents (data/examples/README.md). The file is stored as the original; the values come from a
# checked transcription read by the same parser as an upload, and are saved as confirmed so they reach the charts.
EXAMPLES_DIR = Path(__file__).resolve().parents[1] / "data" / "examples"
EXAMPLES = {e["key"]: e for e in json.loads((EXAMPLES_DIR / "manifest.json").read_text(encoding="utf-8"))}  # generate_series.py


async def _example_docs(db: AsyncSession, user: User) -> dict[str, str]:
    rows = (await db.execute(select(LabDocument.id, LabDocument.provenance).where(LabDocument.user_id == user.id))).all()
    return {p.get("example"): str(i) for i, p in rows if p and p.get("source") == "example"}


async def _create_example(db: AsyncSession, user: User, key: str, ctx) -> tuple[LabDocument, list[LabObservation], bool]:
    ex = EXAMPLES[key]
    data = (EXAMPLES_DIR / ex["file"]).read_bytes()
    text = (EXAMPLES_DIR / ex["text"]).read_text(encoding="utf-8")
    sha = hashlib.sha256(data).hexdigest()
    existing = (await db.execute(select(LabDocument).where(LabDocument.user_id == user.id, LabDocument.sha256 == sha))).scalar_one_or_none()
    if not existing:  # the same example in an older layout counts as added (no duplicates in her history)
        mine = (await db.execute(select(LabDocument).where(LabDocument.user_id == user.id))).scalars().all()
        existing = next((d for d in mine if d.provenance.get("source") == "example" and d.provenance.get("example") == key), None)
    if existing:
        return existing, await _doc_obs(db, existing), False
    parsed = parse_text(text, "text")
    if not parsed.specimen_date or not parsed.observations:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "Example transcription could not be read")
    now = datetime.now(timezone.utc)
    d = LabDocument(id=uuid.uuid4(), user_id=user.id, hospital_id=getattr(user, "hospital_id", None), filename=ex["filename"], content_type=ex["content_type"],
                    size=len(data), sha256=sha, data=data, raw_text=text, laboratory=ex["laboratory"] or parsed.laboratory,
                    specimen_date=parsed.specimen_date, report_date=parsed.report_date, status="verified", verified_at=now,
                    extraction_method="text", extraction_confidence=1.0,
                    provenance={"source": "example", "example": key, "synthetic": bool(ex.get("synthetic")), **({"summary": ex["summary"]} if ex.get("summary") else {})},
                    uploaded_at=now)
    db.add(d)
    obs = []
    for e in parsed.observations:
        e.confidence = 1.0  # transcription checked against the document
        o = LabObservation(user_id=user.id, document_id=d.id, status="verified", specimen_date=parsed.specimen_date,
                           gestational_age_days=_ga_at(ctx, parsed.specimen_date), provenance={"method": "text", "source": "example"}, **e.dict())
        obs.append(o)
        db.add(o)
    return d, obs, True


@router.get("/examples")
async def list_examples(db: AsyncSession = Depends(get_db), user: User = Depends(MOTHER)):
    added = await _example_docs(db, user)
    return [{"key": k, "group": e["group"], "date": e["date"], "filename": e["filename"], "content_type": e["content_type"], "document_id": added.get(k)}
            for k, e in EXAMPLES.items()]


@router.post("/examples")
async def add_all_examples(request: Request, db: AsyncSession = Depends(get_db), user: User = Depends(MOTHER)):
    """Add every example that is not in her history yet (idempotent)."""
    ctx = await _ga_context(db, user)
    created = 0
    for key in EXAMPLES:
        _, _, new = await _create_example(db, user, key, ctx)
        created += new
        await db.flush()
    await audit.record(db, user, "maternal.labs.examples", "lab_documents", detail={"created": created}, request=request)
    await db.commit()
    return {"created": created, "total": len(EXAMPLES)}


@router.post("/examples/{key}", status_code=status.HTTP_201_CREATED)
async def add_example(key: str, request: Request, response: Response, db: AsyncSession = Depends(get_db), user: User = Depends(MOTHER)):
    if key not in EXAMPLES:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown example")
    ctx = await _ga_context(db, user)
    d, obs, new = await _create_example(db, user, key, ctx)
    if not new:
        response.status_code = status.HTTP_200_OK
        return _doc_out(d, obs, ctx)
    await audit.record(db, user, "maternal.labs.example", f"lab_document:{d.id}", detail={"example": key, "values": len(obs)}, request=request)
    await db.commit()
    return _doc_out(d, obs, ctx)


# ----------------------------------------------------------------------------------------------- CardioAI on a cardiology conclusion
CARDIOAI_LABS = [("weight", "weight_kg", "kg"), ("glucose", "glucose", "mmol/L"), ("creatinine", "creatinine", "µmol/L"), ("alt", "alt", "U/L"),
                 ("ast", "ast", "U/L"), ("urea", "urea", "mmol/L"), ("total_protein", "total_protein", "g/L"), ("cholesterol", "total_cholesterol", "mmol/L"),
                 ("hdl", "hdl", "mmol/L"), ("ldl", "ldl", "mmol/L"), ("triglycerides", "triglycerides", "mmol/L")]
CONCLUSION_EXAMPLE = "cardioai_conclusion_example.docx"


def _cardio_analysis(data: bytes, filename: str, source: str) -> dict:
    from services.cardio_conclusion import NUMERIC_LABELS, ConclusionError, docx_text, parse_conclusion, visit_rows
    from services.cardioai import load_numeric, phenotype, predict
    try:
        parsed = parse_conclusion(docx_text(data))
    except ConclusionError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, {"code": str(exc)}) from None
    m, numeric_cols, categorical_cols = load_numeric()
    text_only = {k: v for k, v in parsed["categorical"].items() if k not in parsed["numeric"]}
    features = {**text_only, **parsed["numeric"]}
    pred = predict(features)
    per_visit = []
    for day, row in visit_rows(parsed):
        p = predict({**text_only, **row})
        per_visit.append({"date": day, "stage": p["stage"], "class_shares": p["class_shares"], "numeric_supplied": p["numeric_supplied"],
                          "phenotype": phenotype(row)["cluster"]})
    numeric = [{"name": n, "label": NUMERIC_LABELS.get(n), "value": parsed["numeric"].get(n), "source": parsed["numeric_sources"].get(n),
                "training_mean": round(float(m["scaler_mean"][i]), 2)} for i, n in enumerate(numeric_cols)]
    categorical = [{"name": n, "value": features.get(n), "source": parsed["categorical_sources"].get(n)} for n in categorical_cols]
    return {"source": source, "filename": filename, "age": parsed["age"], "gender": parsed["gender"], "diagnosis": parsed["diagnosis"],
            "visits": parsed["visits"], "labs": parsed["labs"], "prediction": pred, "per_visit": per_visit, "phenotype": phenotype(parsed["numeric"]),
            "features": {"numeric": numeric, "categorical": categorical,
                         "numeric_supplied": sum(x["value"] is not None for x in numeric), "numeric_total": len(numeric),
                         "categorical_supplied": sum(x["value"] is not None for x in categorical), "categorical_total": len(categorical)},
            "experimental": True, "pregnancy_validated": False, "stored": False}


CARDIO_VARIANTS = ("original", "normal", "ag1", "ag2", "ag3")


def _example_conclusion(variant: str, seed: int) -> tuple[bytes, str]:
    """The de-identified 1.docx, or a generated conclusion in the same template (services/demo_reports.py)."""
    if variant == "original":
        return (EXAMPLES_DIR / CONCLUSION_EXAMPLE).read_bytes(), CONCLUSION_EXAMPLE
    import random

    from services import demo_reports as dr
    return dr.text_to_docx(dr.conclusion_text(variant, random.Random(seed))), f"conclusion_example_{variant}_{seed}.docx"


def _variant(variant: str) -> str:
    if variant not in CARDIO_VARIANTS:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, {"code": "variant"})
    return variant


@router.get("/cardioai/example")
async def cardioai_example(variant: str = "original", seed: int | None = None, user: User = Depends(MOTHER)):
    import random
    seed = seed if seed is not None else random.randint(1, 999_999)
    data, name = _example_conclusion(_variant(variant), seed)
    result = await asyncio.to_thread(_cardio_analysis, data, name, "example")
    return {**result, "variant": variant, "seed": seed}


@router.get("/cardioai/example.docx")
async def cardioai_example_file(variant: str = "original", seed: int = 1, user: User = Depends(MOTHER)):
    data, name = _example_conclusion(_variant(variant), seed)
    return Response(content=data, media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                    headers={"Content-Disposition": f"attachment; filename={name}", "Cache-Control": "private, no-store"})


@router.post("/cardioai/conclusion")
async def cardioai_conclusion(request: Request, file: UploadFile = File(...), db: AsyncSession = Depends(get_db), user: User = Depends(MOTHER)):
    """Read an uploaded .docx conclusion in memory and run CardioAI. The file and its values are not stored."""
    data = await file.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "File is larger than 10 MB")
    if not data.startswith(b"PK\x03\x04"):
        raise HTTPException(status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, "Supported: DOCX")
    result = await asyncio.to_thread(_cardio_analysis, data, (file.filename or "conclusion.docx")[:255], "upload")
    await audit.record(db, user, "maternal.cardioai.conclusion", "cardioai", detail={"numeric_supplied": result["features"]["numeric_supplied"]}, request=request)
    await db.commit()
    return result


# ----------------------------------------------------------------------------------------------- fetal head circumference (HC18)
@router.get("/hc/info")
async def hc_info(user: User = Depends(MOTHER)):
    from services.hc_engine import info
    return info()


@router.get("/hc/samples")
async def hc_samples(user: User = Depends(MOTHER)):
    from services.hc_engine import samples
    return samples()


@router.get("/hc/samples/{name}")
async def hc_sample_file(name: str, user: User = Depends(MOTHER)):
    from services.hc_engine import SAMPLES, samples
    if name not in {x["filename"] for x in samples()}:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown sample")
    return Response(content=(SAMPLES / name).read_bytes(), media_type="image/png", headers={"Cache-Control": "private, max-age=3600"})


@router.post("/hc/measure")
async def hc_measure(request: Request, file: UploadFile | None = File(None), sample: str | None = Form(None), pixel_size_mm: float | None = Form(None),
                     db: AsyncSession = Depends(get_db), user: User = Depends(MOTHER)):
    """Segment the fetal head and fit an ellipse. The image is processed in memory and not stored."""
    from services.hc_engine import SAMPLES, HCError, measure, samples
    reference = None
    if sample:
        meta = next((x for x in samples() if x["filename"] == sample), None)
        if not meta:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown sample")
        data, pixel_size_mm, reference = (SAMPLES / sample).read_bytes(), meta["pixel_size_mm"], meta.get("reference_hc_mm")
    elif file is not None:
        data = await file.read(MAX_BYTES + 1)
        if len(data) > MAX_BYTES:
            raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "File is larger than 10 MB")
    else:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, {"code": "no_image"})
    if pixel_size_mm is not None and not 0.01 <= pixel_size_mm <= 1.0:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, {"code": "pixel_size"})
    try:
        out = await asyncio.to_thread(measure, data, pixel_size_mm)
    except HCError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY if str(exc) != "model_missing" else status.HTTP_503_SERVICE_UNAVAILABLE, {"code": str(exc)}) from None
    out["reference_hc_mm"] = reference
    out["sample"] = sample
    await audit.record(db, user, "maternal.hc.measure", "hc18", detail={"sample": bool(sample)}, request=request)
    await db.commit()
    return out


# ----------------------------------------------------------------------------------------------- demo document
@router.get("/hypertension")
async def hypertension(arm: str = "unknown", db: AsyncSession = Depends(get_db), user: User = Depends(MOTHER)):
    """Per-date pressure summary and experimental CardioAI output. Never counts diagnoses."""
    if arm not in ("unknown", "right", "left"):
        raise HTTPException(422, "Invalid measurement arm")
    records = (await db.execute(select(LabObservation).where(LabObservation.user_id == user.id, LabObservation.status.in_(CONFIRMED))
                               .order_by(LabObservation.specimen_date, LabObservation.created_at))).scalars().all()
    by_date = {}
    for row in records:
        if row.specimen_date and row.value is not None:
            by_date.setdefault(row.specimen_date, {})[row.code] = row
    rec = (await db.execute(select(MaternalRecord).where(MaternalRecord.user_id == user.id).order_by(MaternalRecord.updated_at.desc()).limit(1))).scalars().first()
    result = []
    for day, values in by_date.items():
        s, d = values.get("bp_sys"), values.get("bp_dia")
        if not s or not d or s.unit != "mmHg" or d.unit != "mmHg" or s.value <= d.value:
            continue
        item = {"date": day.isoformat(), "systolic": s.value, "diastolic": d.value,
                "level": "critical" if s.value >= 160 or d.value >= 110 else "warning" if s.value >= 140 or d.value >= 90 else "below_threshold",
                "model": None}
        if arm != "unknown" and rec:
            from services.cardioai import predict
            side = "dex" if arm == "right" else "sin"
            features = {"age": rec.maternal_age, f"bp_arm_{side}_upper": s.value, f"bp_arm_{side}_lower": d.value}
            # Only same-date values in canonical units; do not carry future labs backwards.
            for code, target, unit in CARDIOAI_LABS:
                row = values.get(code)
                if row and row.unit == unit:
                    features[target] = row.value
            if features.get("ast") and features.get("alt"):
                features["de_ritis_index"] = round(features["ast"] / features["alt"], 2)
            item["features_used"] = sorted(k for k in features if features[k] is not None)
            try:
                item["model"] = await asyncio.to_thread(predict, features)
            except (ValueError, OSError, KeyError):
                item["model_error"] = "model_unavailable"
        result.append(item)
    return {"rows": result, "counts": {"dates": len(result), "elevated_dates": sum(x["level"] != "below_threshold" for x in result),
                                        "severe_dates": sum(x["level"] == "critical" for x in result)},
            "arm": arm, "has_age": bool(rec), "experimental": True,
            "source": "https://github.com/AdeleKunuspekova/CardioAI", "pregnancy_validated": False}
