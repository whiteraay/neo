# Patient documents and CardioAI

## Documents

Doctors can choose a hospital patient on the intake PDF panel, use the automatically populated admission reference or enter a reference, set document date/time, and queue a generated clinical summary. They can also upload PDF/JPG/PNG/WEBP files up to 10 MB. Images are converted to PDF. PDF uploads must be unencrypted and contain 1–100 pages.

The signing queue contains pending and signed documents. Signing records the authenticated doctor's identity and server UTC time, appends a separate confirmation page, and stores the signed bytes. The original PDF and its SHA-256 remain unchanged. Document time is separate from signing time. A signed record cannot be signed again; PostgreSQL row locks protect concurrent signatures. This is an internal electronic confirmation, not a qualified digital signature. No laboratory branding or handwritten signature is fabricated.

API: `/api/documents`, `/generated`, `/upload`, `/patients/{id}/bundle`, `/{id}/pdf`, `/{id}/sign`. Doctor-only, scoped to the current hospital and accessible patient. Read, queue, upload and sign operations are audited. New tables are created by the development bootstrap; production needs an Alembic migration before deploying this feature.

## CardioAI

Source: https://github.com/AdeleKunuspekova/CardioAI, commit `d03b5d7be5386ed31ac90e92a06bce9814c18dd6`.

Hypertension pipeline: StandardScaler → PCA → FeatureHasher → RandomForestClassifier (600 trees). The downloaded artifacts were produced with scikit-learn 1.7.1, despite the source requirements listing 1.3.2. Conversion runs with 1.7.1 in an isolated temporary container and a restricted unpickler. Runtime uses checksummed numeric `model.npz` arrays with `allow_pickle=False`, avoiding unpickling and a global sklearn upgrade. Regression tests compare classes and vote shares against original sklearn predictions.

Classes 1–3 are derived from a regular expression applied to preliminary diagnosis text. Class 0 means no degree was extracted, **not absence of hypertension**. The schema has 40 numeric and 46 categorical features, including two row-index columns; these are a potential leakage concern. Missing numeric features use the original scaler's training means. No training cohort file, validation metrics, pregnancy-specific validation or license file were found in the repository. The manifest records this; seek upstream permission before redistribution.

Mother portal: Trends → Hypertension. Counts refer to **dates with pressure values**, not diagnosed cases. User selects the arm used for measurements; only then is experimental inference enabled. Age comes from the mother's own pregnancy record. Labs are used only on the same date and with matching units. Output displays supplied/total features, the research limitation and model source. No model result overrides the project's blood-pressure threshold alerts. Offline inference is intentionally unavailable.

## Chart markers

Each point uses its own reference interval. Green means within a complete interval, amber means outside the report interval or a screening threshold, red is reserved for explicitly defined marked deviations, grey means no complete reference. Marker shapes and table status text supplement colour. Hb screening cutoffs are trimester-specific (WHO 2024); <70 g/L is marked red. These are visual screening cues, not diagnoses.

Source: https://www.ncbi.nlm.nih.gov/books/NBK602183/table/fm-ch1.tab2/

## CardioAI on a cardiology conclusion (.docx)

CardioAI was trained on rows that an LLM extracted from Kazakhstan cardiology conclusions («Медицинское заключение»,
`cardioai_reference/tools/prompts_extract.py`). `services/cardio_conclusion.py` reads the same fields with fixed regular
expressions on the server (no OpenAI call): first mention of every value (as the original prompt required), limb pressures
(АДdex/АДsin on arms, then «на ногах»), ЛПИ, ЭхоКГ ФВ, biochemistry, рСКФ/Кокрофт–Голт, and the categorical vocabulary of the
prompt (radial pulse, heart sounds, heredity, …). Free-text fields the LLM summarised (complaints, echo text) stay `unknown`.
Later dated visits and repeat labs are returned for charts, and the model is also run per visit.

The document label is derived like the training target: «гипертензия N» in the preliminary diagnosis, otherwise class 0.

| Method | Path | Result |
|---|---|---|
| GET | `/api/maternal/labs/cardioai/example` | analysis of `backend/data/examples/cardioai_conclusion_example.docx` (de-identified) |
| GET | `/api/maternal/labs/cardioai/example.docx` | the example file |
| POST | `/api/maternal/labs/cardioai/conclusion` | multipart `file` (.docx ≤ 10 MB); read in memory, **not stored**; audited by count only |

Mother portal: Trends → Arterial hypertension → «CardioAI: кардиологическое заключение» (class shares, limb pressures, BP and
heart rate by visit, creatinine and eGFR, lipids, every feature with the document excerpt it came from).

The pregnancy BP rows (`GET /hypertension?arm=`) now also pass same-day urea, total protein, lipids and the de Ritis ratio,
and creatinine is matched in its canonical unit `µmol/L` (it was compared with `umol/L` before and never reached the model).

### Phenotype (KMeans) on the same conclusion

`models/phenotype` of the same CardioAI commit (StandardScaler → PCA 15 → KMeans 3) is exported once by
`ml/export_phenotype.py` to `ml/cardioai/phenotype.npz` (checksum in the manifest, `allow_pickle=False` at runtime); tests
compare it with the original sklearn labels. The source profiles label all three clusters «Функциональный / аритмический
фенотип» and list the row index among key features, so the UI names each cluster by its centre (0 — АД выше среднего,
1 — АД ниже среднего, 2 — креатинин ↑, рСКФ ↓, ИМТ ↑), lists the six features that most separate it (service columns
excluded) and shows closeness to each centre. The example conclusion falls into cluster 1.
