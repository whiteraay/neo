/* Offline (no backend) stand-in for /api/maternal/labs/* — see docs/maternal_labs.md.
 * Keeps documents and observations in this tab's memory. Uploads are stored but not read (no OCR offline):
 * they open for manual entry next to the original. Rules mirror the server's draft thresholds. */
import { maternalStore } from './mock.js';

const n = (en, ru, kz) => ({ en, ru, kz });
export const CATALOG = [
  // complete blood count
  { code: 'hb', group: 'cbc', names: n('Haemoglobin (Hb)', 'Гемоглобин (Hb)', 'Гемоглобин (Hb)'), unit: 'g/L', kind: 'numeric', units: ['g/L', 'g/dL'] },
  { code: 'rbc', group: 'cbc', names: n('Red blood cells (RBC)', 'Эритроциты (RBC)', 'Эритроциттер (RBC)'), unit: '10^12/L', kind: 'numeric', units: ['10^12/L'] },
  { code: 'wbc', group: 'cbc', names: n('White blood cells (WBC)', 'Лейкоциты (WBC)', 'Лейкоциттер (WBC)'), unit: '10^9/L', kind: 'numeric', units: ['10^9/L'] },
  { code: 'plt', group: 'cbc', names: n('Platelets (PLT)', 'Тромбоциты (PLT)', 'Тромбоциттер (PLT)'), unit: '10^9/L', kind: 'numeric', units: ['10^9/L'] },
  { code: 'hct', group: 'cbc', names: n('Haematocrit (HCT)', 'Гематокрит (HCT)', 'Гематокрит (HCT)'), unit: '%', kind: 'numeric', units: ['%', 'L/L'] },
  { code: 'mcv', group: 'cbc', names: n('Mean cell volume (MCV)', 'Средний объём эритроцита (MCV)', 'Эритроциттің орташа көлемі (MCV)'), unit: 'fL', kind: 'numeric', units: ['fL'] },
  { code: 'rdw', group: 'cbc', names: n('Red cell distribution width (RDW)', 'Ширина распределения эритроцитов (RDW)', 'Эритроциттердің таралу ені (RDW)'), unit: '%', kind: 'numeric', units: ['%'] },
  // urine
  { code: 'urine_protein', group: 'urine', names: n('Urine protein', 'Белок в моче', 'Зәрдегі ақуыз'), unit: 'g/L', kind: 'numeric', units: ['g/L', 'mg/dL'] },
  { code: 'urine_wbc', group: 'urine', names: n('Urine white cells', 'Лейкоциты в моче', 'Зәрдегі лейкоциттер'), unit: '/HPF', kind: 'numeric', units: ['/HPF'] },
  { code: 'urine_rbc', group: 'urine', names: n('Urine red cells', 'Эритроциты в моче', 'Зәрдегі эритроциттер'), unit: '/HPF', kind: 'numeric', units: ['/HPF'] },
  { code: 'urine_nitrite', group: 'urine', names: n('Urine nitrites', 'Нитриты в моче', 'Зәрдегі нитриттер'), unit: '', kind: 'qualitative', units: [''] },
  { code: 'urine_sg', group: 'urine', names: n('Urine specific gravity', 'Удельный вес мочи', 'Зәрдің меншікті салмағы'), unit: '', kind: 'numeric', units: [''] },
  // biochemistry, thyroid
  { code: 'glucose', group: 'biochem', names: n('Glucose', 'Глюкоза', 'Глюкоза'), unit: 'mmol/L', kind: 'numeric', units: ['mmol/L', 'mg/dL'] },
  { code: 'creatinine', group: 'biochem', names: n('Creatinine', 'Креатинин', 'Креатинин'), unit: 'µmol/L', kind: 'numeric', units: ['µmol/L', 'mg/dL'] },
  { code: 'alt', group: 'biochem', names: n('ALT', 'АЛТ', 'АЛТ'), unit: 'U/L', kind: 'numeric', units: ['U/L'] },
  { code: 'ast', group: 'biochem', names: n('AST', 'АСТ', 'АСТ'), unit: 'U/L', kind: 'numeric', units: ['U/L'] },
  { code: 'ferritin', group: 'biochem', names: n('Ferritin', 'Ферритин', 'Ферритин'), unit: 'µg/L', kind: 'numeric', units: ['µg/L', 'ng/mL'] },
  { code: 'tsh', group: 'thyroid', names: n('TSH', 'ТТГ', 'ТТГ'), unit: 'mIU/L', kind: 'numeric', units: ['mIU/L', 'µIU/mL'] },
  { code: 'ft4', group: 'thyroid', names: n('Free T4', 'Свободный Т4', 'Бос Т4'), unit: 'pmol/L', kind: 'numeric', units: ['pmol/L'] },
  // glucose tolerance test
  { code: 'ogtt_0', group: 'ogtt', names: n('OGTT, fasting', 'ПГТТ, натощак', 'ПГТТ, аш қарынға'), unit: 'mmol/L', kind: 'numeric', units: ['mmol/L', 'mg/dL'] },
  { code: 'ogtt_1h', group: 'ogtt', names: n('OGTT, 1 hour', 'ПГТТ, через 1 час', 'ПГТТ, 1 сағаттан кейін'), unit: 'mmol/L', kind: 'numeric', units: ['mmol/L', 'mg/dL'] },
  { code: 'ogtt_2h', group: 'ogtt', names: n('OGTT, 2 hours', 'ПГТТ, через 2 часа', 'ПГТТ, 2 сағаттан кейін'), unit: 'mmol/L', kind: 'numeric', units: ['mmol/L', 'mg/dL'] },
  // examination
  { code: 'bp_sys', group: 'exam', names: n('Blood pressure, systolic', 'Давление, систолическое', 'Қысым, систолалық'), unit: 'mmHg', kind: 'numeric', units: ['mmHg'] },
  { code: 'bp_dia', group: 'exam', names: n('Blood pressure, diastolic', 'Давление, диастолическое', 'Қысым, диастолалық'), unit: 'mmHg', kind: 'numeric', units: ['mmHg'] },
  { code: 'weight', group: 'exam', names: n('Body weight', 'Масса тела', 'Дене салмағы'), unit: 'kg', kind: 'numeric', units: ['kg'] },
  // ultrasound
  { code: 'efw', group: 'ultrasound', names: n('Estimated fetal weight (EFW)', 'Предполагаемая масса плода (EFW)', 'Ұрықтың болжамды салмағы (EFW)'), unit: 'g', kind: 'numeric', units: ['g'] },
  { code: 'crl', group: 'ultrasound', names: n('Crown-rump length (CRL)', 'Копчико-теменной размер (КТР)', 'Құйымшақ-төбе өлшемі (CRL)'), unit: 'mm', kind: 'numeric', units: ['mm', 'cm'] },
  { code: 'nt', group: 'ultrasound', names: n('Nuchal translucency (NT)', 'Толщина воротникового пространства (ТВП)', 'Мойын кеңістігінің қалыңдығы (NT)'), unit: 'mm', kind: 'numeric', units: ['mm'] },
  { code: 'bpd', group: 'ultrasound', names: n('Biparietal diameter (BPD)', 'Бипариетальный размер (БПР)', 'Бипариеталды өлшем (BPD)'), unit: 'mm', kind: 'numeric', units: ['mm', 'cm'] },
  { code: 'hc', group: 'ultrasound', names: n('Head circumference (HC)', 'Окружность головы (ОГ)', 'Бас шеңбері (HC)'), unit: 'mm', kind: 'numeric', units: ['mm', 'cm'] },
  { code: 'ac', group: 'ultrasound', names: n('Abdominal circumference (AC)', 'Окружность живота (ОЖ)', 'Іш шеңбері (AC)'), unit: 'mm', kind: 'numeric', units: ['mm', 'cm'] },
  { code: 'fl', group: 'ultrasound', names: n('Femur length (FL)', 'Длина бедра (ДБ)', 'Сан сүйегінің ұзындығы (FL)'), unit: 'mm', kind: 'numeric', units: ['mm', 'cm'] },
  { code: 'afi', group: 'ultrasound', names: n('Amniotic fluid index (AFI)', 'Индекс амниотической жидкости (ИАЖ)', 'Амнион сұйықтығының индексі (AFI)'), unit: 'cm', kind: 'numeric', units: ['cm', 'mm'] },
];
const BY = Object.fromEntries(CATALOG.map((c) => [c.code, c]));

