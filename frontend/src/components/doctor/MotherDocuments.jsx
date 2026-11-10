/* Doctor portal · mothers' lab documents. A mother cannot delete or change a document; when a reading is wrong (she can
   report it) or a file must be removed, her doctor corrects or deletes it here. Every change needs a reason, keeps the
   previous values in the document history and is written to the audit trail. Mothers of the doctor's hospital only. */
import { useEffect, useMemo, useState } from 'react';
import { FileText, AlertTriangle, Save, Trash2, History, ArrowLeft } from 'lucide-react';
import { Card, Badge } from '../../lib/ui.jsx';
import { useT } from '../../lib/i18n.jsx';
import { api } from '../../services/api.js';
import { fmtDate, testName, unitLabel } from '../mother/Labs.jsx';

function Original({ doc }) {
  const [url, setUrl] = useState(null);
  useEffect(() => { let made = null; let alive = true; api.staffFileUrl(doc.id).then((u) => { if (alive) { made = u; setUrl(u); } else URL.revokeObjectURL(u); }).catch(() => {}); return () => { alive = false; if (made) URL.revokeObjectURL(made); }; }, [doc.id]);
  if (!url) return <div className="muted text-sm p-4">…</div>;
  if (/^image\//.test(doc.content_type)) return <img src={url} alt={doc.filename} className="w-full rounded-md border border-line bg-white" />;
  return <iframe src={url} title={doc.filename} className="w-full h-[70vh] rounded-md border border-line bg-white" />;
}

function Editor({ doc, catalog, onDone, L }) {
  const { tx, lang } = useT();
  const [rows, setRows] = useState(() => doc.observations.map((o) => ({ code: o.code, value: o.value ?? '', value_text: o.value_text ?? '', unit: o.unit, reference_range: o.reference_range ?? '' })));
  const [date, setDate] = useState(doc.specimen_date || ''); const [reason, setReason] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const byCode = useMemo(() => Object.fromEntries((catalog || []).map((c) => [c.code, c])), [catalog]);
  const set = (i, patch) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const okReason = reason.trim().length >= 5;
  const save = async () => {
    setBusy(true); setError('');
    try {
      await api.staffCorrect(doc.id, { reason, specimen_date: date, observations: rows.map((r) => { const qual = byCode[r.code]?.kind === 'qualitative'; return { code: r.code, value: qual ? null : parseFloat(String(r.value).replace(',', '.')), value_text: qual ? r.value_text : null, unit: r.unit, reference_range: r.reference_range || null }; }) });
      onDone();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  const remove = async () => { if (!window.confirm(L(`Удалить «${doc.filename}» из истории мамы?`, `Delete "${doc.filename}" from the mother's history?`, `«${doc.filename}» анасының тарихынан жою керек пе?`))) return; setBusy(true); setError(''); try { await api.staffDelete(doc.id, reason); onDone(); } catch (e) { setError(e.message); } finally { setBusy(false); } };
  return <div className="grid gap-3">
    {doc.report && <div className="rounded-md border p-3 text-sm flex gap-2" style={{ borderColor: '#FCD34D', background: '#FEF3C7', color: '#92400E' }}><AlertTriangle size={16} className="shrink-0 mt-0.5" />{L('Мама сообщила о неточности', 'The mother reported a mismatch', 'Ана қате туралы хабарлады')}{doc.report.comment ? `: «${doc.report.comment}»` : ''}</div>}
    <label className="text-xs w-48"><span className="muted block">{L('Дата забора', 'Sample date', 'Алу күні')}</span><input type="date" className="input py-1.5" value={date} onChange={(e) => setDate(e.target.value)} /></label>
    <div className="overflow-x-auto"><table className="table text-sm">
      <thead><tr><th>{L('Показатель', 'Test', 'Көрсеткіш')}</th><th>{L('Значение', 'Value', 'Мәні')}</th><th>{L('Ед.', 'Unit', 'Бірл.')}</th><th>{L('Референс', 'Reference', 'Референс')}</th></tr></thead>
      <tbody>{rows.map((r, i) => <tr key={r.code}>
        <td>{testName(catalog, r.code, lang)}</td>
        <td>{byCode[r.code]?.kind === 'qualitative' ? <input className="input py-1 w-32" value={r.value_text} onChange={(e) => set(i, { value_text: e.target.value })} /> : <input className="input mono py-1 w-24" inputMode="decimal" value={r.value} onChange={(e) => set(i, { value: e.target.value })} />}</td>
        <td className="muted">{unitLabel(r.unit, tx) || '—'}</td>
        <td><input className="input mono py-1 w-28" value={r.reference_range} onChange={(e) => set(i, { reference_range: e.target.value })} /></td></tr>)}</tbody></table></div>
    <label className="text-xs"><span className="muted block">{L('Причина изменения или удаления (обязательно, попадает в журнал аудита)', 'Reason for the change or deletion (required, audited)', 'Өзгерту не жою себебі (міндетті, аудитке жазылады)')}</span>
      <input className="input py-1.5" value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} placeholder={L('например: сверено с оригиналом бланка', 'e.g. checked against the original report', 'мысалы: бланк түпнұсқасымен салыстырылды')} /></label>
    <div className="flex flex-wrap gap-2">
      <button type="button" className="btn btn-primary" disabled={busy || !okReason || !date} onClick={save}><Save size={14} />{L('Сохранить исправление', 'Save correction', 'Түзетуді сақтау')}</button>
      <button type="button" className="btn" disabled={busy || !okReason} onClick={remove} style={{ color: '#C62828' }}><Trash2 size={14} />{L('Удалить документ', 'Delete document', 'Құжатты жою')}</button>
    </div>
    {error && <p className="text-sm" style={{ color: '#C62828' }}>{error}</p>}
    {doc.corrections?.length > 0 && <details className="text-xs"><summary className="cursor-pointer muted flex items-center gap-1"><History size={13} />{L('История исправлений', 'Correction history', 'Түзету тарихы')} ({doc.corrections.length})</summary>
      <ul className="mt-2 grid gap-1">{doc.corrections.map((c, i) => <li key={i}>{fmtDate(c.at, lang)} · {c.by} · «{c.reason}» · {L('было', 'before', 'бұрын')}: {c.before.map((b) => `${b.code} ${b.value ?? b.value_text ?? ''}`).join(', ')}</li>)}</ul></details>}
  </div>;
}

export default function MotherDocuments() {
  const { lang } = useT(); const L = (ru, en, kz) => ({ ru, en, kz })[lang] || ru;
  const [mothers, setMothers] = useState(null); const [mid, setMid] = useState(null); const [docs, setDocs] = useState(null); const [sel, setSel] = useState(null);
  const [catalog, setCatalog] = useState([]); const [error, setError] = useState('');
  const loadMothers = () => api.staffMothers().then((m) => { setMothers(m); if (!mid && m[0]) setMid(m[0].id); }).catch((e) => setError(e.message));
  const loadDocs = (id) => api.staffMotherDocs(id).then(setDocs).catch((e) => setError(e.message));
  useEffect(() => { loadMothers(); api.labCatalog().then((c) => setCatalog(c.tests)).catch(() => {}); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (mid) { setDocs(null); setSel(null); loadDocs(mid); } }, [mid]); // eslint-disable-line react-hooks/exhaustive-deps
  const current = docs?.find((d) => d.id === sel);
  const done = () => { setSel(null); loadDocs(mid); loadMothers(); };
  return <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
    <Card title={L('Мамы', 'Mothers', 'Аналар')} sub={L('Своего стационара', 'Of your hospital', 'Өз стационарыңыздың')}>
      {error && <p className="text-sm" style={{ color: '#C62828' }}>{error}</p>}
      {!mothers ? <p className="muted text-sm">…</p> : mothers.length === 0 ? <p className="muted text-sm">{L('Нет мам с аккаунтом', 'No mothers with an account', 'Аккаунты бар аналар жоқ')}</p> :
        <div className="grid gap-1">{mothers.map((m) => <button key={m.id} type="button" onClick={() => setMid(m.id)} className={`text-left rounded-md px-3 py-2 ${mid === m.id ? 'bg-[#EAF4F4]' : ''}`}>
          <div className="text-sm font-semibold">{m.full_name}</div>
          <div className="muted text-xs flex items-center gap-2">{L('документов', 'documents', 'құжат')}: {m.documents}{m.reported > 0 && <Badge tone="high">{L('неточность', 'mismatch', 'қате')}: {m.reported}</Badge>}</div></button>)}</div>}
    </Card>
    {current ? <div className="grid gap-4 xl:grid-cols-2">
      <Card title={current.filename} sub={`${current.laboratory || ''} · ${fmtDate(current.specimen_date, lang)}`} right={<button type="button" className="btn" onClick={() => setSel(null)}><ArrowLeft size={14} />{L('Назад', 'Back', 'Артқа')}</button>}><Original doc={current} /></Card>
      <Card title={L('Значения документа', 'Document values', 'Құжат мәндері')} sub={L('Исправляет и удаляет только врач, с указанием причины', 'Only a doctor corrects or deletes, with a reason', 'Тек дәрігер себебін көрсетіп түзетеді не жояды')}><Editor key={current.id} doc={current} catalog={catalog} onDone={done} L={L} /></Card>
    </div> : <Card title={L('Документы', 'Documents', 'Құжаттар')} sub={L('Мама не может удалить или изменить документ — это делает врач', 'A mother cannot delete or change a document; the doctor does', 'Ана құжатты жоя не өзгерте алмайды — мұны дәрігер жасайды')}>
      {!docs ? <p className="muted text-sm">…</p> : docs.length === 0 ? <p className="muted text-sm">{L('Документов нет', 'No documents', 'Құжаттар жоқ')}</p> :
        <div className="grid gap-2">{docs.map((d) => <button key={d.id} type="button" onClick={() => setSel(d.id)} className="card p-3 text-left flex flex-wrap items-center gap-3">
          <FileText size={16} className="muted" />
          <div className="min-w-0 flex-1"><div className="text-sm font-semibold truncate">{d.filename}</div><div className="muted text-xs">{d.laboratory || '—'} · {fmtDate(d.specimen_date, lang)} · {L('значений', 'values', 'мән')}: {d.observations.length}</div></div>
          {d.report && <Badge tone="high">{L('неточность', 'mismatch', 'қате')}</Badge>}
          {d.corrections?.length > 0 && <Badge tone="primary">{L('исправлено врачом', 'corrected by doctor', 'дәрігер түзеткен')}</Badge>}
          {d.status !== 'verified' && !d.report && <Badge>{L('новый', 'new', 'жаңа')}</Badge>}
        </button>)}</div>}
    </Card>}
  </div>;
}
