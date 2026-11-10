"""Manual PDF layout verification, using fictional data only."""
from pathlib import Path
import hashlib
from services.patient_card import render_patient_pdf, score_bundle, synthetic_patient
from services.ml_engine import risk_engine
from services.document_pdf import signed_document

risk_engine.load_or_train()
folder = Path('/app/output/pdf'); folder.mkdir(parents=True, exist_ok=True)
bundle = score_bundle(synthetic_patient())
bundle['encounter']['document_at'] = '2026-11-09T15:30:00+05:00'
data = render_patient_pdf(bundle)
(folder / 'patient-card-preview.pdf').write_bytes(data)
signed = signed_document(data, doc_id='DEMO-DOC-001', patient_id=bundle['patient']['patient_id'], encounter_ref=bundle['encounter']['encounter_id'], signer='Демо-врач', signed_at='2026-11-09T10:35:00+00:00', document_at='2026-11-09T15:30:00+05:00', digest=hashlib.sha256(data).hexdigest(), note='Демонстрационный пример оформления. Не является медицинским документом.')
(folder / 'signed-document-preview.pdf').write_bytes(signed)
import fitz
for name in ['patient-card-preview', 'signed-document-preview']:
    doc = fitz.open(folder / f'{name}.pdf')
    for i, page in enumerate(doc):
        page.get_pixmap(matrix=fitz.Matrix(1.2, 1.2)).save(folder / f'{name}-{i+1}.png')
    print(name, len(doc), 'pages')