/* unit -> factor to the canonical unit, per test; anything else stays as entered and is flagged unconverted */
const CONVERT = {
  hb: { 'g/dL': 10 }, hct: { 'L/L': 100 }, urine_protein: { 'mg/dL': 0.01 }, creatinine: { 'mg/dL': 88.4 }, ferritin: { 'ng/mL': 1 }, tsh: { 'µIU/mL': 1 },
  glucose: { 'mg/dL': 1 / 18.016 }, ogtt_0: { 'mg/dL': 1 / 18.016 }, ogtt_1h: { 'mg/dL': 1 / 18.016 }, ogtt_2h: { 'mg/dL': 1 / 18.016 },
  crl: { cm: 10 }, bpd: { cm: 10 }, hc: { cm: 10 }, ac: { cm: 10 }, fl: { cm: 10 }, afi: { mm: 0.1 },
};
const round = (v) => Math.round(v * 100) / 100;
function toCanonical(code, value, unit) {
  const test = BY[code]; if (!test || value == null) return { value, unit, converted: false };
  if (unit === test.unit) return { value, unit, converted: false };
  const f = CONVERT[code]?.[unit];
  return f ? { value: round(value * f), unit: test.unit, converted: true } : { value, unit, converted: false };
}

const DAY = 86400000;
const iso = (d) => new Date(d).toISOString().slice(0, 10);
/* gestational age (days) at a date, from the pregnancy record: weeks × 7 minus days since the record was updated */
function gaAt(date) {
  const rec = maternalStore.get(); if (!rec?.gestational_age_wk || !date) return null;
  return Math.round(rec.gestational_age_wk * 7 - (new Date(rec.updated_at) - new Date(date)) / DAY);
}
const dateAtGa = (gaDays) => { const rec = maternalStore.get(); return iso(new Date(rec.updated_at).getTime() - (rec.gestational_age_wk * 7 - gaDays) * DAY); };

