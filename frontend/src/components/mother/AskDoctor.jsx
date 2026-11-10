/* Questions to the obstetrician-gynaecologist or neonatologist, answered by doctors of her hospital in the doctor portal;
   and plain breastfeeding answers (replaces the list of WHO links, which mothers found hard to use). */
import { useEffect, useState } from 'react';
import { Send, MessageCircle, Clock, CheckCircle2, ChevronDown } from 'lucide-react';
import { Card, Badge } from '../../lib/ui.jsx';
import { useT } from '../../lib/i18n.jsx';
import { api } from '../../services/api.js';
import { BF_FAQ, FAQ_SOURCE } from '../../lib/familyCare.js';
import { fmtDate } from './Labs.jsx';

export function AskDoctor() {
  const { lang } = useT(); const T = (ru, en, kz) => ({ ru, en, kz })[lang] || ru;
  const [list, setList] = useState([]); const [to, setTo] = useState('neonatologist'); const [topic, setTopic] = useState('baby'); const [text, setText] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [sent, setSent] = useState(false);
  useEffect(() => { api.myQuestions().then(setList).catch(() => {}); }, []);
  const send = async () => { setBusy(true); setError(''); setSent(false); try { const q = await api.ask({ to, topic, text }); setList((l) => [q, ...l]); setText(''); setSent(true); } catch (e) { setError(e.message); } finally { setBusy(false); } };
  const WHO = { obgyn: T('Акушер-гинеколог', 'Obstetrician-gynaecologist', 'Акушер-гинеколог'), neonatologist: T('Неонатолог', 'Neonatologist', 'Неонатолог') };
  const TOPIC = { baby: T('Малыш', 'Baby', 'Нәресте'), feeding: T('Кормление', 'Feeding', 'Тамақтандыру'), mother: T('Моё здоровье', 'My health', 'Менің денсаулығым'), other: T('Другое', 'Other', 'Басқа') };
  return <Card title={<span className="flex items-center gap-2"><MessageCircle size={16} />{T('Спросить врача', 'Ask a doctor', 'Дәрігерден сұрау')}</span>}
    sub={T('Ответят врачи вашего стационара. При опасных признаках не ждите ответа — звоните 103.', 'Doctors of your hospital will answer. With danger signs do not wait — call 103.', 'Стационарыңыздың дәрігерлері жауап береді. Қауіпті белгілерде жауап күтпеңіз — 103-ке қоңырау шалыңыз.')}>
    <div className="grid sm:grid-cols-2 gap-2">
      <label className="text-xs"><span className="muted block">{T('Кому', 'To', 'Кімге')}</span><select className="input py-1.5" value={to} onChange={(e) => setTo(e.target.value)}>{Object.entries(WHO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
      <label className="text-xs"><span className="muted block">{T('Тема', 'Topic', 'Тақырып')}</span><select className="input py-1.5" value={topic} onChange={(e) => setTopic(e.target.value)}>{Object.entries(TOPIC).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
    </div>
    <textarea className="input mt-2 min-h-[80px]" maxLength={2000} value={text} onChange={(e) => setText(e.target.value)} placeholder={T('Например: сколько раз в сутки сцеживать молоко, пока малыш в отделении?', 'For example: how often should I express milk while my baby is in the unit?', 'Мысалы: нәресте бөлімшеде жатқанда сүтті тәулігіне неше рет сауу керек?')} />
    <button type="button" className="btn btn-primary mt-2" disabled={busy || text.trim().length < 5} onClick={send}><Send size={14} />{T('Отправить вопрос', 'Send question', 'Сұрақты жіберу')}</button>
    {sent && <span className="text-sm ml-3" style={{ color: '#15803D' }}>{T('Отправлено', 'Sent', 'Жіберілді')}</span>}
    {error && <p className="text-sm mt-2" style={{ color: '#C62828' }}>{error}</p>}
    {list.length > 0 && <div className="grid gap-2 mt-4">{list.map((q) => <div key={q.id} className="rounded-xl border border-line p-3 text-sm grid gap-1.5">
      <div className="flex flex-wrap items-center gap-2 text-xs muted"><Badge tone="primary">{WHO[q.to]}</Badge><span>{TOPIC[q.topic]}</span><span>{fmtDate(q.created_at, lang)}</span>
        {q.answer ? <Badge tone="low"><CheckCircle2 size={11} />{T('Есть ответ', 'Answered', 'Жауап бар')}</Badge> : <Badge><Clock size={11} />{T('Ждёт ответа', 'Waiting', 'Жауап күтуде')}</Badge>}</div>
      <div>{q.text}</div>
      {q.answer && <div className="rounded-md p-2.5" style={{ background: '#EAF4F4' }}><div className="text-xs muted mb-0.5">{q.answered_by} · {fmtDate(q.answered_at, lang)}</div>{q.answer}</div>}
    </div>)}</div>}
  </Card>;
}

export function FeedingFaq() {
  const { lang } = useT(); const L = (o) => o?.[lang] || o?.ru;
  const [open, setOpen] = useState(0);
  return <Card title={({ ru: 'Грудное вскармливание: вопросы и ответы', en: 'Breastfeeding: questions and answers', kz: 'Емшекпен емізу: сұрақтар мен жауаптар' })[lang]}>
    <div className="grid gap-2">{BF_FAQ.map((f, i) => <div key={i} className="rounded-xl border border-line">
      <button type="button" className="w-full text-left px-4 py-3 flex items-center gap-2 font-semibold text-sm" aria-expanded={open === i} onClick={() => setOpen(open === i ? -1 : i)}>
        <span className="flex-1">{L(f.q)}</span><ChevronDown size={16} style={{ transform: open === i ? 'rotate(180deg)' : 'none' }} /></button>
      {open === i && <p className="px-4 pb-3 text-sm">{L(f.a)}</p>}
    </div>)}</div>
    <p className="muted text-xs mt-3">{L(FAQ_SOURCE)}</p>
  </Card>;
}
