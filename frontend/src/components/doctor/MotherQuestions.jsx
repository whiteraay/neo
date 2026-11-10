/* Doctor portal · questions from mothers of this hospital and the EPDS results they chose to share. */
import { useEffect, useState } from 'react';
import { MessageCircle, Send, ClipboardList, Phone, Eye } from 'lucide-react';
import { Card, Badge } from '../../lib/ui.jsx';
import { useT } from '../../lib/i18n.jsx';
import { api } from '../../services/api.js';
import { fmtDate } from '../mother/Labs.jsx';

function Answer({ q, onDone, T }) {
  const [text, setText] = useState(''); const [busy, setBusy] = useState(false);
  const send = async () => { setBusy(true); try { await api.answerQuestion(q.id, text); onDone(); } finally { setBusy(false); } };
  return <div className="grid gap-2 mt-2"><textarea className="input min-h-[64px]" maxLength={4000} value={text} onChange={(e) => setText(e.target.value)} placeholder={T('Ответ простым языком, без латинских терминов', 'Answer in plain language', 'Қарапайым тілмен жауап')} />
    <button type="button" className="btn btn-primary justify-self-start" disabled={busy || text.trim().length < 2} onClick={send}><Send size={14} />{T('Ответить', 'Answer', 'Жауап беру')}</button></div>;
}

export default function MotherQuestions() {
  const { lang } = useT(); const T = (ru, en, kz) => ({ ru, en, kz })[lang] || ru;
  const [qs, setQs] = useState(null); const [epds, setEpds] = useState([]); const [filter, setFilter] = useState('open'); const [error, setError] = useState('');
  const load = () => Promise.all([api.staffQuestions(), api.staffEpds()]).then(([q, e]) => { setQs(q); setEpds(e); }).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);
  const WHO = { obgyn: T('акушеру-гинекологу', 'to obstetrician', 'акушер-гинекологқа'), neonatologist: T('неонатологу', 'to neonatologist', 'неонатологқа') };
  const BAND = { urgent: ['critical', T('мысли о самоповреждении', 'self-harm thoughts', 'өзіне зиян ойлары')], high: ['high', T('≥ 13: вероятна депрессия', '≥ 13: likely depression', '≥ 13: депрессия ықтимал')], possible: ['moderate', T('10–12: возможна', '10–12: possible', '10–12: мүмкін')], low: ['low', T('< 10', '< 10', '< 10')] };
  const shown = (qs || []).filter((q) => (filter === 'open' ? !q.answer : !!q.answer));
  return <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
    <Card title={<span className="flex items-center gap-2"><MessageCircle size={16} />{T('Вопросы', 'Questions', 'Сұрақтар')}</span>}
      right={<div className="flex gap-1">{[['open', T('Без ответа', 'Open', 'Жауапсыз')], ['done', T('Отвеченные', 'Answered', 'Жауап берілген')]].map(([k, l]) => <button key={k} type="button" className={`btn text-xs py-1 ${filter === k ? 'btn-primary' : ''}`} onClick={() => setFilter(k)}>{l} {k === 'open' && qs ? qs.filter((q) => !q.answer).length : ''}</button>)}</div>}>
      {error && <p className="text-sm" style={{ color: '#C62828' }}>{error}</p>}
      {!qs ? <p className="muted text-sm">…</p> : shown.length === 0 ? <p className="muted text-sm">{T('Вопросов нет', 'No questions', 'Сұрақтар жоқ')}</p> :
        <div className="grid gap-3">{shown.map((q) => <div key={q.id} className="rounded-xl border border-line p-3 text-sm">
          <div className="flex flex-wrap items-center gap-2 text-xs muted"><strong className="text-sm" style={{ color: 'var(--color-ink, #14213D)' }}>{q.mother}</strong><span>{WHO[q.to]}</span><span>{fmtDate(q.created_at, lang)}</span></div>
          <p className="mt-1">{q.text}</p>
          {q.answer ? <div className="rounded-md p-2.5 mt-2" style={{ background: '#EAF4F4' }}><div className="text-xs muted mb-0.5">{q.answered_by} · {fmtDate(q.answered_at, lang)}</div>{q.answer}</div> : <Answer q={q} onDone={load} T={T} />}
        </div>)}</div>}
    </Card>
    <Card title={<span className="flex items-center gap-2"><ClipboardList size={16} />{T('Опросник EPDS', 'EPDS questionnaire', 'EPDS сауалнамасы')}</span>} sub={T('Только результаты, которыми мама решила поделиться', 'Only results the mother chose to share', 'Тек ана бөліскен нәтижелер')} className="self-start">
      {epds.length === 0 ? <p className="muted text-sm">{T('Нет переданных результатов', 'No shared results', 'Жіберілген нәтижелер жоқ')}</p> :
        <div className="grid gap-2">{epds.map((r) => <div key={r.id} className="rounded-xl border border-line p-3 text-sm grid gap-1">
          <div className="flex items-center gap-2"><strong>{r.mother}</strong><span className="mono">{r.score}/30</span>{r.band === 'urgent' && <Phone size={14} style={{ color: '#C62828' }} />}</div>
          <div className="flex flex-wrap items-center gap-2 text-xs"><Badge tone={BAND[r.band][0]}>{BAND[r.band][1]}</Badge><span className="muted">{fmtDate(r.created_at, lang)}</span></div>
          {r.seen_by ? <div className="muted text-xs">{T('Просмотрено', 'Seen by', 'Қарады')}: {r.seen_by}</div> : <button type="button" className="btn text-xs py-1 justify-self-start" onClick={async () => { await api.staffEpdsSeen(r.id); load(); }}><Eye size={13} />{T('Отметить просмотренным', 'Mark as seen', 'Қаралды деп белгілеу')}</button>}
        </div>)}</div>}
      <p className="muted text-xs mt-3">{T('Скрининг, не диагноз. При мыслях о самоповреждении свяжитесь с мамой в тот же день.', 'A screen, not a diagnosis. With self-harm thoughts contact the mother the same day.', 'Скрининг, диагноз емес. Өзіне зиян ойлары болса, анамен сол күні байланысыңыз.')}</p>
    </Card>
  </div>;
}