let seq = 0; const uid = (p) => `local-${p}-${++seq}`;
let docs = []; let obs = []; const files = {};

const obsOut = (o) => ({ ...o, gestational_age_days: gaAt(o.specimen_date) });
const docOut = (d) => ({ ...d, gestational_age_days: gaAt(d.specimen_date), observations: obs.filter((o) => o.document_id === d.id).map(obsOut) });

function mkObs(docId, row, status, date) {
  const conv = toCanonical(row.code, row.value ?? null, row.unit ?? BY[row.code]?.unit ?? '');
  return { id: uid('o'), document_id: docId, code: row.code, original_name: row.original_name || BY[row.code]?.names.ru || row.code, value: conv.value, value_text: row.value_text ?? null,
    unit: conv.unit, original_value: row.value != null ? String(row.value) : (row.value_text ?? ''), original_unit: row.unit ?? '', reference_range: row.reference_range ?? null,
    ...parseRange(row.reference_range), converted: conv.converted, confidence: row.confidence ?? 1, status, specimen_date: date, source_line: row.source_line ?? null };
}
function parseRange(r) {
  const m = String(r || '').replace(/,/g, '.').match(/(-?\d+(?:\.\d+)?)\s*[-–—]\s*(-?\d+(?:\.\d+)?)/);
  return m ? { ref_low: parseFloat(m[1]), ref_high: parseFloat(m[2]) } : { ref_low: null, ref_high: null };
}

