import asyncio

from fastapi import APIRouter, Depends, Request, WebSocket, WebSocketDisconnect
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models.user import User, UserRole
from services import audit
from services.admission_engine import admission_engine
from services.fhir_connector import connector
from services.ml_engine import RiskEngine, risk_engine
from services.security import get_current_user, get_ws_user, require_roles

router = APIRouter(prefix="/api/integration", tags=["integration"])

class MappingBody(BaseModel):
    mapping: dict[str, str]


def _state_payload(hospital_id: str) -> dict:
    st = connector.state(hospital_id)
    return {"connected": st.connected, "token_preview": (st.token[:12] + "…") if st.token else None, "token_expires_in": int(max(st.token_expires - __import__("time").time(), 0)) if st.token else 0,
            "endpoints": st.endpoint_status(), "log_tail": st.log[-20:]}


@router.get("/benchmarks")
async def benchmarks(user: User = Depends(get_current_user)):
    """Measured results of the two risk models; nothing here is a target figure."""
    manifest = RiskEngine.baseline_manifest() or {}
    evaluation, tabular, admission = manifest.get("evaluation", {}), risk_engine.metrics, admission_engine.metrics
    holdout = evaluation.get("holdout")
    return {
        "tabular": {"name": manifest.get("origin_label", risk_engine.data_source), "n": manifest.get("patients") or manifest.get("rows"), "unit": "patients", "auroc": tabular.get("auroc"), "auprc": tabular.get("auprc"),
                    "brier": tabular.get("brier_calibrated", tabular.get("brier")), "ece": tabular.get("ece_calibrated"), "prevalence": round(manifest.get("prevalence", 0) * 100, 1), "period": evaluation.get("period", "—"),
                    "note": "24 h deterioration, one Chinese hospital, 5-fold CV split by patient. Not yet validated in Kazakhstan."},
        "admission": {"name": "KazNMU Asfendiyarov extract", "n": 1105, "unit": "admissions", "auroc": admission.get("auroc"), "auprc": admission.get("auprc"), "brier": admission.get("brier"), "ece": None,
                      "prevalence": round(admission.get("observed_mortality", 0) * 100, 1), "period": "2021–2025",
                      "note": f"In-hospital death, trained on 2021–2023, tested on {admission.get('n')} admissions of 2024–2025. Sensitivity {admission.get('sensitivity')}, predictions run high (mean {admission.get('mean_predicted')})."},
        "validation": [{"site": "PIC · CV", "auroc": tabular.get("auroc")}] + ([{"site": f"PIC · {holdout['patients']} held-out", "auroc": holdout["auroc"]}] if holdout else []) + [{"site": "Asfendiyarov · 2024–25", "auroc": admission.get("auroc")}],
        "calibration": evaluation.get("bands", []),
    }


@router.get("/schema")
async def schema(user: User = Depends(get_current_user)):
    return connector.schema_template()


@router.post("/schema/validate")
async def validate(body: MappingBody, request: Request, db: AsyncSession = Depends(get_db), user: User = Depends(require_roles(UserRole.researcher, UserRole.admin, UserRole.neonatologist))):
    result = connector.validate_mapping(body.mapping)
    await audit.record(db, user, "schema.validate", f"hospital:{user.hospital_id}", {"coverage": result["coverage"]}, request)
    await db.commit()
    return result


@router.get("/his/status")
async def his_status(user: User = Depends(require_roles(UserRole.admin, UserRole.researcher, UserRole.neonatologist, UserRole.analyst))):
    return _state_payload(user.hospital_id)


@router.post("/his/connect")
async def his_connect(request: Request, db: AsyncSession = Depends(get_db), user: User = Depends(require_roles(UserRole.admin, UserRole.researcher, UserRole.neonatologist))):
    await connector.connect(user.hospital_id)
    await audit.record(db, user, "his.connect", f"hospital:{user.hospital_id}", request=request)
    await db.commit()
    return _state_payload(user.hospital_id)


@router.post("/his/disconnect")
async def his_disconnect(request: Request, db: AsyncSession = Depends(get_db), user: User = Depends(require_roles(UserRole.admin, UserRole.researcher, UserRole.neonatologist))):
    await connector.disconnect(user.hospital_id)
    await audit.record(db, user, "his.disconnect", f"hospital:{user.hospital_id}", request=request)
    await db.commit()
    return _state_payload(user.hospital_id)


@router.websocket("/ws/his")
async def his_ws(websocket: WebSocket):
    """Live gateway log + endpoint status. Auth: ?token=<jwt>."""
    user = await get_ws_user(websocket)
    if not user:
        await websocket.close(code=4401)
        return
    await websocket.accept()
    try:
        async for entry in connector.stream(user.hospital_id):
            await websocket.send_json({"type": "log", "entry": entry, "endpoints": connector.state(user.hospital_id).endpoint_status()})
    except (WebSocketDisconnect, asyncio.CancelledError):
        return
