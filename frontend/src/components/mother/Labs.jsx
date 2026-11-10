/* «Мои анализы»: upload a lab report, check what was read against the original, confirm. docs/maternal_labs.md */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Upload, Camera, FileText, Trash2, Plus, Check, ArrowLeft, Sparkles, ScanText, AlertTriangle, Info, FolderOpen, Image as ImageIcon } from 'lucide-react';
import { Card, Badge } from '../../lib/ui.jsx';
import { useT } from '../../lib/i18n.jsx';
import { dateLocale } from '../../lib/official.js';
import { api } from '../../services/api.js';
import LabAI from './LabAI.jsx';

const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPT = '.pdf,.jpg,.jpeg,.png,.webp,.txt,application/pdf,image/jpeg,image/png,image/webp,text/plain';
const LOW_CONFIDENCE = 0.8;
const GROUPS = ['cbc', 'urine', 'biochem', 'thyroid', 'ogtt', 'exam', 'ultrasound', 'pelvis'];
const isImage = (type) => /^image\//.test(type || '');
const DEMO_KINDS = ['cbc', 'biochem', 'ogtt', 'thyroid', 'urine', 'fetal_us', 'pelvic_us'];

export const fmtDate = (d, lang) => (d ? new Date(d.length === 10 ? `${d}T00:00:00` : d).toLocaleDateString(dateLocale(lang)) : '—');
export const fmtGa = (days, t) => (days == null ? '—' : t('lab.gaFmt', { w: Math.floor(days / 7), d: days % 7 }));
export const testName = (catalog, code, lang) => catalog?.find((c) => c.code === code)?.names?.[lang] || catalog?.find((c) => c.code === code)?.names?.en || code;
export const unitLabel = (u, tx) => (u ? tx(u) : '');

/** Browser OCR (Tesseract.js) for photos when the server has no OCR engine. Loaded only when needed. */
async function browserOcr(blob, onProgress) {
  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker(['rus', 'eng'], 1, { logger: (m) => { if (m.status === 'recognizing text') onProgress?.(Math.round(m.progress * 100)); } });
  try { const { data } = await worker.recognize(blob); return data.text || ''; } finally { await worker.terminate(); }
}

function StatusBadge({ status }) {
  const { t } = useT();
  return status === 'verified' ? <Badge tone="low"><Check size={11} />{t('lab.status.verified')}</Badge> : <Badge tone="primary">{t('lab.status.needs_review')}</Badge>;
}

/* ---------- original document preview ---------- */
function Original({ doc }) {
  const { t } = useT();
  const [url, setUrl] = useState(null); const [text, setText] = useState(null); const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true; let made = null; setUrl(null); setText(null); setFailed(false);
    api.labFileUrl(doc.id).then(async (u) => {
      if (!alive) { if (u) URL.revokeObjectURL(u); return; }
      made = u; if (!u) { setFailed(true); return; }
      if (/^text\//.test(doc.content_type)) setText(await fetch(u).then((r) => r.text()).catch(() => ''));
      setUrl(u);
    }).catch(() => alive && setFailed(true));
    return () => { alive = false; if (made) URL.revokeObjectURL(made); };
  }, [doc.id, doc.content_type]);
  if (failed) return <div className="muted text-sm p-4">{t('lab.originalMissing')}</div>;
  if (!url) return <div className="muted text-sm p-4">{t('loading')}</div>;
  if (isImage(doc.content_type)) return <img src={url} alt={doc.filename} className="w-full rounded-md border border-line object-contain max-h-[70vh] bg-white" />;
  if (text != null) return <pre className="mono text-xs whitespace-pre-wrap rounded-md border border-line bg-white p-3 max-h-[70vh] overflow-auto">{text}</pre>;
  return <iframe src={url} title={doc.filename} className="w-full h-[70vh] rounded-md border border-line bg-white" />;
}

/* ---------- descriptive part of an imaging report (conclusion, findings) ---------- */
export function StudySummary({ summary }) {
  const { t, lang } = useT();
  return <Card title={t('lab.studySummary')} sub={summary.study}>
    <div className="grid gap-2 text-sm">
      {summary.conclusion && <div><span className="muted">{t('lab.conclusion')}:</span> <strong>{summary.conclusion}</strong></div>}
      {summary.findings?.length > 0 && <ul className="list-disc pl-5 grid gap-0.5">{summary.findings.map((x) => <li key={x}>{x}</li>)}</ul>}
      {summary.last_menstruation && <div><span className="muted">{t('lab.lmp')}:</span> {fmtDate(summary.last_menstruation, lang)}</div>}
      {summary.recommendation && <div><span className="muted">{t('lab.recommendation')}:</span> {summary.recommendation}</div>}
      <p className="muted text-xs flex gap-1.5"><Info size={13} className="shrink-0 mt-0.5" />{t('lab.summaryNote')}</p>
    </div>
  </Card>;
}

