import { useEffect, useRef, useState } from 'react';
import { FileText, Upload, Check, Download, ClipboardCheck } from 'lucide-react';
import { Card, Badge } from '../../lib/ui.jsx';
import { useT } from '../../lib/i18n.jsx';
import { api } from '../../services/api.js';

const localNow = () => { const date = new Date(); return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };
const useWords = () => { const { lang } = useT(); return (ru, en, kz) => ({ ru, en, kz })[lang] || ru; };

export function DocumentViewer({ document, user, onSigned }) {
  const L = useWords(); const [url, setUrl] = useState(null); const [note, setNote] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  useEffect(() => { let active = true; let made; setUrl(null); setError(''); setNote(''); api.documentUrl(document.id).then((u) => { made = u; if (active) setUrl(u); else URL.revokeObjectURL(u); }).catch((e) => { if (active) setError(e.message); }); return () => { active = false; if (made) URL.revokeObjectURL(made); }; }, [document.id, document.status]);
  const sign = async () => { setBusy(true); setError(''); try { onSigned(await api.signDocument(document.id, note)); } catch (e) { setError(e.message); } finally { setBusy(false); } };
  return <div className="grid gap-3">
    <div className="flex flex-wrap items-center gap-3 text-sm"><Badge tone={document.status === 'signed' ? 'low' : 'moderate'}>{document.status === 'signed' ? L('Подписан', 'Signed', 'Қол қойылған') : L('Ожидает подписи', 'Awaiting signature', 'Қол қоюды күтуде')}</Badge><span className="mono">{document.patient_id} · {document.encounter_ref}</span>{url && <a className="btn ml-auto" download={`${document.id}.pdf`} href={url}><Download size={14} />PDF</a>}</div>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {url ? <iframe title={document.filename} src={url} className="w-full h-[620px] rounded-xl border border-line" /> : <p className="muted">{L('Открываю документ…', 'Opening document…', 'Құжат ашылуда…')}</p>}
    {document.status === 'signed' ? <div className="rounded-xl border border-line p-4 text-sm"><strong>{document.signer_name}</strong><p>{new Date(document.signed_at).toLocaleString()}</p>{document.note && <p>{document.note}</p>}</div> : <div className="rounded-xl border border-line p-4 grid gap-3">
      <p className="text-sm">{L('Подписывает', 'Signing as', 'Қол қоятын')}: <strong>{user.full_name}</strong></p>
      <label className="text-sm">{L('Комментарий врача', 'Doctor’s note', 'Дәрігер түсініктемесі')}<textarea className="input mt-1" rows={2} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} /></label>
      <p className="muted text-xs">{L('Проверьте пациента, обращение и все страницы. Время подписания фиксирует сервер. Это внутренняя отметка, без квалифицированной ЭЦП.', 'Check patient, encounter and all pages. Signing time is set by the server. This is an internal record, not a qualified digital signature.', 'Науқасты, өтінішті және барлық беттерді тексеріңіз. Уақытты сервер тіркейді. Бұл ішкі белгі, білікті ЭЦҚ емес.')}</p>
      <button type="button" className="btn btn-primary justify-center" disabled={busy || !url} onClick={sign}><Check size={16} />{busy ? L('Сохранение…', 'Saving…', 'Сақталуда…') : L('Подтверждаю документ и подписываю', 'Confirm and sign document', 'Құжатты растап, қол қоямын')}</button>
    </div>}
  </div>;
}

