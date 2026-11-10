/* «Мой малыш» additions: what she can do today, and her own care diary with plain "fine / tell the doctor / seek care
   now" hints. The diary is her personal notes, not the medical record: staff entries above are written by staff only. */
import { useEffect, useState } from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from 'recharts';
import { Sun, NotebookPen, AlertTriangle, MessageCircle, CheckCircle2, Trash2, Info, Phone } from 'lucide-react';
import { Card } from '../../lib/ui.jsx';
import { useT } from '../../lib/i18n.jsx';
import { api } from '../../services/api.js';
import { CARE_KINDS, CARE_DETAILS, CARE_HINT, TIPS, fill } from '../../lib/familyCare.js';

const C1 = '#0E9F9B'; const C2 = '#D97706';
const LEVEL = { urgent: { icon: Phone, bg: '#FEE2E2', border: '#FCA5A5', color: '#991B1B' }, discuss: { icon: MessageCircle, bg: '#FEF3C7', border: '#FCD34D', color: '#92400E' }, ok: { icon: CheckCircle2, bg: 'transparent', border: 'var(--line, #D9E8EC)', color: 'inherit' } };

export function TodayCard() {
  const { lang } = useT(); const L = (o) => o?.[lang] || o?.ru; const T = (ru, en, kz) => ({ ru, en, kz })[lang] || ru;
  const [data, setData] = useState(null);
  useEffect(() => { api.today().then(setData).catch(() => setData({ tips: [] })); }, []);
  if (!data?.tips?.length) return null;
  const b = data.baby || {};
  return <Card title={<span className="flex items-center gap-2"><Sun size={16} />{T('Сегодня для малыша', 'Today for my baby', 'Бүгін нәресте үшін')}</span>}
    sub={b.linked ? T(`${b.day_of_life}-й день жизни · скорректированный срок ${Math.floor(b.corrected_wk)} нед.`, `Day ${b.day_of_life} of life · corrected age ${Math.floor(b.corrected_wk)} wk`, `Өмірінің ${b.day_of_life}-ші күні · түзетілген мерзім ${Math.floor(b.corrected_wk)} апта`) : T('Что вы можете сделать сегодня', 'What you can do today', 'Бүгін не істей аласыз')}>
    <ol className="grid gap-2 text-sm list-decimal pl-5">{data.tips.map((k) => <li key={k} className={k === 'urgent_first' ? 'font-semibold' : ''} style={k === 'urgent_first' ? { color: '#991B1B' } : undefined}>{L(TIPS[k])}</li>)}</ol>
    <p className="muted text-xs mt-3">{T('Советы подобраны по состоянию малыша. Всё, что касается лечения, решает команда отделения.', 'Tips are chosen from your baby’s state. Anything about treatment is decided by the care team.', 'Кеңестер нәрестенің жағдайына қарай таңдалды. Емге қатыстының бәрін бөлімше командасы шешеді.')}</p>
  </Card>;
}

