import asyncio
import hashlib
import io
import uuid
from datetime import datetime, timezone
from types import SimpleNamespace
import pytest
from fastapi.testclient import TestClient
from pypdf import PdfReader
from reportlab.pdfgen import canvas
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool
from database import Base, get_db
from main import app
from models.patient import Patient
from models.patient_document import PatientDocument
from models.audit_log import AuditLog
from models.user import UserRole
from services.security import get_current_user


def sample_pdf():
    output = io.BytesIO(); c = canvas.Canvas(output); c.drawString(50, 700, "ORIGINAL REPORT 123"); c.showPage(); c.save(); return output.getvalue()


@pytest.fixture
def client(tmp_path):
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'documents.db'}", poolclass=NullPool)
    session = async_sessionmaker(engine, expire_on_commit=False)
    user = SimpleNamespace(id=uuid.uuid4(), hospital_id='hospital-a', role=UserRole.neonatologist, full_name='Test Doctor')
    state = {'user': user}
    async def setup():
        async with engine.begin() as conn:
            await conn.run_sync(lambda c: Base.metadata.create_all(c, tables=[Patient.__table__, PatientDocument.__table__, AuditLog.__table__]))
        async with session() as db:
            db.add(Patient(id='TEST-001', hospital_id='hospital-a', diagnosis='Demo', gestational_age_wk=32, birth_weight_g=1800, sex='F', apgar_1=7, apgar_5=8, delivery_mode='vaginal', postnatal_age_h=24, ventilation_mode='room air'))
            await db.commit()
    asyncio.run(setup())
    async def dependency():
        async with session() as db:
            yield db
    app.dependency_overrides[get_db] = dependency
    app.dependency_overrides[get_current_user] = lambda: state['user']
    # Without a context manager TestClient skips the production lifespan.
    c = TestClient(app)
    c.as_user = lambda u: state.update(user=u)
    c.doctor = user
    yield c
    app.dependency_overrides.clear()
    asyncio.run(engine.dispose())


def upload(client):
    data = sample_pdf()
    response = client.post('/api/documents/upload', data={'patient_id': 'TEST-001', 'encounter_ref': 'VISIT-001', 'document_at': datetime.now(timezone.utc).isoformat()}, files={'file': ('report.pdf', data, 'application/pdf')})
    assert response.status_code == 201, response.text
    return response.json(), data


def test_queue_signature_preserves_original_and_is_immutable(client):
    doc, original = upload(client)
    assert doc['status'] == 'pending'
    assert doc['original_sha256'] == hashlib.sha256(original).hexdigest()
    assert len(client.get('/api/documents').json()) == 1
    result = client.post(f"/api/documents/{doc['id']}/sign", json={'note': 'Reviewed all pages'})
    assert result.status_code == 200, result.text
    assert result.json()['signer_name'] == 'Test Doctor'
    assert result.json()['signed_at']
    pdf = client.get(f"/api/documents/{doc['id']}/pdf").content
    pages = PdfReader(io.BytesIO(pdf)).pages
    assert len(pages) == 2
    assert 'ORIGINAL REPORT 123' in pages[0].extract_text()
    assert 'Test Doctor' in pages[1].extract_text()
    assert doc['original_sha256'] in pages[1].extract_text().replace('\n', '')
    assert client.post(f"/api/documents/{doc['id']}/sign", json={}).status_code == 409


def test_other_hospital_and_analyst_cannot_read_or_sign(client):
    doc, _ = upload(client)
    client.as_user(SimpleNamespace(id=uuid.uuid4(), hospital_id='hospital-b', role=UserRole.neonatologist, full_name='Other'))
    assert client.get('/api/documents').json() == []
    assert client.get(f"/api/documents/{doc['id']}/pdf").status_code == 404
    assert client.post(f"/api/documents/{doc['id']}/sign", json={}).status_code == 404
    client.as_user(SimpleNamespace(id=uuid.uuid4(), hospital_id='hospital-a', role=UserRole.analyst, full_name='Analyst'))
    assert client.get('/api/documents').status_code == 403


def test_upload_rejects_invalid_document_and_naive_date(client):
    body = {'patient_id': 'TEST-001', 'encounter_ref': 'VISIT-001', 'document_at': datetime.now(timezone.utc).isoformat()}
    assert client.post('/api/documents/upload', data=body, files={'file': ('fake.pdf', b'not a pdf', 'application/pdf')}).status_code == 422
    body['document_at'] = '2026-11-09T10:00:00'
    assert client.post('/api/documents/upload', data=body, files={'file': ('report.pdf', sample_pdf(), 'application/pdf')}).status_code == 422