/* ---------- example documents (backend/data/examples): one action adds the whole series ---------- */
function Examples({ onAdded, onOpen, busy, setBusy, setError }) {
  const { t, lang } = useT();
  const [list, setList] = useState(null);
  const refresh = () => api.labExamples().then(setList).catch(() => setList([]));
  useEffect(() => { refresh(); }, []);
  if (!list || list.length === 0) return null;
  const groups = [['cbc', FileText, 'lab.ex.cbc'], ['biochem', ImageIcon, 'lab.ex.biochem'], ['thyroid', FileText, 'lab.ex.thyroid'], ['urine', FileText, 'lab.ex.urine'], ['pelvis', FileText, 'lab.ex.pelvic']].map(([g, I, key]) => {
    const items = list.filter((x) => x.group === g).sort((x, y) => x.date.localeCompare(y.date));
    return { g, I, key, items, added: items.filter((x) => x.document_id).length };
  }).filter((x) => x.items.length);
  const missing = list.filter((x) => !x.document_id).length;
  const addAll = async () => { setBusy(true); setError(null); try { await api.addAllLabExamples(); await refresh(); onAdded(); } catch (e) { setError(e.message); } finally { setBusy(false); } };
  return <Card title={<span className="flex items-center gap-2"><FolderOpen size={16} />{t('lab.ex.title')}</span>} sub={t('lab.ex.sub')}
    right={missing ? <button type="button" className="btn btn-primary text-xs" disabled={busy} onClick={addAll}><Plus size={14} />{t('lab.ex.addAll', { n: missing })}</button> : <Badge tone="low"><Check size={11} />{t('lab.ex.allAdded')}</Badge>}>
    <div className="grid gap-2 sm:grid-cols-2">{groups.map(({ g, I, key, items, added }) => (
      <div key={g} className="rounded-xl border border-line p-3 flex gap-3">
        <I size={18} className="muted shrink-0 mt-0.5" />
        <div className="min-w-0"><div className="font-semibold text-sm">{t(key)}</div>
          <div className="muted text-xs">{t('lab.ex.range', { n: items.length, from: fmtDate(items[0].date, lang), to: fmtDate(items[items.length - 1].date, lang) })} · {t('lab.ex.added', { n: added })}</div></div>
      </div>))}</div>
    {/* the two real, de-identified documents: one click to open them */}
    {list.some((x) => ['biochem_photo', 'pelvic_us'].includes(x.key) && x.document_id) && <div className="mt-3 border-t border-line pt-3 grid gap-2">
      <div className="text-xs muted">{t('lab.ex.realTitle')}</div>
      <div className="flex flex-wrap gap-2">{[['biochem_photo', ImageIcon, 'lab.ex.realOlymp'], ['pelvic_us', FileText, 'lab.ex.realUs']].map(([k, I, label]) => { const ex = list.find((x) => x.key === k); return ex?.document_id &&
        <button key={k} type="button" className="btn text-xs" onClick={() => onOpen(ex.document_id)}><I size={14} />{t(label)}</button>; })}</div>
    </div>}
  </Card>;
}

/* ---------- check against the original (read-only) ----------
   She does not type or change values: what reaches the timeline comes from the document itself. She can confirm that
   the reading matches the original, or report a mismatch (then nothing from this document is charted). */
