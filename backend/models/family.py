"""Postnatal support for the mother: EPDS screening, her own baby-care diary, questions to her doctors."""
import uuid
from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from database import Base


class EpdsResult(Base):
    """Edinburgh Postnatal Depression Scale (Cox, Holden & Sagovsky 1987). Private unless she shares it with her doctor."""

    __tablename__ = "epds_results"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), index=True)
    hospital_id: Mapped[str] = mapped_column(ForeignKey("hospitals.id"), index=True)
    answers: Mapped[list] = mapped_column(JSON)  # 10 item scores, 0..3 each, already reverse-scored where required
    score: Mapped[int] = mapped_column(Integer)
    self_harm: Mapped[int] = mapped_column(Integer)  # item 10 score
    shared: Mapped[bool] = mapped_column(Boolean, default=False)
    seen_by: Mapped[str | None] = mapped_column(String(200), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)


class CareLog(Base):
    """Mother's own baby-care diary (feeds, wet nappies, stools, temperature, jaundice, breathing, weight)."""

    __tablename__ = "care_logs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), index=True)
    at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    kind: Mapped[str] = mapped_column(String(20))  # feed | wet | stool | temp | jaundice | breathing | weight
    value: Mapped[float | None] = mapped_column(Float, nullable=True)  # minutes / ml / °C / breaths per min / g
    detail: Mapped[str | None] = mapped_column(String(40), nullable=True)  # breast|expressed|formula, stool colour, jaundice zone, indrawing
    note: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class MotherQuestion(Base):
    """A question from a mother to her obstetrician-gynaecologist or neonatologist, answered in the doctor portal."""

    __tablename__ = "mother_questions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), index=True)
    hospital_id: Mapped[str] = mapped_column(ForeignKey("hospitals.id"), index=True)
    to: Mapped[str] = mapped_column(String(20))  # obgyn | neonatologist
    topic: Mapped[str] = mapped_column(String(20), default="other")  # feeding | baby | mother | other
    text: Mapped[str] = mapped_column(Text)
    answer: Mapped[str | None] = mapped_column(Text, nullable=True)
    answered_by: Mapped[str | None] = mapped_column(String(200), nullable=True)
    answered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)
