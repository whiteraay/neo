"""Portal 3 · support for the mother after birth.

* EPDS — Edinburgh Postnatal Depression Scale (Cox, Holden & Sagovsky, Br J Psychiatry 1987): 10 items, 0–30. ≥ 13 likely
  depression, 10–12 possible; any answer other than "never" on item 10 (thoughts of self-harm) is urgent. A screen, not a
  diagnosis. The result stays private unless she chooses to share it with her doctor.
* Care diary — her own notes at home or in rooming-in (feeds, wet nappies, stools, temperature, jaundice, breathing,
  weight). They are NOT part of the medical record: the staff log (BabyEntry) is separate and only staff write it.
  Fixed rules (WHO danger signs of the newborn, WHO/UNICEF breastfeeding guidance) turn them into "fine / tell the doctor /
  seek care now" hints. Rules are a draft for review by neonatologists.
* "Today for my baby" — a few practical things she can do today, chosen from her baby's state.
* Questions to the obstetrician-gynaecologist or neonatologist; doctors of her hospital answer in the doctor portal.
"""
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models.clinical import BabyEntry, MaternalRecord
from models.family import CareLog, EpdsResult, MotherQuestion
from models.patient import Patient
from models.user import User, UserRole
from services import audit
from services.security import require_roles

router = APIRouter(prefix="/api/maternal", tags=["maternal-family"])
MOTHER = require_roles(UserRole.mother)
STAFF = require_roles(UserRole.neonatologist, UserRole.admin)

# ----------------------------------------------------------------------------------------------- EPDS
EPDS_DIRECT = {0, 1, 3}  # items 1, 2, 4 are scored 0..3 in the order shown; the others are reversed (3..0)


def epds_score(answers: list[int]) -> tuple[list[int], int, int]:
    items = [a if i in EPDS_DIRECT else 3 - a for i, a in enumerate(answers)]
    return items, sum(items), items[9]


def epds_band(score: int, self_harm: int) -> str:
    if self_harm > 0:
        return "urgent"
    return "high" if score >= 13 else "possible" if score >= 10 else "low"


class EpdsIn(BaseModel):
    answers: list[int] = Field(min_length=10, max_length=10)  # chosen option index 0..3 for each item, in display order
    share: bool = False


def _epds_out(r: EpdsResult) -> dict:
    return {"id": str(r.id), "score": r.score, "self_harm": r.self_harm, "band": epds_band(r.score, r.self_harm), "shared": r.shared,
            "seen_by": r.seen_by, "created_at": r.created_at}


@router.post("/epds", status_code=status.HTTP_201_CREATED)
async def add_epds(body: EpdsIn, request: Request, db: AsyncSession = Depends(get_db), user: User = Depends(MOTHER)):
    if any(a not in (0, 1, 2, 3) for a in body.answers):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Each answer is 0..3")
    items, score, self_harm = epds_score(body.answers)
    r = EpdsResult(user_id=user.id, hospital_id=user.hospital_id, answers=items, score=score, self_harm=self_harm, shared=body.share,
                   created_at=datetime.now(timezone.utc))
    db.add(r)
    await audit.record(db, user, "maternal.epds", f"user:{user.id}", detail={"shared": body.share}, request=request)  # the score stays out of the audit trail
    await db.commit()
    return _epds_out(r)


@router.get("/epds")
async def my_epds(db: AsyncSession = Depends(get_db), user: User = Depends(MOTHER)):
    rows = (await db.execute(select(EpdsResult).where(EpdsResult.user_id == user.id).order_by(EpdsResult.created_at.desc()).limit(12))).scalars().all()
    return [_epds_out(r) for r in rows]