function Review({ doc, catalog, onBack, onChanged }) {
  const { t, tx, lang } = useT();
  const [busy, setBusy] = useState(false); const [error, setError] = useState(null); const [ocr, setOcr] = useState(null);
  const [reporting, setReporting] = useState(false); const [comment, setComment] = useState('');
  useEffect(() => { setError(null); setReporting(false); setComment(''); }, [doc.id]);
  const rows = doc.observations;
  const pending = doc.status === 'needs_review';
  const canConfirm = pending && !doc.report && !!doc.specimen_date && rows.length > 0 && !busy;

  const act = async (fn) => { setBusy(true); setError(null); try { onChanged(await fn()); } catch (e) { setError(e.detail?.code ? t(`lab.err.${e.detail.code}`) : (e.message || t('lab.err.generic'))); } finally { setBusy(false); } };
  const runOcr = async () => {
    setOcr(0); setError(null);
    try {
      const u = await api.labFileUrl(doc.id); const blob = await fetch(u).then((r) => r.blob()); URL.revokeObjectURL(u);
      const text = await browserOcr(blob, setOcr);
      onChanged(await api.labText(doc.id, text));
    } catch (e) { setError(t('lab.err.ocr')); } finally { setOcr(null); }
  };

  const msg = doc.extraction?.message;
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn" onClick={onBack}><ArrowLeft size={14} />{t('lab.back')}</button>
        <div className="min-w-0 flex-1 truncate font-semibold text-sm">{doc.filename}</div>
        {doc.report ? <Badge tone="high">{t('lab.status.reported')}</Badge> : <StatusBadge status={doc.status} />}
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <Card title={t('lab.original')} sub={doc.example ? t('lab.exampleOriginal') : doc.demo ? t('lab.demoOriginal') : t('lab.originalSub')} right={<Badge tone={doc.demo || doc.example ? 'moderate' : 'primary'}>{doc.example ? t('lab.exampleBadge') : doc.demo ? t('lab.demoBadge') : t('lab.uploadBadge')}</Badge>}><div className="font-semibold text-xs mb-2 break-all">{doc.filename}</div><Original doc={doc} /></Card>
        <Card title={t('lab.extracted')} sub={pending ? t('lab.readonlySub') : t('lab.verifiedSub')} right={doc.extraction?.method && doc.extraction.method !== 'none' ? <Badge>{t(`lab.method.${doc.extraction.method}`)}</Badge> : null}>
          {pending && rows.length === 0 && isImage(doc.content_type) && (
            <div className="rounded-md border border-line p-3 mb-3 text-sm flex flex-wrap items-center gap-3" style={{ background: '#F3F1EA' }}>
              <ScanText size={16} /><span className="flex-1 min-w-[200px]">{t(msg === 'ocr_unavailable' ? 'lab.msg.ocr_unavailable' : 'lab.msg.tryBrowserOcr')}</span>
              <button type="button" className="btn btn-primary" disabled={ocr != null} onClick={runOcr}>{ocr != null ? t('lab.ocrProgress', { n: ocr }) : t('lab.ocrRun')}</button>
            </div>)}
          {(msg === 'no_text' || msg === 'nothing_found' || (msg === 'ocr_unavailable' && !isImage(doc.content_type))) && rows.length === 0 && (
            <div className="rounded-md border border-line p-3 mb-3 text-sm flex gap-2" style={{ background: '#F3F1EA' }}><Info size={16} className="shrink-0 mt-0.5" />{t(`lab.msg.${msg === 'ocr_unavailable' ? 'scan' : msg}`)}</div>)}

          <dl className="grid sm:grid-cols-2 gap-3 mb-3 text-sm">
            <div><dt className="muted text-xs">{t('lab.specimenDate')}</dt><dd className="font-semibold">{doc.specimen_date ? fmtDate(doc.specimen_date, lang) : <span style={{ color: '#B45309' }}>{t('lab.dateNotFound')}</span>}</dd></div>
            <div><dt className="muted text-xs">{t('lab.laboratory')}</dt><dd className="font-semibold">{doc.laboratory || '—'}</dd></div>
          </dl>

          {rows.length > 0 && <div className="overflow-x-auto">
            <table className="table text-sm">
              <thead><tr><th>{t('lab.col.test')}</th><th>{t('lab.col.value')}</th><th>{t('lab.col.range')}</th><th>{t('lab.asPrinted')}</th></tr></thead>
              <tbody>{rows.map((o) => (
                <tr key={o.id} style={pending && o.confidence < LOW_CONFIDENCE ? { background: '#FEF3C7' } : undefined}>
                  <td>{testName(catalog, o.code, lang)}</td>
                  <td className="mono">{o.value ?? (o.value_text ? t(`lab.qual.${o.value_text}`) : '—')} {unitLabel(o.unit, tx)}</td>
                  <td className="mono">{o.reference_range || '—'}</td>
                  <td className="muted text-xs" title={o.source_line || ''}>{o.original_name || ''}{o.converted ? ` · ${t('lab.convertedFrom', { v: o.original_value, u: unitLabel(o.original_unit, tx) })}` : ''}</td>
                </tr>))}</tbody>
            </table>
          </div>}
          {rows.length === 0 && <div className="muted text-sm py-3">{t('lab.noRows')}</div>}

          {pending && !doc.report && <>
            <div className="flex flex-wrap items-center gap-2 mt-4">
              <button type="button" className="btn btn-primary" disabled={!canConfirm} onClick={() => act(() => api.confirmLab(doc.id))}><Check size={14} />{t('lab.confirmMatch')}</button>
              {!reporting && <button type="button" className="btn" disabled={busy} onClick={() => setReporting(true)}><AlertTriangle size={14} />{t('lab.reportBtn')}</button>}
            </div>
            {!canConfirm && !busy && <p className="text-xs mt-2" style={{ color: '#B45309' }}>{t(!doc.specimen_date ? 'lab.cantConfirmDate' : 'lab.cantConfirmValues')}</p>}
            {reporting && <div className="grid gap-2 mt-3">
              <label className="text-xs"><span className="muted block">{t('lab.reportHint')}</span><textarea rows={2} maxLength={500} className="input mt-1" value={comment} onChange={(e) => setComment(e.target.value)} /></label>
              <div className="flex gap-2"><button type="button" className="btn btn-primary" disabled={busy} onClick={() => act(() => api.reportLab(doc.id, comment))}>{t('lab.reportSend')}</button><button type="button" className="btn" onClick={() => setReporting(false)}>{t('lab.cancel')}</button></div>
            </div>}
          </>}
          {doc.report && <p className="text-sm mt-3 flex gap-1.5" style={{ color: '#B45309' }}><AlertTriangle size={15} className="shrink-0 mt-0.5" />{t('lab.reportedNote')}{doc.report.comment ? ` «${doc.report.comment}»` : ''}</p>}
          {error && <div className="text-sm mt-2" style={{ color: '#C62828' }}>{error}</div>}
          <p className="muted text-xs mt-3 flex gap-1.5"><Info size={13} className="shrink-0 mt-0.5" />{t('lab.readonlyNote')}</p>
        </Card>
      </div>
      {doc.summary && <StudySummary summary={doc.summary} />}
      <LabAI doc={doc} onChanged={onChanged} busy={busy} setBusy={setBusy} />
    </div>
  );
}