export function DocumentComposer({ bundle, previewUrl, user, patients, onSelectPatient }) {
  const L = useWords(); const [patientId, setPatientId] = useState(''); const [encounter, setEncounter] = useState(''); const [date, setDate] = useState(localNow); const [doc, setDoc] = useState(null); const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const fileRef = useRef(null);
  const patientIds = patients.map((p) => p.id).join('|');
  useEffect(() => { const id = bundle?.patient?.patient_id; setPatientId(patientIds.split('|').includes(id) ? id : ''); setEncounter(bundle?.encounter?.encounter_id || ''); setDoc(null); setError(''); }, [bundle, patientIds]);
  const save = async (file = null) => { setBusy(true); setError(''); try { const body = { patient_id: patientId, encounter_ref: encounter, document_at: new Date(date).toISOString() }; const created = file ? await api.uploadDocument({ ...body, file }) : await api.queueDocument({ ...body, bundle: { ...bundle, encounter: { ...bundle.encounter, encounter_id: encounter } } }); setDoc(created); } catch (e) { setError(e.message); } finally { setBusy(false); } };
  const ready = patientId && encounter.trim() && date && !busy;
  return <Card title={<span className="flex gap-2 items-center"><FileText size={16} />{L('Документы пациента и подпись', 'Patient documents and sign-off', 'Науқас құжаттары және қол қою')}</span>} sub={L('Карточка NeoOutcome или ваш PDF / фото · до 10 МБ', 'NeoOutcome card or your PDF / photo · up to 10 MB', 'NeoOutcome картасы немесе PDF / фото · 10 МБ дейін')}>
    <div className="grid sm:grid-cols-2 gap-3 mb-4">
      <label className="text-sm">{L('Пациент', 'Patient', 'Науқас')}<select className="input mt-1" value={patientId} disabled={busy} onChange={async (e) => { const id = e.target.value; setPatientId(id); setDoc(null); if (id) { setBusy(true); try { await onSelectPatient(id); } catch (e) { setError(e.message); } finally { setBusy(false); } } }}><option value="">{L('Выберите номер пациента', 'Select patient ID', 'Науқас нөмірін таңдаңыз')}</option>{patients.map((p) => <option value={p.id} key={p.id}>{p.id} · {p.bed}</option>)}</select></label>
      <label className="text-sm">{L('Номер обращения', 'Encounter reference', 'Өтініш нөмірі')}<input className="input mt-1" maxLength={128} value={encounter} onChange={(e) => setEncounter(e.target.value)} disabled={!!doc} /></label>
      <label className="text-sm">{L('Дата и время документа', 'Document date and time', 'Құжат күні мен уақыты')}<input className="input mt-1" type="datetime-local" value={date} onChange={(e) => setDate(e.target.value)} disabled={!!doc} /></label>
      <div className="muted text-xs self-end pb-2">{L('Дата документа и фактическое время подписи сохраняются отдельно.', 'Document time and actual signing time are stored separately.', 'Құжат уақыты мен нақты қол қою уақыты бөлек сақталады.')}</div>
    </div>
    {error && <p className="text-sm text-red-700 mb-3" role="alert">{error}</p>}
    <div className="flex flex-wrap gap-2 mb-4"><button type="button" className="btn btn-primary" disabled={!ready || !!doc} onClick={() => save()}><ClipboardCheck size={15} />{L('Карточку в очередь на подпись', 'Queue this card for signing', 'Картаны қол қою кезегіне жіберу')}</button><button type="button" className="btn" disabled={!ready} onClick={() => fileRef.current?.click()}><Upload size={15} />{L('Загрузить PDF или фото', 'Upload PDF or photo', 'PDF немесе фото жүктеу')}</button><input type="file" ref={fileRef} className="hidden" accept=".pdf,.jpg,.jpeg,.png,.webp" onChange={(e) => { const file = e.target.files?.[0]; if (file) save(file); e.target.value = ''; }} /></div>
    {!patientId && <p className="muted text-sm mb-3">{L('Для привязки и подписания выберите пациента своей больницы. Его данные подставятся автоматически.', 'Select a patient from your hospital to link and sign. Their data will fill automatically.', 'Байланыстыру және қол қою үшін өз ауруханаңыздың науқасын таңдаңыз. Деректері автоматты толтырылады.')}</p>}
    {doc ? <DocumentViewer document={doc} user={user} onSigned={setDoc} /> : previewUrl && <iframe title={L('Предпросмотр карточки', 'Card preview', 'Картаны алдын ала қарау')} src={previewUrl} className="w-full h-[620px] rounded-xl border border-line" />}
  </Card>;
}

export function DocumentQueue({ user }) {
  const L = useWords(); const [items, setItems] = useState([]); const [filter, setFilter] = useState('pending'); const [selected, setSelected] = useState(null); const [error, setError] = useState('');
  const load = () => api.documents().then(setItems).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);
  const rows = items.filter((d) => d.status === filter);
  return <Card title={L('Документы на подпись', 'Document signing queue', 'Қол қою құжаттары')} sub={L('Карточки, загруженные PDF и фотографии бланков', 'Cards, uploaded PDFs and report photos', 'Карталар, жүктелген PDF және бланк фотолары')}>
    <div className="flex gap-2 mb-4">{['pending', 'signed'].map((status) => <button key={status} type="button" className={`btn ${filter === status ? 'btn-primary' : ''}`} onClick={() => { setFilter(status); setSelected(null); }}>{status === 'pending' ? L('Ожидают подписи', 'Pending', 'Күтуде') : L('Подписанные', 'Signed', 'Қол қойылған')} · {items.filter((d) => d.status === status).length}</button>)}</div>
    {error && <p role="alert" className="text-red-700 text-sm">{error}</p>}
    {!rows.length && <p className="muted text-sm">{L('Документов пока нет. Добавьте карточку или загрузите файл в разделе «Приём и оценка».', 'No documents yet. Add a card or upload a file from Intake.', 'Құжаттар жоқ. Қабылдау бөлімінде карта қосыңыз немесе файл жүктеңіз.')}</p>}
    <div className="grid gap-2 mb-4">{rows.map((d) => <button key={d.id} type="button" className={`btn text-left justify-between ${selected?.id === d.id ? 'btn-primary' : ''}`} onClick={() => setSelected(d)}><span className="min-w-0"><strong>{d.patient_id}</strong> · {d.encounter_ref}<span className="block text-xs truncate">{d.filename} · {new Date(d.document_at).toLocaleString()}</span></span><FileText size={16} /></button>)}</div>
    {selected && <DocumentViewer document={selected} user={user} onSigned={(d) => { setSelected(d); load(); }} />}
  </Card>;
}
