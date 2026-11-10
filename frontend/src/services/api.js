/**
 * REST client for the FastAPI backend with a transparent offline fallback.
 * `api.online` tells the UI which mode it is in.
 */
import * as mock from '../lib/mock.js';
import * as im from '../lib/intakeMock.js';
import { offlineOverlay } from '../lib/official.js';
import { labsStore } from '../lib/labsMock.js';

const BASE = import.meta.env.VITE_API_URL || '';
const TOKEN_KEY = 'neo.token';
let token = (() => { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } })();
let online = null; // null = unknown, true/false after first probe

async function request(path, { method = 'GET', body, form } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${BASE}${path}`, { method, headers, body: form || (body ? JSON.stringify(body) : undefined) });
  if (!res.ok) {
    let detail = res.statusText;
    try { detail = (await res.json()).detail || detail; } catch { /* ignore */ }
    const err = new Error(typeof detail === 'string' ? detail : JSON.stringify(detail));
    err.status = res.status;
    err.detail = detail; // structured detail, e.g. { code: 'duplicate', document_id } on a 409
    throw err;
  }
  return res.status === 204 ? null : res.json();
}

export async function probe() {
  if (online !== null) return online;
  try { await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(2500) }).then((r) => { if (!r.ok) throw new Error(); }); online = true; }
  catch { online = false; }
  return online;
}

export const api = {
  get online() { return online; },
  get token() { return token; },
  setToken(t) { token = t; try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ } },

  async hospitals() { return (await probe()) ? request('/api/auth/hospitals') : mock.HOSPITALS; },

  async login({ email, password, full_name, role, hospital_id }) {
    if (!(await probe())) {
      const hospital = mock.HOSPITALS.find((h) => h.id === hospital_id) || mock.HOSPITALS[0];
      return { access_token: null, user: { id: 'local', email, full_name, role, hospital } };
    }
    // accounts are issued by the hospital; a wrong password must not fall through to sign-up
    const r = await request('/api/auth/login/json', { method: 'POST', body: { email, password } });
    api.setToken(r.access_token); return r;
  },
  async me() { return request('/api/auth/me'); },
  logout() { api.setToken(null); },

  async patients() { return (await probe()) ? request('/api/patients') : mock.PATIENTS; },
  async vitals(patientId, hours = 24) { return (await probe()) ? request(`/api/patients/${patientId}/vitals?hours=${hours}`) : []; },

  async predict(patientId, overrides = {}, persist = true) {
    if (!(await probe())) return mock.mockPredict(patientId, overrides);
    return request('/api/predictions', { method: 'POST', body: { patient_id: patientId, overrides, persist } });
  },
  async predictions() { return (await probe()) ? request('/api/predictions') : []; },
  async review(predictionId, body) { return request(`/api/predictions/${predictionId}/review`, { method: 'POST', body }); },
  async reviewStats() { return (await probe()) ? request('/api/predictions/stats/review') : null; },

  async cvModels() { return (await probe()) ? request('/api/cv/models') : { gradcam_backend: 'client-canvas' }; },
  async analyzeImage(file, modality, target, alpha = 0.55) {
    const form = new FormData(); form.append('file', file); form.append('modality', modality); if (target != null) form.append('target', String(target)); form.append('alpha', String(alpha));
    return request('/api/cv/imaging/analyze', { method: 'POST', form });
  },

  async benchmarks() { return (await probe()) ? request('/api/integration/benchmarks') : mock.BENCHMARKS; },
  async schema() { return (await probe()) ? request('/api/integration/schema') : mock.SCHEMA; },
  async validateMapping(mapping) {
    if (!(await probe())) { const mapped = Object.values(mapping).filter(Boolean).length; return { mapped, total: 31, coverage: mapped / 31, valid: true, missing: [], duplicate_columns: [], unknown_columns: [] }; }
    return request('/api/integration/schema/validate', { method: 'POST', body: { mapping } });
  },
  async hisStatus() { return (await probe()) ? request('/api/integration/his/status') : null; },
  async hisConnect() { return request('/api/integration/his/connect', { method: 'POST' }); },
  async hisDisconnect() { return request('/api/integration/his/disconnect', { method: 'POST' }); },

  async regions() { if (await probe()) return request('/api/analytics/regions'); return { ...mock.REGIONS, regions: mock.REGIONS.regions.map((r) => ({ ...r, official: offlineOverlay(r.id) })), datasets: im.DATASETS_CATALOGUE.datasets, ashyq_national: im.DATASETS_CATALOGUE.ashyq_national }; },
  async regionTrends() { if (await probe()) return request('/api/analytics/regions/trends'); const { ASHYQ } = await import('../lib/official.js'); return { source_id: 'ashyq', years: [2020, 2021, 2022, 2023, 2024, 2025], national: ASHYQ.national, trends: ASHYQ.trends, regions: ASHYQ.regions }; },
  async regionForecast() { if (await probe()) return request('/api/analytics/regions/forecast'); return (await import('../lib/regional_bundle.json')).default; },
  async datasets() { return (await probe()) ? request('/api/analytics/datasets') : im.DATASETS_CATALOGUE; },
  async milestones() { return (await probe()) ? request('/api/analytics/milestones') : mock.MILESTONES; },

  // Portal 1 extras
  async timeline(patientId) { return (await probe()) ? request(`/api/predictions/timeline/${patientId}`) : mock.mockTimeline(patientId); },
  async tasks() { return (await probe()) ? request('/api/tasks') : mock.taskStore.list(); },
  async addTask(body) { return (await probe()) ? request('/api/tasks', { method: 'POST', body }) : mock.taskStore.add(body); },
  async toggleTask(id, done) { return (await probe()) ? request(`/api/tasks/${id}?done=${done}`, { method: 'PATCH' }) : mock.taskStore.toggle(id, done); },
  async deleteTask(id) { return (await probe()) ? request(`/api/tasks/${id}`, { method: 'DELETE' }) : mock.taskStore.remove(id); },

  // Portal 2 extras
  async audit(params = '') { return (await probe()) ? request(`/api/analytics/audit${params}`) : mock.AUDIT; },
  async modelQuality() { return (await probe()) ? request('/api/analytics/model-quality') : mock.QUALITY; },
  async economics(body) { return (await probe()) ? request('/api/analytics/economics', { method: 'POST', body }) : mock.mockEconomics(body); },

  // MLOps
  async provenance() { return (await probe()) ? request('/api/ml/provenance') : mock.PROVENANCE; },
  async mlStatus() { return (await probe()) ? request('/api/ml/status') : mock.mlops.status(); },
  async mlVersions() { return (await probe()) ? request('/api/ml/versions') : mock.mlops.versions(); },
  async mlDatasets() { return (await probe()) ? request('/api/ml/datasets') : mock.mlops.datasets(); },
  async retrain(body) { return (await probe()) ? request('/api/ml/retrain', { method: 'POST', body }) : mock.mlops.retrain(body); },
  async rollback(version, reason) { return (await probe()) ? request('/api/ml/rollback', { method: 'POST', body: { version, reason } }) : mock.mlops.rollback(version); },
  async uploadDataset(file, retrain = true) {
    if (!(await probe())) return mock.mlops.upload(file, retrain);
    const form = new FormData(); form.append('file', file);
    return request(`/api/ml/datasets/upload?retrain_now=${retrain}`, { method: 'POST', form });
  },

  // Intake (ported from the initial repository): admission model, bundle import, PDF card, appointments
  async admissionInfo() { return (await probe()) ? request('/api/predictions/admission/info') : im.ADMISSION_INFO; },
  async predictAdmission(features, patientId = null, persist = false) { return (await probe()) ? request('/api/predictions/admission', { method: 'POST', body: { features, patient_id: patientId, persist } }) : im.mockAdmission(features); },
  async intakeDemo() { return (await probe()) ? request('/api/intake/demo') : im.mockScoreBundle(im.SYNTHETIC_BUNDLE); },
  async intakePatientBundle(id) { return request(`/api/documents/patients/${encodeURIComponent(id)}/bundle`); },
  async documents() { if (!(await probe())) throw new Error('Для документов нужен сервер / Backend required'); return request('/api/documents'); },
  async queueDocument(body) { return request('/api/documents/generated', { method: 'POST', body }); },
  async uploadDocument({ file, patient_id, encounter_ref, document_at }) { const form = new FormData(); form.append('file', file); form.append('patient_id', patient_id); form.append('encounter_ref', encounter_ref); form.append('document_at', document_at); return request('/api/documents/upload', { method: 'POST', form }); },
  async signDocument(id, note) { return request(`/api/documents/${id}/sign`, { method: 'POST', body: { note } }); },
  async documentUrl(id) { const res = await fetch(`${BASE}/api/documents/${id}/pdf`, { headers: token ? { Authorization: `Bearer ${token}` } : {} }); if (!res.ok) throw new Error('Не удалось открыть PDF / Cannot open PDF'); return URL.createObjectURL(await res.blob()); },
  async intakeImport(file) {
    if (!(await probe())) return im.mockScoreBundle(im.parseBundleFile(file.name, await file.text()));
    const form = new FormData(); form.append('file', file);
    return request('/api/intake/import', { method: 'POST', form });
  },
  async intakeScore(bundle) { return (await probe()) ? request('/api/intake/score', { method: 'POST', body: { bundle } }) : im.mockScoreBundle(bundle); },
  /** Returns an object URL of the PDF card (null when offline). */
  async cardPdfUrl(bundle) {
    if (!(await probe())) return null;
    const headers = { 'Content-Type': 'application/json' }; if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`${BASE}/api/intake/card.pdf`, { method: 'POST', headers, body: JSON.stringify({ bundle }) });
    if (!res.ok) throw new Error('PDF generation failed');
    return URL.createObjectURL(await res.blob());
  },
  async patientCardUrl(patientId) {
    if (!(await probe())) return null;
    const headers = {}; if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`${BASE}/api/intake/patients/${patientId}/card.pdf`, { headers });
    if (!res.ok) throw new Error('PDF generation failed');
    return URL.createObjectURL(await res.blob());
  },
  async appointments(patientRef) { return (await probe()) ? request(`/api/intake/appointments${patientRef ? `?patient_ref=${encodeURIComponent(patientRef)}` : ''}`) : im.appointmentStore.list(); },
  async addAppointment(body) { return (await probe()) ? request('/api/intake/appointments', { method: 'POST', body }) : im.appointmentStore.add(body); },
  async patchAppointment(id, status) { return (await probe()) ? request(`/api/intake/appointments/${id}`, { method: 'PATCH', body: { status } }) : im.appointmentStore.patch(id, status); },

  // Portal 3
  async maternal() { return (await probe()) ? request('/api/maternal/me') : mock.maternalStore.get(); },
  async saveMaternal(body) { return (await probe()) ? request('/api/maternal/me', { method: 'PUT', body }) : mock.maternalStore.save(body); },
  async maternalScreen(body) { return (await probe()) ? request('/api/maternal/screen', { method: 'POST', body }) : mock.maternalScore(body); },
  async baby() { return (await probe()) ? request('/api/maternal/baby') : mock.BABY_LOG; },
  async babySummary() { return (await probe()) ? request('/api/maternal/baby/summary') : mock.BABY_SUMMARY; },
  // postpartum self-check; offline it lives only in this tab's memory
  async checkins() { return (await probe()) ? request('/api/maternal/checkins') : [...offlineCheckins]; },
  async addCheckin(body) {
    if (await probe()) return request('/api/maternal/checkins', { method: 'POST', body });
    const c = { id: `local-${Date.now()}`, ...body, created_at: new Date().toISOString(), urgent: body.flags.length > 0 };
    offlineCheckins.unshift(c); return c;
  },

  // Portal 3 · lab history (docs/maternal_labs.md). Offline: in-memory store in lib/labsMock.js
  async labCatalog() { return (await probe()) ? request('/api/maternal/labs/catalog') : labsStore.catalog(); },
  async labDocuments() { return (await probe()) ? request('/api/maternal/labs/documents') : labsStore.documents(); },
  async uploadLab(file) {
    if (!(await probe())) return labsStore.upload(file);
    const form = new FormData(); form.append('file', file);
    return request('/api/maternal/labs/documents', { method: 'POST', form });
  },
  async labAIStatus() { return (await probe()) ? request('/api/maternal/labs/ai/status') : { configured: false, model: null }; },
  async labAI(id, body) { return request(`/api/maternal/labs/documents/${id}/ai`, { method: 'POST', body }); },
  async labText(id, text) { return (await probe()) ? request(`/api/maternal/labs/documents/${id}/text`, { method: 'POST', body: { text, method: 'client_ocr' } }) : labsStore.text(id, text); },
  async labDemo(kind = 'cbc') { return (await probe()) ? request('/api/maternal/labs/demo', { method: 'POST', body: { kind } }) : labsStore.demo(); },
  /** Object URL of the original file (caller revokes it). */
  async labFileUrl(id) {
    if (!(await probe())) return labsStore.fileUrl(id);
    const headers = {}; if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`${BASE}/api/maternal/labs/documents/${id}/file`, { headers });
    if (!res.ok) { const err = new Error(res.statusText); err.status = res.status; throw err; }
    return URL.createObjectURL(await res.blob());
  },
  // She confirms the reading as it is, or reports a mismatch; values are never typed or edited by her.
  async confirmLab(id) { return (await probe()) ? request(`/api/maternal/labs/documents/${id}/confirm`, { method: 'POST' }) : labsStore.confirm(id); },
  async reportLab(id, comment) { return (await probe()) ? request(`/api/maternal/labs/documents/${id}/report`, { method: 'POST', body: { comment } }) : labsStore.report(id, comment); },
  // Doctor side: a mother cannot delete or change a document; her doctor can, with a reason (audited).
  // Support after birth (routers/family.py). Server only: answers and diary are personal data kept on the server.
  async epds() { return (await probe()) ? request('/api/maternal/epds') : []; },
  async addEpds(body) { if (!(await probe())) throw new Error('Нужен сервер / Requires the backend'); return request('/api/maternal/epds', { method: 'POST', body }); },
  async care(days = 7) { return (await probe()) ? request(`/api/maternal/care?days=${days}`) : { baby: {}, entries: [], days: [], hints: [] }; },
  async addCare(body) { if (!(await probe())) throw new Error('Нужен сервер / Requires the backend'); return request('/api/maternal/care', { method: 'POST', body }); },
  async deleteCare(id) { return request(`/api/maternal/care/${id}`, { method: 'DELETE' }); },
  async today() { return (await probe()) ? request('/api/maternal/today') : { baby: {}, tips: ['feed_cues', 'skin_to_skin', 'rest'] }; },
  async myQuestions() { return (await probe()) ? request('/api/maternal/questions') : []; },
  async ask(body) { if (!(await probe())) throw new Error('Нужен сервер / Requires the backend'); return request('/api/maternal/questions', { method: 'POST', body }); },
  async staffQuestions() { return request('/api/maternal/staff/questions'); },
  async answerQuestion(id, answer) { return request(`/api/maternal/staff/questions/${id}/answer`, { method: 'POST', body: { answer } }); },
  async staffEpds() { return request('/api/maternal/staff/epds'); },
  async staffEpdsSeen(id) { return request(`/api/maternal/staff/epds/${id}/seen`, { method: 'POST' }); },
  async staffMothers() { return request('/api/maternal/labs/staff/mothers'); },
  async staffMotherDocs(id) { return request(`/api/maternal/labs/staff/mothers/${id}/documents`); },
  async staffCorrect(id, body) { return request(`/api/maternal/labs/staff/documents/${id}`, { method: 'PUT', body }); },
  async staffDelete(id, reason) { return request(`/api/maternal/labs/staff/documents/${id}`, { method: 'DELETE', body: { reason } }); },
  async staffFileUrl(id) {
    const headers = {}; if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`${BASE}/api/maternal/labs/staff/documents/${id}/file`, { headers });
    if (!res.ok) { const err = new Error(res.statusText); err.status = res.status; throw err; }
    return URL.createObjectURL(await res.blob());
  },
  async addObservation(body) { return (await probe()) ? request('/api/maternal/labs/observations', { method: 'POST', body }) : labsStore.addObservation(body); },
  async deleteObservation(id) { return (await probe()) ? request(`/api/maternal/labs/observations/${id}`, { method: 'DELETE' }) : labsStore.removeObservation(id); },
  async labTimeline() { return (await probe()) ? request('/api/maternal/labs/timeline') : labsStore.timeline(); },
  async hypertension(arm) { if (!(await probe())) throw new Error('CardioAI requires the backend / Для CardioAI нужен сервер'); return request(`/api/maternal/labs/hypertension?arm=${encodeURIComponent(arm)}`); },
  async labDemoHistory(end_date) { return (await probe()) ? request('/api/maternal/labs/demo/history', { method: 'POST', body: { end_date } }) : labsStore.demoHistory(end_date); },
  // De-identified real example documents (backend/data/examples). Server only: the files live there.
  async labExamples() { return (await probe()) ? request('/api/maternal/labs/examples') : []; },
  async addAllLabExamples() { if (!(await probe())) throw new Error('Примеры доступны только с сервером / Examples require the backend'); return request('/api/maternal/labs/examples', { method: 'POST' }); },
  async addLabExample(key) { if (!(await probe())) throw new Error('Примеры доступны только с сервером / Examples require the backend'); return request(`/api/maternal/labs/examples/${encodeURIComponent(key)}`, { method: 'POST' }); },
  // CardioAI on a cardiology conclusion (.docx). The uploaded file is read in memory and not stored.
  // variant: original (de-identified 1.docx) | normal | ag1 | ag2 | ag3 (generated in the same template); seed picks the data
  async cardioExample(variant = 'original', seed) { if (!(await probe())) throw new Error('CardioAI requires the backend / Для CardioAI нужен сервер'); return request(`/api/maternal/labs/cardioai/example?variant=${variant}${seed != null ? `&seed=${seed}` : ''}`); },
  async cardioConclusion(file) {
    if (!(await probe())) throw new Error('CardioAI requires the backend / Для CardioAI нужен сервер');
    const form = new FormData(); form.append('file', file);
    return request('/api/maternal/labs/cardioai/conclusion', { method: 'POST', form });
  },
  async cardioExampleFile(variant = 'original', seed = 1) {
    const headers = {}; if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`${BASE}/api/maternal/labs/cardioai/example.docx?variant=${variant}&seed=${seed}`, { headers });
    if (!res.ok) { const err = new Error(res.statusText); err.status = res.status; throw err; }
    return URL.createObjectURL(await res.blob());
  },
  // Fetal head circumference (HC18 U-Net). Images are processed in memory and not stored.
  async hcInfo() { return (await probe()) ? request('/api/maternal/labs/hc/info') : { ready: false }; },
  async hcSamples() { return (await probe()) ? request('/api/maternal/labs/hc/samples') : []; },
  async hcMeasure({ file, sample, pixelSize }) {
    if (!(await probe())) throw new Error('Нужен сервер / Requires the backend');
    const form = new FormData(); if (file) form.append('file', file); if (sample) form.append('sample', sample); if (pixelSize) form.append('pixel_size_mm', String(pixelSize));
    return request('/api/maternal/labs/hc/measure', { method: 'POST', form });
  },
  async removeLabDemoHistory() { return (await probe()) ? request('/api/maternal/labs/demo/history', { method: 'DELETE' }) : labsStore.removeDemoHistory(); },
};
const offlineCheckins = [];
