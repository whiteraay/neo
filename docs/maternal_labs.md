# Maternal lab history ("Мои анализы" / "Динамика" / "Вопросы к врачу")

MVP of the *Maternal & Neonatal Intelligence* concept (NeoOutcome_AI_Maternal_Neonatal_Concept_RU.pdf, roadmap rows 1–3 and
the rule-based part of row 4). A pregnant woman uploads a photo or PDF of a lab report; the server reads it, proposes
values, she checks them against the original and confirms; confirmed values form a dated history plotted by week of
pregnancy, with plain, non-diagnostic prompts to discuss with her doctor.

Not in this MVP: ML risk models on maternal trajectories, mother–infant data linkage for research, analyst aggregates.

## Pipeline

1. **Intake** — PDF / JPG / PNG / WEBP / TXT, ≤ 10 MB, SHA-256 duplicate check per mother.
2. **Extraction** — PDF text layer (pypdf); images and scanned PDFs: Tesseract OCR (rus+eng) on the server when
   installed (Docker image installs it); otherwise the browser runs Tesseract.js and posts the text back.
3. **Normalisation** — synonyms (Hb / HGB / гемоглобин / гемоглобин …) → one code; units converted only when the
   dimension matches (g/dL → g/L, mg/dL → mmol/L for glucose, …); unknown units are kept and flagged, never guessed.
4. **Verification (read-only for the mother)** — original next to the values read from it. She cannot type, edit, add or
   delete values, the date or the laboratory: she either confirms the reading as a whole (`POST …/confirm`) or reports a
   mismatch (`POST …/report`, values stay off the timeline). Only confirmed values reach the timeline. A document without a
   specimen date cannot be confirmed; the date is never replaced by the upload date. Browser OCR may fill a file only while
   no value has been read from it. Her own home readings (BP, weight) remain manual entries.
5. **Timeline** — every value keeps specimen date, gestational age at that date, source document, lab, status.
6. **Rules** — fixed thresholds (below), independent of any model, worded as "discuss with your doctor"; the urgent
   rule tells her to seek care now. Thresholds and texts are a draft for review by obstetricians.

## API (mother role only, own records only)

| Method | Path | Body | Result |
|---|---|---|---|
| GET | `/api/maternal/labs/catalog` | — | `{ tests: [Test] }` |
| GET | `/api/maternal/labs/documents` | — | `[Document]`, newest first |
| POST | `/api/maternal/labs/documents` | multipart `file` | `Document` (201); 409 `{detail:{code:'duplicate', document_id}}`; 413; 415 |
| POST | `/api/maternal/labs/documents/{id}/text` | `{ text, method: 'client_ocr' }` | `Document` re-parsed (only while `needs_review`) |
| POST | `/api/maternal/labs/demo` | — | `Document` from a generated fictional CBC PDF, through the same pipeline |
| GET | `/api/maternal/labs/documents/{id}/file` | — | original bytes |
| POST | `/api/maternal/labs/documents/{id}/confirm` | — | `Document` (`verified`); 409 already confirmed or reported; 422 `{code:'incomplete'}` |
| POST | `/api/maternal/labs/documents/{id}/report` | `{ comment }` | `Document` with `report`; values stay off the timeline |
| POST | `/api/maternal/labs/observations` | `{ code, value?, value_text?, unit, specimen_date }` | `Observation` (manual, e.g. home BP) |
| DELETE | `/api/maternal/labs/observations/{id}` | — | 204 (manual only) |
| GET | `/api/maternal/labs/timeline` | — | `Timeline` |

```ts
Test = { code, group: 'cbc'|'urine'|'biochem'|'thyroid'|'ogtt'|'exam'|'ultrasound',
         names: {en, ru, kz}, unit /* canonical */, kind: 'numeric'|'qualitative', units: string[] /* accepted */ }

Document = { id, filename, content_type, size, uploaded_at, laboratory: string|null,
             specimen_date: 'YYYY-MM-DD'|null, report_date: 'YYYY-MM-DD'|null, gestational_age_days: number|null,
             status: 'needs_review'|'verified',
             extraction: { method: 'pdf_text'|'ocr'|'client_ocr'|'text'|'none',
                           message: null|'ocr_unavailable'|'no_text'|'nothing_found', confidence: number },
             observations: [Observation] }

Observation = { id, document_id: string|null, code, original_name, value: number|null, value_text: string|null,
                unit, original_value, original_unit, reference_range: string|null, ref_low: number|null, ref_high: number|null,
                converted: boolean, confidence: number, status: 'extracted'|'verified'|'corrected'|'manual',
                specimen_date: string|null, gestational_age_days: number|null, source_line: string|null }

ObsIn = { code, value?: number|null, value_text?: string|null, unit, original_name?, reference_range?, edited?: boolean }

Timeline = { gestational_age_today_days: number|null, last_verified_at: string|null,
             series: { [code]: [{ date, ga_days, value, value_text, unit, document_id, observation_id, manual }] },
             alerts: [{ code /* rule */, test, level: 'urgent'|'discuss'|'info', value, unit, date, ga_days, previous?: number, delta?: number }] }
```