/* ---------- demo data: fictional CBC report and a short history so offline charts are not empty ---------- */
const DEMO_ROWS = [
  { code: 'hb', original_name: 'Гемоглобин (HGB)', value: 124, unit: 'g/L', reference_range: '110 - 140', confidence: 0.97, source_line: 'Гемоглобин (HGB) 124 г/л 110 - 140' },
  { code: 'rbc', original_name: 'Эритроциты (RBC)', value: 4.2, unit: '10^12/L', reference_range: '3.5 - 5.0', confidence: 0.95, source_line: 'Эритроциты (RBC) 4,2 10^12/л 3,5 - 5,0' },
  { code: 'wbc', original_name: 'Лейкоциты (WBC)', value: 8.1, unit: '10^9/L', reference_range: '4.0 - 11.0', confidence: 0.95, source_line: 'Лейкоциты (WBC) 8,1 10^9/л 4,0 - 11,0' },
  { code: 'plt', original_name: 'Тромбоциты (PLT)', value: 245, unit: '10^9/L', reference_range: '150 - 400', confidence: 0.96, source_line: 'Тромбоциты (PLT) 245 10^9/л 150 - 400' },
  { code: 'hct', original_name: 'Гематокрит (HCT)', value: 37, unit: '%', reference_range: '33 - 44', confidence: 0.72, source_line: 'Гематокрит (HCT) 37 % 33 - 44' },
];
const DEMO_TEXT = 'ОБЩИЙ АНАЛИЗ КРОВИ (пример, вымышленные данные)\nЛаборатория: Демо-лаборатория\nДата забора: 12.03.2026\n\n' + DEMO_ROWS.map((r) => r.source_line).join('\n');

function seed() {
  const hist = [[70, 124, '110 - 140'], [140, 113, '110 - 140'], [210, 101, '110 - 140']];
  hist.forEach(([ga, hb, rr], i) => {
    const d = { id: uid('d'), filename: `oak_${i + 1}.pdf`, content_type: 'text/plain', size: 0, uploaded_at: new Date(dateAtGa(ga + 2)).toISOString(), laboratory: 'Демо-лаборатория', specimen_date: dateAtGa(ga), report_date: dateAtGa(ga + 1), status: 'verified', extraction: { method: 'text', message: null, confidence: 0.95 } };
    docs.push(d); files[d.id] = new Blob([`ОБЩИЙ АНАЛИЗ КРОВИ\nДата забора: ${d.specimen_date}\nГемоглобин (HGB) ${hb} г/л ${rr}`], { type: 'text/plain' });
    obs.push(mkObs(d.id, { code: 'hb', original_name: 'Гемоглобин (HGB)', value: hb, unit: 'g/L', reference_range: rr }, 'verified', d.specimen_date));
  });
  [[84, 112, 72], [140, 118, 76], [182, 126, 80], [208, 142, 92]].forEach(([ga, s, dd]) => {
    obs.push(mkObs(null, { code: 'bp_sys', value: s, unit: 'mmHg' }, 'manual', dateAtGa(ga)));
    obs.push(mkObs(null, { code: 'bp_dia', value: dd, unit: 'mmHg' }, 'manual', dateAtGa(ga)));
  });
  [[175, 'ogtt_0', 4.8], [175, 'ogtt_1h', 9.1], [175, 'ogtt_2h', 7.6]].forEach(([ga, code, v]) => obs.push(mkObs(null, { code, value: v, unit: 'mmol/L' }, 'manual', dateAtGa(ga))));
}
seed();

