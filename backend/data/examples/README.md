# Example documents (de-identified)

Three real documents supplied by the project team, prepared for demonstration. Every direct identifier was
removed **before** the files were added here; the originals are not part of this repository.

| File | Origin | Removed | Used by |
|---|---|---|---|
| `cardioai_conclusion_example.docx` | Cardiology conclusion ("Медицинское заключение"), 2021 — the input format of CardioAI | date of birth, city, employer/position, referring professor, clinic header/footer branding, document metadata | `GET /api/maternal/labs/cardioai/example` → CardioAI hypertension model, feature charts |
| `biochem_kdl_2026-07-25.jpg` | Phone screenshot of a KDL Olymp biochemistry report, 25.07.2026 | name, IIN, date of birth, request number (= portal login), barcode, results-portal login/password line, QR code, staff names and signatures; phone UI cropped | `POST /api/maternal/labs/examples/biochem_photo` |
| `pelvic_us_2025-03-25.pdf` | Scanned pelvic ultrasound report, 25.03.2025 (2 pages) | patient name, year of birth, doctor name, signature and stamp, cabinet phone; pages re-rasterised so nothing hidden remains under the boxes | `POST /api/maternal/labs/examples/pelvic_us` |

`*.txt` next to the image and the scan are manual transcriptions of the visible values (checked against the
file). They go through the same parser (`services/lab_extraction.parse_text`) as an upload, so the example also
tests the parser. Delete these files on request of the data owner.

## Example series (`series/`, `manifest.json`)

`generate_series.py` writes ten further reports around the two real ones so the charts show a trend: five blood
biochemistry reports through the demo pregnancy (05–10.2026) and five pelvic ultrasound reports in 2024–2026. They are
**generated** (`"synthetic": true` in `manifest.json`, `provenance.synthetic` in the database), carry no laboratory brand,
and their values follow the usual direction of change in pregnancy; they are not anyone's results. `manifest.json` lists
all twelve; `POST /api/maternal/labs/examples` adds every missing one.

## HC18 (`../hc18_samples/`)

Eight held-out validation images of the HC18 challenge (van den Heuvel et al., PLoS ONE 2018, CC BY 4.0,
https://zenodo.org/records/1327317) with the expert head circumference, used by the fetal head-circumference card.