Gestational age at a date = `gestational_age_wk × 7` from her pregnancy record minus the days between the record's
`updated_at` and that date (null when there is no record).

## Rules (draft — to be reviewed by obstetricians before any clinical use)

| Rule | Condition | Level | Basis |
|---|---|---|---|
| `bp_severe` | systolic ≥ 160 or diastolic ≥ 110 | urgent | severe hypertension in pregnancy (WHO, ACOG) |
| `bp_high` | systolic ≥ 140 or diastolic ≥ 90 | discuss | hypertension in pregnancy (WHO, ACOG) |
| `urine_protein` | protein ≥ 0.3 g/L or qualitative positive | discuss | proteinuria threshold |
| `hb_low` | Hb < 110 g/L | discuss | WHO anaemia in pregnancy |
| `hb_drop` | Hb fell ≥ 20 g/L since the previous result | discuss | change detection |
| `glucose_fasting` | OGTT 0 h ≥ 5.1 mmol/L | discuss | WHO 2013 / IADPSG |
| `ogtt_1h` / `ogtt_2h` | ≥ 10.0 / ≥ 8.5 mmol/L | discuss | WHO 2013 / IADPSG |
| `glucose_high` | glucose ≥ 7.0 mmol/L (fasting not known) | discuss | — |
| `plt_low` | platelets < 100 ×10⁹/L | discuss | — |
| `out_of_range` | outside the reference interval printed by the lab | info | the lab's own range |

## Dated demo history and categories

The Trends page filters charts and alerts by blood count, glucose/OGTT, pressure/weight, urine, biochemistry, thyroid and ultrasound measurements. Each numeric result has a chart and a dated table.

`POST /api/maternal/labs/demo/history` with `{ "end_date": "YYYY-MM-DD" }` explicitly saves four fictional, verified TXT reports at 28-day intervals, ending on the chosen date. Filenames and provenance identify them as DEMO; identical reports are not duplicated. `DELETE /api/maternal/labs/demo/history` removes only this generated history belonging to the current mother, preserving other uploads and manual readings. Server-backed examples persist in the database. The offline fallback stores examples for the current session.

## Example documents and pelvic ultrasound

`GET /api/maternal/labs/examples` lists two de-identified real documents (`backend/data/examples/README.md`);
`POST /api/maternal/labs/examples/{biochem_photo|pelvic_us}` stores the file as the original and its checked transcription,
read by `parse_text`, as **verified** values (repeat calls return the same document). `Document` gains `example: bool` and
`summary` (study, findings, conclusion, recommendation — text as printed, shown under the original).

New catalogue codes: biochemistry `urea`, `uric_acid`, `hba1c`, `total_protein`, `cholesterol`, `hdl`, `ldl`, `triglycerides`,
`apoa1`, `apob`, `folate`; group `pelvis` — `uterus_length`, `uterus_ap`, `uterus_width`, `endometrium`, `cervix_length`,
`cervix_width`, `ovary_{r,l}_{length,width}`, `follicle_{r,l}_mm` (mm, cm converted) and `follicles_{r,l}` (count; «9-10» → 10).
Pelvic reports print no reference ranges, so none are inferred. Trends has a «УЗИ малого таза» category with the latest study
(right vs left ovary, uterus and cervix) and per-measurement charts once there are two studies.

### Trends layout (v2)

Five tabs instead of one per lab group: **Анализы крови** (CBC, glucose/OGTT, biochemistry, thyroid as sections), **Давление и
вес** (systolic and diastolic on one chart, weight, per-date pressure + CardioAI), **Анализ мочи**, **УЗИ** (pelvic study with a
date picker, combined right/left trend charts, fetal measurements, HC18 head circumference), **Артериальная гипертензия**
(CardioAI on the de-identified conclusion, opened automatically). Value tables are collapsed under each chart.

### Fetal head circumference (HC18)

`ml/train_hc18.py` trains a U-Net (subject-level 90/10 split of the 999 annotated training images), fits an ellipse and
exports `ml/hc18/hc18_unet.onnx`, run by `services/hc_engine.py` through OpenCV DNN. `ml/hc18/test_set_predictions.csv`
holds HC for the 335 unlabeled test images. API: `GET /hc/info`, `GET /hc/samples`, `GET /hc/samples/{file}`,
`POST /hc/measure` (multipart `file` + `pixel_size_mm`, or `sample`) → HC (mm), Hadlock GA, overlay PNG; not stored.

### Deletion and correction only through the doctor

A mother cannot delete or change a document (there is no mother DELETE/PUT route). Her doctor (neonatologist of the same
hospital, or admin) does it in the doctor portal → «Документы мам»: `GET /staff/mothers`, `GET /staff/mothers/{id}/documents`,
`GET /staff/documents/{id}/file`, `PUT /staff/documents/{id}` `{reason, specimen_date, observations}` (previous values kept
in `provenance.corrections`, a reported mismatch is resolved), `DELETE /staff/documents/{id}` `{reason}`. A reason of at
least 5 characters is required and goes to the audit trail. Her own home readings (BP, weight) stay editable by her.