/* ---------- rules (docs/maternal_labs.md; draft thresholds) ---------- */
function alertsFor(series) {
  const out = []; const last = (c) => series[c]?.[series[c].length - 1];
  const push = (code, test, level, p, extra = {}) => out.push({ code, test, level, value: p.value, unit: p.unit, date: p.date, ga_days: p.ga_days, ...extra });
  const s = last('bp_sys'); const d = last('bp_dia');
  if ((s && s.value >= 160) || (d && d.value >= 110)) push('bp_severe', s && s.value >= 160 ? 'bp_sys' : 'bp_dia', 'urgent', s && s.value >= 160 ? s : d);
  else if ((s && s.value >= 140) || (d && d.value >= 90)) push('bp_high', s && s.value >= 140 ? 'bp_sys' : 'bp_dia', 'discuss', s && s.value >= 140 ? s : d);
  const up = last('urine_protein'); if (up && ((up.value != null && up.value >= 0.3) || /положит|позит|posit|\+/i.test(up.value_text || ''))) push('urine_protein', 'urine_protein', 'discuss', up);
  const hb = series.hb || []; const h = hb[hb.length - 1];
  if (h && h.value < 110) push('hb_low', 'hb', 'discuss', h);
  if (hb.length > 1 && hb[hb.length - 2].value - h.value >= 20) push('hb_drop', 'hb', 'discuss', h, { previous: hb[hb.length - 2].value, delta: round(h.value - hb[hb.length - 2].value) });
  const o0 = last('ogtt_0'); if (o0 && o0.value >= 5.1) push('glucose_fasting', 'ogtt_0', 'discuss', o0);
  const o1 = last('ogtt_1h'); if (o1 && o1.value >= 10.0) push('ogtt_1h', 'ogtt_1h', 'discuss', o1);
  const o2 = last('ogtt_2h'); if (o2 && o2.value >= 8.5) push('ogtt_2h', 'ogtt_2h', 'discuss', o2);
  const g = last('glucose'); if (g && g.value >= 7.0) push('glucose_high', 'glucose', 'discuss', g);
  const p = last('plt'); if (p && p.value < 100) push('plt_low', 'plt', 'discuss', p);
  const flagged = new Set(out.map((a) => a.test));
  for (const [code, pts] of Object.entries(series)) {
    const x = pts[pts.length - 1];
    if (!flagged.has(code) && x.value != null && ((x.ref_low != null && x.value < x.ref_low) || (x.ref_high != null && x.value > x.ref_high))) push('out_of_range', code, 'info', x);
  }
  const rank = { urgent: 0, discuss: 1, info: 2 };
  return out.sort((a, b) => rank[a.level] - rank[b.level]);
}

const err = (status, detail) => Object.assign(new Error(typeof detail === 'string' ? detail : JSON.stringify(detail)), { status, detail });
const today = () => iso(Date.now());