# ----------------------------------------------------------------------------------------------- baby context
async def _baby(db: AsyncSession, user: User) -> dict:
    """Day of life and gestation at birth of her baby (linked NICU patient), or defaults when not linked yet."""
    rec = (await db.execute(select(MaternalRecord).where(MaternalRecord.user_id == user.id).order_by(MaternalRecord.updated_at.desc()).limit(1))).scalar_one_or_none()
    p = await db.get(Patient, rec.patient_id) if rec and rec.patient_id else None
    if not p:
        return {"linked": False, "day_of_life": None, "ga_birth_wk": None, "corrected_wk": None, "respiratory_support": None, "feeding": None, "weight_g": None, "birth_weight_g": None}
    last = (await db.execute(select(BabyEntry).where(BabyEntry.patient_id == p.id).order_by(BabyEntry.day.desc()).limit(1))).scalar_one_or_none()
    day = max(1, p.postnatal_age_h // 24 + 1, last.day if last else 0)
    return {"linked": True, "day_of_life": day, "ga_birth_wk": p.gestational_age_wk, "corrected_wk": round(p.gestational_age_wk + day / 7, 1),
            "respiratory_support": (last.respiratory_support if last else None) or p.ventilation_mode, "feeding": last.feeding if last else None,
            "weight_g": last.weight_g if last else None, "birth_weight_g": p.birth_weight_g}


# ----------------------------------------------------------------------------------------------- care diary
KINDS = {"feed": (0, 240), "wet": (None, None), "stool": (None, None), "temp": (33.0, 42.0), "jaundice": (None, None), "breathing": (10, 150), "weight": (400, 8000)}
DETAILS = {"feed": {"breast", "expressed", "formula"}, "stool": {"yellow", "green", "brown", "pale", "black", "blood"},
           "jaundice": {"none", "face", "chest", "belly", "legs", "palms"}, "breathing": {"calm", "indrawing", "pauses"}}


class CareIn(BaseModel):
    kind: str
    at: datetime
    value: float | None = None
    detail: str | None = Field(default=None, max_length=40)
    note: str = Field(default="", max_length=500)


def _care_out(c: CareLog) -> dict:
    return {"id": str(c.id), "kind": c.kind, "at": c.at, "value": c.value, "detail": c.detail, "note": c.note}


def care_hints(entries: list[CareLog], baby: dict, now: datetime) -> list[dict]:
    """Rules over the last 24 h. level: urgent (seek care now) | discuss (tell your doctor) | ok."""
    day = baby.get("day_of_life") or 0
    preterm = (baby.get("ga_birth_wk") or 40) < 37
    since = now - timedelta(hours=24)
    last24 = [e for e in entries if e.at >= since]
    hints: list[dict] = []

    def add(code, level, **kw):
        hints.append({"code": code, "level": level, **kw})

    def latest(kind):
        xs = sorted((e for e in entries if e.kind == kind), key=lambda e: e.at)
        return xs[-1] if xs else None

    t = latest("temp")
    if t and t.value is not None:
        if t.value > 37.5 or t.value < 35.5:
            add("temp_danger", "urgent", value=t.value)
        elif t.value < 36.5:
            add("temp_low", "discuss", value=t.value)
        else:
            add("temp_ok", "ok", value=t.value)
    b = latest("breathing")
    if b and ((b.value or 0) >= 60 or b.detail in ("indrawing", "pauses")):
        add("breathing_danger", "urgent", value=b.value, detail=b.detail)
    feeds = sum(e.kind == "feed" for e in last24)
    if feeds:
        add("feeds_ok" if feeds >= 8 else "feeds_low", "ok" if feeds >= 8 else "discuss", value=feeds)
    wets = sum(e.kind == "wet" for e in last24)
    if day >= 2 and (wets or feeds):
        need = min(day, 6)
        add("wet_ok" if wets >= need else "wet_low", "ok" if wets >= need else "discuss", value=wets, need=need)
    stools = [e for e in last24 if e.kind == "stool"]
    if any(e.detail in ("pale", "blood") for e in stools):
        add("stool_danger", "urgent", detail=next(e.detail for e in stools if e.detail in ("pale", "blood")))
    elif any(e.detail == "black" for e in stools) and day > 4:
        add("stool_black", "discuss")
    j = latest("jaundice")
    if j and j.detail and j.detail != "none":
        if day <= 1 or j.detail in ("legs", "palms"):
            add("jaundice_danger", "urgent", detail=j.detail)
        elif day > (21 if preterm else 14):
            add("jaundice_long", "discuss", detail=j.detail)
        else:
            add("jaundice_watch", "ok", detail=j.detail)
    order = {"urgent": 0, "discuss": 1, "ok": 2}
    return sorted(hints, key=lambda h: order[h["level"]])


@router.get("/care")
async def my_care(days: int = 7, db: AsyncSession = Depends(get_db), user: User = Depends(MOTHER)):
    now = datetime.now(timezone.utc)
    rows = (await db.execute(select(CareLog).where(CareLog.user_id == user.id, CareLog.at >= now - timedelta(days=max(1, min(days, 60))))
                             .order_by(CareLog.at.desc()))).scalars().all()
    for r in rows:
        if r.at.tzinfo is None:
            r.at = r.at.replace(tzinfo=timezone.utc)
    baby = await _baby(db, user)
    per_day: dict[str, dict] = {}
    for r in rows:
        d = per_day.setdefault(r.at.date().isoformat(), {"date": r.at.date().isoformat(), "feed": 0, "wet": 0, "stool": 0, "temp": None, "weight": None})
        if r.kind in ("feed", "wet", "stool"):
            d[r.kind] += 1
        elif r.kind in ("temp", "weight") and d[r.kind] is None:
            d[r.kind] = r.value
    return {"baby": baby, "entries": [_care_out(r) for r in rows], "days": sorted(per_day.values(), key=lambda x: x["date"]),
            "hints": care_hints(list(rows), baby, now), "medical_record": False}


@router.post("/care", status_code=status.HTTP_201_CREATED)
async def add_care(body: CareIn, request: Request, db: AsyncSession = Depends(get_db), user: User = Depends(MOTHER)):
    if body.kind not in KINDS:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, {"code": "kind"})
    lo, hi = KINDS[body.kind]
    if lo is not None and (body.value is None or not lo <= body.value <= hi):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, {"code": "value", "min": lo, "max": hi})
    if body.kind in DETAILS and body.detail not in DETAILS[body.kind] and not (body.kind == "feed" and body.detail is None):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, {"code": "detail"})
    at = body.at if body.at.tzinfo else body.at.replace(tzinfo=timezone.utc)
    if at > datetime.now(timezone.utc) + timedelta(minutes=5):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, {"code": "future"})
    c = CareLog(user_id=user.id, at=at, kind=body.kind, value=body.value, detail=body.detail, note=body.note.strip())
    db.add(c)
    await audit.record(db, user, "maternal.care", f"user:{user.id}", detail={"kind": body.kind}, request=request)
    await db.commit()
    return _care_out(c)


