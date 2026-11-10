"""Maternal lab history: uploaded lab reports and the values read from them.

The original file, the extracted text, every proposed value and every confirmed value are kept apart, so it is
always possible to see what the machine read, what the mother changed and what she confirmed (provenance).
Owned by the mother's user; never shown to staff or analysts in this version.
"""
import uuid
from datetime import date, datetime

from sqlalchemy import JSON, Date, DateTime, Float, ForeignKey, Integer, LargeBinary, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from database import Base


class LabDocument(Base):
    __tablename__ = "lab_documents"
    __table_args__ = (UniqueConstraint("user_id", "sha256", name="uq_lab_documents_user_sha256"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), index=True)
    hospital_id: Mapped[str | None] = mapped_column(ForeignKey("hospitals.id"), nullable=True)
    filename: Mapped[str] = mapped_column(String(255))
    content_type: Mapped[str] = mapped_column(String(80))
    size: Mapped[int] = mapped_column(Integer)
    sha256: Mapped[str] = mapped_column(String(64))
    data: Mapped[bytes] = mapped_column(LargeBinary)
    raw_text: Mapped[str] = mapped_column(Text, default="")
    extraction_method: Mapped[str] = mapped_column(String(20), default="none")  # pdf_text | ocr | client_ocr | text | none
    extraction_message: Mapped[str | None] = mapped_column(String(40), nullable=True)  # ocr_unavailable | no_text | nothing_found
    extraction_confidence: Mapped[float] = mapped_column(Float, default=0.0)
    laboratory: Mapped[str | None] = mapped_column(String(120), nullable=True)
    specimen_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    report_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="needs_review")  # needs_review | verified
    uploaded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    provenance: Mapped[dict] = mapped_column(JSON, default=dict)


class LabObservation(Base):
    __tablename__ = "lab_observations"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), index=True)
    document_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("lab_documents.id", ondelete="CASCADE"), nullable=True, index=True)
    code: Mapped[str] = mapped_column(String(32), index=True)
    original_name: Mapped[str] = mapped_column(String(200), default="")
    value: Mapped[float | None] = mapped_column(Float, nullable=True)
    value_text: Mapped[str | None] = mapped_column(String(60), nullable=True)
    unit: Mapped[str] = mapped_column(String(32), default="")
    original_value: Mapped[str] = mapped_column(String(60), default="")
    original_unit: Mapped[str] = mapped_column(String(40), default="")
    reference_range: Mapped[str | None] = mapped_column(String(60), nullable=True)
    ref_low: Mapped[float | None] = mapped_column(Float, nullable=True)
    ref_high: Mapped[float | None] = mapped_column(Float, nullable=True)
    converted: Mapped[bool] = mapped_column(default=False)
    confidence: Mapped[float] = mapped_column(Float, default=0.0)
    status: Mapped[str] = mapped_column(String(16), default="extracted")  # extracted | verified | corrected | manual
    specimen_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    gestational_age_days: Mapped[int | None] = mapped_column(Integer, nullable=True)
    source_line: Mapped[str | None] = mapped_column(String(300), nullable=True)
    provenance: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