export const labsStore = {
  demoHistory(endDate) {
    if (!endDate || endDate > today() || endDate < '2000-04-01') throw err(422, 'Invalid date');
    let created = 0;
    const values = { hb: [124, 119, 113, 116], rbc: [4.2, 4.1, 4, 4.1], plt: [245, 238, 230, 242], glucose: [4.5, 4.7, 4.6, 4.8], bp_sys: [112, 116, 120, 118], bp_dia: [72, 75, 78, 76], weight: [60, 62, 64, 66], ferritin: [38, 32, 25, 30], tsh: [1.8, 2, 2.1, 1.9], urine_protein: [0.05, 0.07, 0.06, 0.05], bpd: [42, 52, 62, 72] };
    [84, 56, 28, 0].forEach((days, i) => {
      const date = iso(new Date(`${endDate}T12:00:00Z`).getTime() - days * DAY);
      if (docs.some((d) => d.demo && d.specimen_date === date)) return;
      const text = `DEMO: fictional data, not a medical report\n${date}\n` + Object.entries(values).map(([c, v]) => `${c}: ${v[i]} ${BY[c].unit}`).join('\n');
      const d = { id: uid('d'), demo: true, filename: `DEMO_history_${date}.txt`, content_type: 'text/plain', size: text.length, uploaded_at: new Date().toISOString(), laboratory: 'NeoOutcome DEMO', specimen_date: date, status: 'verified', extraction: { method: 'text', confidence: 1 } };
      docs.push(d); files[d.id] = new Blob([text], { type: 'text/plain' });
      Object.entries(values).forEach(([code, v]) => obs.push(mkObs(d.id, { code, value: v[i], unit: BY[code].unit }, 'verified', date)));
      created++;
    });
    return { created };
  },
  removeDemoHistory() {
    const ids = new Set(docs.filter((d) => d.demo).map((d) => d.id));
    docs = docs.filter((d) => !ids.has(d.id)); obs = obs.filter((o) => !ids.has(o.document_id));
    ids.forEach((id) => delete files[id]); return { deleted: ids.size };
  },
  catalog: () => ({ tests: CATALOG }),
  documents: () => [...docs].sort((a, b) => b.uploaded_at.localeCompare(a.uploaded_at)).map(docOut),
  async upload(file) {
    if (file.size > 10 * 1024 * 1024) throw err(413, 'File too large');
    const dup = docs.find((d) => d.filename === file.name && d.size === file.size);
    if (dup) throw err(409, { code: 'duplicate', document_id: dup.id });
    const d = { id: uid('d'), filename: file.name, content_type: file.type || 'application/octet-stream', size: file.size, uploaded_at: new Date().toISOString(), laboratory: null, specimen_date: null, report_date: null, status: 'needs_review', extraction: { method: 'none', message: 'no_text', confidence: 0 } };
    docs.push(d); files[d.id] = file;
    return docOut(d);
  },
  demo() {
    const d = { id: uid('d'), demo: true, source: 'demo', filename: 'sample_cbc.txt', content_type: 'text/plain', size: DEMO_TEXT.length, uploaded_at: new Date().toISOString(), laboratory: 'Демо-лаборатория', specimen_date: '2026-03-12', report_date: '2026-03-12', status: 'needs_review', extraction: { method: 'text', message: null, confidence: 0.91 } };
    docs.push(d); files[d.id] = new Blob([DEMO_TEXT], { type: 'text/plain' });
    DEMO_ROWS.forEach((r) => obs.push(mkObs(d.id, r, 'extracted', d.specimen_date)));
    return docOut(d);
  },
  text(id) { const d = docs.find((x) => x.id === id); if (!d) throw err(404, 'Not found'); d.extraction = { method: 'client_ocr', message: 'nothing_found', confidence: 0 }; return docOut(d); },
  fileUrl: (id) => (files[id] ? URL.createObjectURL(files[id]) : null),
  confirm(id) {
    const d = docs.find((x) => x.id === id); if (!d) throw err(404, 'Not found');
    if (d.status !== 'needs_review' || d.report) throw err(409, 'Already confirmed or reported');
    const mine = obs.filter((o) => o.document_id === id);
    if (!d.specimen_date || !mine.length) throw err(422, 'Nothing to confirm');
    mine.forEach((o) => { o.status = 'verified'; }); d.status = 'verified';
    return docOut(d);
  },
  report(id, comment) { const d = docs.find((x) => x.id === id); if (!d) throw err(404, 'Not found'); d.report = { comment: comment || '', at: new Date().toISOString() }; return docOut(d); },
  remove(id) { docs = docs.filter((d) => d.id !== id); obs = obs.filter((o) => o.document_id !== id); delete files[id]; return null; },
  addObservation(body) {
    if (!BY[body.code]) throw err(422, `Unknown test ${body.code}`);
    if (!body.specimen_date || body.specimen_date > today()) throw err(422, 'specimen_date is required and cannot be in the future');
    const o = mkObs(null, body, 'manual', body.specimen_date); obs.push(o); return obsOut(o);
  },
  removeObservation(id) { obs = obs.filter((o) => !(o.id === id && o.status === 'manual')); return null; },
  timeline() {
    const verified = obs.filter((o) => o.status !== 'extracted' && (o.document_id == null || docs.find((d) => d.id === o.document_id)?.status === 'verified'));
    const series = {};
    for (const o of verified) {
      const doc = docs.find((d) => d.id === o.document_id);
      (series[o.code] ||= []).push({ date: o.specimen_date, ga_days: gaAt(o.specimen_date), value: o.value, value_text: o.value_text, unit: o.unit, ref_low: o.ref_low, ref_high: o.ref_high, laboratory: doc?.laboratory ?? null, document_id: o.document_id, observation_id: o.id, manual: o.status === 'manual' });
    }
    for (const pts of Object.values(series)) pts.sort((a, b) => a.date.localeCompare(b.date));
    const vdocs = docs.filter((x) => x.status === 'verified');
    const last = vdocs.length ? vdocs.map((x) => x.uploaded_at).sort().pop() : null;
    return { gestational_age_today_days: gaAt(today()), last_verified_at: last, series, alerts: alertsFor(series) };
  },
};
