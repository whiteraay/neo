/* Edinburgh Postnatal Depression Scale: 10 questions about the last 7 days. Private unless she shares it with her doctor. */
import { useEffect, useState } from 'react';
import { ClipboardList, Phone, Info } from 'lucide-react';
import { Card, Badge } from '../../lib/ui.jsx';
import { useT } from '../../lib/i18n.jsx';
import { api } from '../../services/api.js';
import { EPDS, EPDS_BAND } from '../../lib/familyCare.js';
import { fmtDate } from './Labs.jsx';

export default function Epds() {
  const { lang } = useT(); const L = (o) => o?.[lang] || o?.ru; const T = (ru, en, kz) => ({ ru, en, kz })[lang] || ru;
  const [answers, setAnswers] = useState(Array(10).fill(null)); const [share, setShare] = useState(false);
  const [result, setResult] = useState(null); const [history, setHistory] = useState([]); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [open, setOpen] = useState(false);
  useEffect(() => { api.epds().then(setHistory).catch(() => {}); }, []);
  const done = answers.every((a) => a != null);
  const submit = async () => {
    setBusy(true); setError('');
    try { const r = await api.addEpds({ answers, share }); setResult(r); setHistory((h) => [r, ...h]); setAnswers(Array(10).fill(null)); setOpen(false); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  const band = result && EPDS_BAND[result.band];
  return <Card title={<span className="flex items-center gap-2"><ClipboardList size={16} />{T('Опросник настроения после родов (EPDS)', 'Postnatal mood questionnaire (EPDS)', 'Босанғаннан кейінгі көңіл-күй сауалнамасы (EPDS)')}</span>}
    sub={T('10 вопросов о последних 7 днях · около 3 минут', '10 questions about the last 7 days · about 3 minutes', 'Соңғы 7 күн туралы 10 сұрақ · шамамен 3 минут')}>
    <p className="text-sm">{T('После родов у многих мам бывает усталость, тревога и грусть. Опросник помогает вовремя заметить послеродовую депрессию — это частое и излечимое состояние. Это не диагноз.', 'After birth many mothers feel tired, anxious or sad. This questionnaire helps notice postnatal depression early — it is common and treatable. It is not a diagnosis.', 'Босанғаннан кейін көп аналар шаршайды, мазасызданады, мұңаяды. Сауалнама босанғаннан кейінгі депрессияны ерте байқауға көмектеседі — бұл жиі кездеседі және емделеді. Бұл диагноз емес.')}</p>
    {result && <div className={`rounded-md border p-3 mt-3 text-sm grid gap-1 ${result.band === 'urgent' ? 'text-white' : ''}`} style={result.band === 'urgent' ? { background: 'var(--color-coral)', borderColor: 'var(--color-coral)' } : undefined} role="status">
      <div className="flex items-center gap-2 font-semibold">{result.band === 'urgent' && <Phone size={16} />}{T('Результат', 'Result', 'Нәтиже')}: {result.score} / 30</div>
      <div>{L(band)}</div>
      {result.shared && <div className="text-xs opacity-80">{T('Результат передан вашему врачу.', 'The result was shared with your doctor.', 'Нәтиже дәрігеріңізге жіберілді.')}</div>}
    </div>}
    {!open ? <button type="button" className="btn btn-primary mt-3" onClick={() => { setOpen(true); setResult(null); }}>{T('Пройти опросник', 'Take the questionnaire', 'Сауалнамадан өту')}</button> : <div className="grid gap-4 mt-4">
      <div className="muted text-xs">{T('Выберите ответ, который лучше всего описывает, как вы себя чувствовали в последние 7 дней, а не только сегодня.', 'Choose the answer closest to how you have felt in the past 7 days, not just today.', 'Тек бүгін емес, соңғы 7 күнде қалай сезінгеніңізге ең жақын жауапты таңдаңыз.')}</div>
      {EPDS.map((item, i) => <fieldset key={i} className="grid gap-1.5">
        <legend className="text-sm font-semibold mb-1">{i + 1}. {L(item.q)}</legend>
        <div className="grid sm:grid-cols-2 gap-1.5">{item.a.map((opt, j) => <label key={j} className={`tile text-sm px-3 py-2 flex items-center gap-2 cursor-pointer ${answers[i] === j ? 'selected' : ''}`}>
          <input type="radio" name={`epds-${i}`} checked={answers[i] === j} onChange={() => setAnswers((a) => a.map((x, k) => (k === i ? j : x)))} />{L(opt)}</label>)}</div>
      </fieldset>)}
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={share} onChange={(e) => setShare(e.target.checked)} />{T('Передать результат моему врачу (без этого его видите только вы)', 'Share the result with my doctor (otherwise only you see it)', 'Нәтижені дәрігеріме жіберу (әйтпесе тек сіз көресіз)')}</label>
      <div className="flex gap-2"><button type="button" className="btn btn-primary" disabled={!done || busy} onClick={submit}>{T('Узнать результат', 'See the result', 'Нәтижені көру')}</button><button type="button" className="btn" onClick={() => setOpen(false)}>{T('Отмена', 'Cancel', 'Болдырмау')}</button></div>
      {error && <p className="text-sm" style={{ color: '#C62828' }}>{error}</p>}
    </div>}
    {history.length > 0 && <div className="mt-4 grid gap-1 text-sm">{history.slice(0, 5).map((h) => <div key={h.id} className="flex items-center gap-2"><span className="muted text-xs w-24">{fmtDate(h.created_at, lang)}</span><span className="mono">{h.score}/30</span>
      <Badge tone={EPDS_BAND[h.band].tone}>{({ low: T('норма', 'fine', 'қалыпты'), possible: T('возможно', 'possible', 'мүмкін'), high: T('к врачу', 'see a doctor', 'дәрігерге'), urgent: T('срочно', 'urgent', 'шұғыл') })[h.band]}</Badge>{h.shared && <span className="muted text-xs">{h.seen_by ? T(`просмотрено: ${h.seen_by}`, `seen by ${h.seen_by}`, `қарады: ${h.seen_by}`) : T('передано врачу', 'shared', 'дәрігерге жіберілді')}</span>}</div>)}</div>}
    <p className="muted text-xs mt-3 flex gap-1.5"><Info size={13} className="shrink-0 mt-0.5" />Cox, Holden & Sagovsky. Edinburgh Postnatal Depression Scale. Br J Psychiatry 1987;150:782–6.</p>
  </Card>;
}