/* ---------- page ---------- */
export default function Labs({ openId = null }) {
  const { t, lang } = useT();
  const [catalog, setCatalog] = useState(null); const [docs, setDocs] = useState(null); const [sel, setSel] = useState(openId);
  const [busy, setBusy] = useState(false); const [ocr, setOcr] = useState(null); const [error, setError] = useState(null); const [drag, setDrag] = useState(false);
  const fileRef = useRef(null); const camRef = useRef(null);
  const load = () => api.labDocuments().then(setDocs).catch((e) => { setDocs([]); setError(e.message); });
  useEffect(() => { api.labCatalog().then((c) => setCatalog(c.tests)).catch(() => setCatalog([])); load(); }, []);

  const replace = (d) => setDocs((ds) => [d, ...(ds || []).filter((x) => x.id !== d.id)]);

  const handle = async (file) => {
    setError(null);
    if (!file) return;
    if (file.size > MAX_BYTES) { setError(t('lab.err.tooLarge')); return; }
    if (!/\.(pdf|jpe?g|png|webp|txt)$/i.test(file.name) && !/^(image\/(jpeg|png|webp)|application\/pdf|text\/plain)$/.test(file.type)) { setError(t('lab.err.type')); return; }
    setBusy(true);
    try {
      let d = await api.uploadLab(file);
      if (d.extraction?.message === 'ocr_unavailable' && isImage(file.type)) {
        setOcr(0);
        try { d = await api.labText(d.id, await browserOcr(file, setOcr)); } catch { /* she can still enter values by hand */ } finally { setOcr(null); }
      }
      replace(d); setSel(d.id);
    } catch (e) {
      if (e.status === 409 && e.detail?.document_id) { await load(); setSel(e.detail.document_id); setError(t('lab.err.duplicate')); }
      else setError(e.status === 413 ? t('lab.err.tooLarge') : e.status === 415 ? t('lab.err.type') : (e.message || t('lab.err.generic')));
    } finally { setBusy(false); }
  };
  const [demoOpen, setDemoOpen] = useState(false);
  const demo = async (kind) => { setDemoOpen(false); setBusy(true); setError(null); try { const d = await api.labDemo(kind); replace(d); setSel(d.id); } catch (e) { setError(e.message); } finally { setBusy(false); } };

  const current = docs?.find((d) => d.id === sel);
  if (current) return <Review key={current.id} doc={current} catalog={catalog} onBack={() => setSel(null)} onChanged={replace} />;

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
      <div className="grid gap-4 self-start min-w-0">
        <Card title={<span className="flex items-center gap-2"><Upload size={16} />{t('lab.uploadTitle')}</span>} sub={t('lab.uploadSub')}>
          <div className={`rounded-md border-2 border-dashed p-6 text-center transition-colors ${drag ? 'border-primary' : 'border-line-strong'}`} style={drag ? { background: '#EAF4F4' } : undefined}
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={(e) => { e.preventDefault(); setDrag(false); handle(e.dataTransfer.files?.[0]); }}>
            <FileText size={28} className="mx-auto muted" />
            <div className="text-sm mt-2">{t('lab.drop')}</div>
            <div className="muted text-xs mt-1">{t('lab.formats')}</div>
            <div className="flex flex-wrap justify-center gap-2 mt-4">
              <button type="button" className="btn btn-primary" disabled={busy} onClick={() => fileRef.current?.click()}><Upload size={14} />{t('lab.choose')}</button>
              <button type="button" className="btn" disabled={busy} onClick={() => camRef.current?.click()}><Camera size={14} />{t('lab.photo')}</button>
            </div>
            <input ref={fileRef} type="file" accept={ACCEPT} className="hidden" onChange={(e) => { handle(e.target.files?.[0]); e.target.value = ''; }} />
            <input ref={camRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { handle(e.target.files?.[0]); e.target.value = ''; }} />
          </div>
          <div className="mt-4 border-t border-line pt-3 flex flex-wrap items-center gap-3"><span className="muted text-xs flex-1">{t('lab.demoHint')}</span><div className="relative">
            <button type="button" className="btn text-xs" disabled={busy} aria-expanded={demoOpen} onClick={() => setDemoOpen((o) => !o)}><Sparkles size={14} />{t('lab.demo')}</button>
            {demoOpen && <div className="absolute right-0 bottom-full mb-2 z-20 card p-2 grid gap-1 w-72 shadow-lg" role="menu">
              <div className="muted text-xs px-2 py-1">{t('lab.demoPick')}</div>
              {DEMO_KINDS.map((k) => <button key={k} type="button" role="menuitem" className="text-left text-sm rounded-md px-2 py-1.5 hover:bg-[#EAF4F4]" onClick={() => demo(k)}>{t(`lab.demoKind.${k}`)}</button>)}
            </div>}
          </div></div>
          {busy && <div className="muted text-sm mt-3">{ocr != null ? t('lab.ocrProgress', { n: ocr }) : t('lab.reading')}</div>}
          {error && <div className="text-sm mt-3 flex gap-1.5" style={{ color: '#C62828' }}><AlertTriangle size={15} className="shrink-0 mt-0.5" />{error}</div>}
        </Card>

        <Examples busy={busy} setBusy={setBusy} setError={setError} onAdded={load} onOpen={(id) => setSel(id)} />

        <Card title={t('lab.myDocs')} sub={docs ? t('lab.docsCount', { n: docs.length }) : ''} right={<span className="muted text-xs flex items-center gap-1 max-w-[320px] text-right"><Info size={13} className="shrink-0" />{t('lab.viaDoctor')}</span>}>
          {!docs ? <div className="muted text-sm">{t('loading')}</div> : docs.length === 0 ? <div className="muted text-sm">{t('lab.noDocs')}</div> : (
            <div className="grid gap-2">{docs.map((d) => (
              <div key={d.id} className="card p-3 flex flex-wrap items-center gap-3">
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setSel(d.id)}>
                  <div className="font-semibold text-sm truncate">{d.filename}</div>
                  <div className="muted text-xs">{d.laboratory ? `${d.laboratory} · ` : ''}{d.specimen_date ? `${t('lab.taken')} ${fmtDate(d.specimen_date, lang)}` : t('lab.noDate')}{d.gestational_age_days != null ? ` · ${fmtGa(d.gestational_age_days, t)}` : ''} · {t('lab.values', { n: d.observations.length })}</div>
                </button>
                {d.example && <Badge tone="moderate">{t('lab.exampleBadge')}</Badge>}
                {d.report ? <Badge tone="high">{t('lab.status.reported')}</Badge> : d.status !== 'verified' && <StatusBadge status={d.status} />}
                <button type="button" className="btn py-1 px-2 text-xs" onClick={() => setSel(d.id)}>{t('lab.open')}</button>
              </div>))}</div>)}
        </Card>
      </div>

      <div className="grid gap-4 self-start">
        <Card title={t('lab.howTitle')}>
          <ol className="grid gap-2 text-sm list-decimal pl-5">{[1, 2, 3, 4].map((i) => <li key={i}>{t(`lab.how${i}`)}</li>)}</ol>
        </Card>
        <Card title={t('lab.privacyTitle')}><p className="text-sm">{t('lab.privacy')}</p></Card>
      </div>
    </div>
  );
}