@router.delete("/care/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_care(entry_id: str, db: AsyncSession = Depends(get_db), user: User = Depends(MOTHER)):
    """Her own diary note (not a medical record) — she may remove a mistaken tap within 24 hours."""
    try:
        uid = uuid.UUID(entry_id)
    except ValueError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not found")
    c = (await db.execute(select(CareLog).where(CareLog.id == uid, CareLog.user_id == user.id))).scalar_one_or_none()
    if not c:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not found")
    created = c.created_at if c.created_at and c.created_at.tzinfo else (c.created_at or datetime.now(timezone.utc)).replace(tzinfo=timezone.utc)
    if datetime.now(timezone.utc) - created > timedelta(hours=24):
        raise HTTPException(status.HTTP_409_CONFLICT, {"code": "too_old"})
    await db.delete(c)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ----------------------------------------------------------------------------------------------- today for my baby
def today_tips(baby: dict, hints: list[dict]) -> list[str]:
    """Tip keys (texts live in the frontend, three languages). Chosen from the baby's state; never a treatment."""
    tips: list[str] = []
    if any(h["level"] == "urgent" for h in hints):
        tips.append("urgent_first")
    resp = (baby.get("respiratory_support") or "").lower()
    feeding = baby.get("feeding") or ""
    corrected = baby.get("corrected_wk") or 40
    if baby.get("linked"):
        if resp in ("simv", "hfov"):
            tips += ["touch_hold", "voice", "express"]
        else:
            tips += ["kangaroo", "express" if feeding in ("parenteral", "tube") else "feed_cues"]
        if feeding == "tube" and corrected >= 32:
            tips.append("oral_care")
        if corrected >= 34 and feeding in ("tube", "breast"):
            tips.append("latch")
        tips.append("ask_team")
    else:
        tips += ["feed_cues", "skin_to_skin", "safe_sleep"]
    tips.append("rest")
    seen: set[str] = set()
    return [t for t in tips if not (t in seen or seen.add(t))][:5]


@router.get("/today")
async def today(db: AsyncSession = Depends(get_db), user: User = Depends(MOTHER)):
    baby = await _baby(db, user)
    now = datetime.now(timezone.utc)
    rows = (await db.execute(select(CareLog).where(CareLog.user_id == user.id, CareLog.at >= now - timedelta(days=2)))).scalars().all()
    for r in rows:
        if r.at.tzinfo is None:
            r.at = r.at.replace(tzinfo=timezone.utc)
    return {"baby": baby, "tips": today_tips(baby, care_hints(list(rows), baby, now))}


# ----------------------------------------------------------------------------------------------- questions to doctors
class QuestionIn(BaseModel):
    to: str = Field(pattern="^(obgyn|neonatologist)$")
    topic: str = Field(default="other", pattern="^(feeding|baby|mother|other)$")
    text: str = Field(min_length=5, max_length=2000)


class AnswerIn(BaseModel):
    answer: str = Field(min_length=2, max_length=4000)


def _q_out(q: MotherQuestion, who: str | None = None) -> dict:
    return {"id": str(q.id), "to": q.to, "topic": q.topic, "text": q.text, "answer": q.answer, "answered_by": q.answered_by,
            "answered_at": q.answered_at, "created_at": q.created_at, **({"mother": who} if who is not None else {})}


@router.get("/questions")
async def my_questions(db: AsyncSession = Depends(get_db), user: User = Depends(MOTHER)):
    rows = (await db.execute(select(MotherQuestion).where(MotherQuestion.user_id == user.id).order_by(MotherQuestion.created_at.desc()))).scalars().all()
    return [_q_out(q) for q in rows]


@router.post("/questions", status_code=status.HTTP_201_CREATED)
async def ask(body: QuestionIn, request: Request, db: AsyncSession = Depends(get_db), user: User = Depends(MOTHER)):
    q = MotherQuestion(user_id=user.id, hospital_id=user.hospital_id, to=body.to, topic=body.topic, text=body.text.strip(), created_at=datetime.now(timezone.utc))
    db.add(q)
    await audit.record(db, user, "maternal.question", f"user:{user.id}", detail={"to": body.to}, request=request)
    await db.commit()
    return _q_out(q)


def _scope(q, user: User, model):
    return q if user.role == UserRole.admin else q.where(model.hospital_id == user.hospital_id)


@router.get("/staff/questions")
async def staff_questions(db: AsyncSession = Depends(get_db), user: User = Depends(STAFF)):
    rows = (await db.execute(_scope(select(MotherQuestion, User.full_name).join(User, User.id == MotherQuestion.user_id), user, MotherQuestion)
                             .order_by(MotherQuestion.answered_at.is_not(None), MotherQuestion.created_at.desc()))).all()
    return [_q_out(q, name) for q, name in rows]


@router.post("/staff/questions/{question_id}/answer")
async def answer(question_id: str, body: AnswerIn, request: Request, db: AsyncSession = Depends(get_db), user: User = Depends(STAFF)):
    try:
        uid = uuid.UUID(question_id)
    except ValueError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not found")
    q = (await db.execute(_scope(select(MotherQuestion).where(MotherQuestion.id == uid), user, MotherQuestion))).scalar_one_or_none()
    if not q:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not found")
    q.answer = body.answer.strip()
    q.answered_by = user.full_name
    q.answered_at = datetime.now(timezone.utc)
    await audit.record(db, user, "maternal.question.answer", f"question:{q.id}", request=request)
    await db.commit()
    return _q_out(q)


@router.get("/staff/epds")
async def staff_epds(db: AsyncSession = Depends(get_db), user: User = Depends(STAFF)):
    """Only results the mother chose to share; highest concern first."""
    rows = (await db.execute(_scope(select(EpdsResult, User.full_name).join(User, User.id == EpdsResult.user_id).where(EpdsResult.shared.is_(True)), user, EpdsResult)
                             .order_by(EpdsResult.created_at.desc()))).all()
    order = {"urgent": 0, "high": 1, "possible": 2, "low": 3}
    out = [{**_epds_out(r), "mother": name} for r, name in rows]
    return sorted(out, key=lambda x: (order[x["band"]], x["seen_by"] is not None))


@router.post("/staff/epds/{result_id}/seen")
async def staff_epds_seen(result_id: str, request: Request, db: AsyncSession = Depends(get_db), user: User = Depends(STAFF)):
    try:
        uid = uuid.UUID(result_id)
    except ValueError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not found")
    r = (await db.execute(_scope(select(EpdsResult).where(EpdsResult.id == uid, EpdsResult.shared.is_(True)), user, EpdsResult))).scalar_one_or_none()
    if not r:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not found")
    r.seen_by = user.full_name
    await audit.record(db, user, "maternal.epds.seen", f"epds:{r.id}", request=request)
    await db.commit()
    return _epds_out(r)