function AddEntry({ onSaved, T, L }) {
  const [kind, setKind] = useState('feed'); const [value, setValue] = useState(''); const [detail, setDetail] = useState('breast');
  const nowLocal = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
  const [at, setAt] = useState(nowLocal()); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const needsValue = ['feed', 'temp', 'breathing', 'weight'].includes(kind); const details = CARE_DETAILS[kind];
  const pick = (k) => { setKind(k); setValue(''); setError(''); setDetail(CARE_DETAILS[k] ? Object.keys(CARE_DETAILS[k])[0] : ''); };
  const save = async () => {
    setBusy(true); setError('');
    try {
      await onSaved({ kind, at: new Date(at).toISOString(), value: needsValue ? parseFloat(String(value).replace(',', '.')) : null, detail: details ? detail : null });
      setValue(''); setAt(nowLocal());
    } catch (e) { setError(e.detail?.code === 'value' ? T(`Значение должно быть от ${e.detail.min} до ${e.detail.max}`, `Value must be ${e.detail.min}–${e.detail.max}`, `Мән ${e.detail.min}–${e.detail.max} болуы керек`) : e.message); } finally { setBusy(false); }
  };
  return <div className="grid gap-3">
    <div className="flex flex-wrap gap-1.5">{Object.entries(CARE_KINDS).map(([k, v]) => <button key={k} type="button" className={`btn text-xs py-1.5 ${kind === k ? 'btn-primary' : ''}`} onClick={() => pick(k)}>{L(v)}</button>)}</div>
    <div className="flex flex-wrap items-end gap-2">
      <label className="text-xs"><span className="muted block">{T('Время', 'Time', 'Уақыт')}</span><input type="datetime-local" className="input py-1.5" value={at} max={nowLocal()} onChange={(e) => setAt(e.target.value)} /></label>
      {needsValue && <label className="text-xs"><span className="muted block">{L(CARE_KINDS[kind].unit)}</span><input className="input mono py-1.5 w-28" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} placeholder={{ feed: '15', temp: '36,8', breathing: '45', weight: '2850' }[kind]} /></label>}
      {details && <label className="text-xs"><span className="muted block">{T('Что отметить', 'Details', 'Не белгілеу')}</span><select className="input py-1.5" value={detail} onChange={(e) => setDetail(e.target.value)}>{Object.entries(details).map(([k, v]) => <option key={k} value={k}>{L(v)}</option>)}</select></label>}
      <button type="button" className="btn btn-primary" disabled={busy || (needsValue && !value)} onClick={save}>{T('Записать', 'Add', 'Жазу')}</button>
    </div>
    {error && <p className="text-xs" style={{ color: '#C62828' }}>{error}</p>}
  </div>;
}

export function CareDiary() {
  const { lang } = useT(); const L = (o) => o?.[lang] || o?.ru; const T = (ru, en, kz) => ({ ru, en, kz })[lang] || ru;
  const [data, setData] = useState(null);
  const load = () => api.care(7).then(setData).catch(() => setData({ entries: [], days: [], hints: [] }));
  useEffect(() => { load(); }, []);
  const add = async (body) => { await api.addCare(body); await load(); };
  const remove = async (id) => { await api.deleteCare(id); load(); };
  if (!data) return null;
  const today = new Date().toDateString();
  const todays = data.entries.filter((e) => new Date(e.at).toDateString() === today);
  const days = data.days.map((d) => ({ ...d, label: new Date(`${d.date}T00:00:00`).toLocaleDateString(lang === 'en' ? 'en-GB' : 'ru-RU', { day: '2-digit', month: '2-digit' }) }));
  const describe = (e) => [e.value != null ? `${String(e.value).replace('.', lang === 'en' ? '.' : ',')} ${L(CARE_KINDS[e.kind].unit) || ''}` : '', e.detail ? L(CARE_DETAILS[e.kind]?.[e.detail]) : ''].filter(Boolean).join(' · ');
  return <Card title={<span className="flex items-center gap-2"><NotebookPen size={16} />{T('Мой дневник ухода', 'My care diary', 'Күтім күнделігім')}</span>}
    sub={T('Ваши личные заметки — не медицинская карта. Записи врачей и медсестёр выше вносит только персонал.', 'Your personal notes — not the medical record. Entries by doctors and nurses above are made by staff only.', 'Сіздің жеке жазбаларыңыз — медициналық карта емес. Дәрігерлер мен медбикелердің жоғарыдағы жазбаларын тек персонал енгізеді.')}>
    <AddEntry onSaved={add} T={T} L={L} />
    {data.hints.length > 0 && <div className="grid gap-2 mt-4">{data.hints.map((h, i) => { const s = LEVEL[h.level]; const I = s.icon; return (
      <div key={i} className="rounded-md border p-3 text-sm flex gap-2.5" style={{ background: s.bg, borderColor: s.border, color: s.color }}><I size={16} className="shrink-0 mt-0.5" />
        <span>{fill(L(CARE_HINT[h.code]) || h.code, { ...h, detail: h.detail ? L(CARE_DETAILS.jaundice?.[h.detail] || CARE_DETAILS.stool?.[h.detail] || CARE_DETAILS.breathing?.[h.detail]) : '' }, lang)}</span></div>); })}</div>}
    {days.length > 0 && <div className="mt-4"><div className="text-sm font-semibold mb-1">{T('Кормления и мокрые подгузники по дням', 'Feeds and wet nappies by day', 'Күндер бойынша тамақтандыру және дымқыл жаялық')}</div>
      <div className="h-48"><ResponsiveContainer width="100%" height="100%"><BarChart data={days} margin={{ left: 0, right: 8, top: 8, bottom: 0 }} barGap={2}>
        <CartesianGrid vertical={false} stroke="#DDE9EE" strokeDasharray="3 6" /><XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: '#647C8B', fontSize: 11 }} />
        <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fill: '#647C8B', fontSize: 11 }} width={28} /><Tooltip cursor={{ fill: '#EEF5F7' }} /><Legend />
        <Bar dataKey="feed" name={L(CARE_KINDS.feed)} fill={C1} radius={[4, 4, 0, 0]} isAnimationActive={false} /><Bar dataKey="wet" name={L(CARE_KINDS.wet)} fill={C2} radius={[4, 4, 0, 0]} isAnimationActive={false} />
      </BarChart></ResponsiveContainer></div>
      <p className="muted text-xs">{T('Ориентиры: 8–12 кормлений в сутки; мокрых подгузников — не меньше числа дней жизни, с 6-го дня — 6 и больше.', 'Guide: 8–12 feeds a day; wet nappies at least the day of life, from day 6 — 6 or more.', 'Бағдар: тәулігіне 8–12 тамақтандыру; дымқыл жаялық — өмір күндерінен кем емес, 6-шы күннен — 6 және одан көп.')}</p></div>}
    {todays.length > 0 && <div className="mt-4"><div className="text-sm font-semibold mb-1">{T('Сегодня', 'Today', 'Бүгін')}</div><div className="grid gap-1 text-sm">{todays.map((e) => <div key={e.id} className="flex items-center gap-2 border-b border-line py-1 last:border-b-0">
      <span className="muted text-xs w-12">{new Date(e.at).toLocaleTimeString(lang === 'en' ? 'en-GB' : 'ru-RU', { hour: '2-digit', minute: '2-digit' })}</span><span className="flex-1">{L(CARE_KINDS[e.kind])}{describe(e) ? ` · ${describe(e)}` : ''}</span>
      <button type="button" className="btn px-2 py-1" aria-label={T('Удалить ошибочную отметку', 'Remove a mistaken note', 'Қате белгіні жою')} onClick={() => remove(e.id)}><Trash2 size={13} /></button></div>)}</div></div>}
    <p className="muted text-xs mt-3 flex gap-1.5"><AlertTriangle size={13} className="shrink-0 mt-0.5" />{T('Подсказки — по признакам опасности у новорождённых ВОЗ. Если тревожно — звоните врачу или 103, не дожидаясь подсказки.', 'Hints follow the WHO newborn danger signs. If you are worried, call your doctor or 103 without waiting for a hint.', 'Кеңестер ДДҰ-ның нәрестедегі қауіп белгілері бойынша. Алаңдасаңыз, кеңесті күтпей дәрігерге не 103-ке қоңырау шалыңыз.')}</p>
    <p className="muted text-xs mt-1 flex gap-1.5"><Info size={13} className="shrink-0 mt-0.5" />{T('Ошибочную отметку можно удалить в течение суток.', 'A mistaken note can be removed within 24 hours.', 'Қате белгіні бір тәулік ішінде жоюға болады.')}</p>
  </Card>;
}
