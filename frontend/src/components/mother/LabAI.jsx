import { useEffect, useState } from 'react';
import { Sparkles, Info } from 'lucide-react';
import { Card, Badge } from '../../lib/ui.jsx';
import { useT } from '../../lib/i18n.jsx';
import { api } from '../../services/api.js';

export default function LabAI({ doc, onChanged, busy, setBusy }) {
  const { lang } = useT(); const L = (ru, en, kz) => ({ ru, en, kz })[lang] || ru;
  const [status, setStatus] = useState(null); const [consent, setConsent] = useState(false); const [question, setQuestion] = useState(''); const [error, setError] = useState('');
  useEffect(() => { api.labAIStatus().then(setStatus).catch(() => setStatus({ configured: false })); }, []);
  const run = async () => { setBusy(true); setError(''); try { const updated = await api.labAI(doc.id, { consent, question, language: lang, mode: doc.status === 'needs_review' ? 'extract' : 'explain' }); onChanged(updated); } catch (e) { setError(e.message); } finally { setBusy(false); } };
  return <Card title={<span className="flex items-center gap-2"><Sparkles size={16} />{L('Помощник ChatGPT', 'ChatGPT assistant', 'ChatGPT көмекшісі')}</span>} sub={doc.filename} right={<Badge tone={status?.configured ? 'low' : 'muted'}>{status?.configured ? L('Подключён', 'Connected', 'Қосылған') : L('Ключ не указан', 'Key not configured', 'Кілт көрсетілмеген')}</Badge>}>
    <p className="muted text-sm">{L('Читает именно открытый PDF или фото, извлекает показатели и диапазоны из бланка и помогает подготовить вопросы врачу. Не заменяет врача. Результаты нужно сверить с оригиналом.', 'Reads this PDF or photo, extracts values and ranges, and helps prepare questions for your doctor. It does not replace a clinician. Verify all values against the original.', 'Осы PDF не фотоны оқиды, мәндер мен аралықтарды шығарып, дәрігерге сұрақтар дайындауға көмектеседі. Дәрігерді алмастырмайды. Мәндерді түпнұсқамен тексеріңіз.')}</p>
    {!status?.configured && <p className="text-sm mt-3">{L('Для включения владелец проекта должен добавить API-ключ OpenAI в настройки сервера.', 'The project owner must configure an OpenAI API key on the server.', 'Жоба иесі сервер баптауларына OpenAI API кілтін қосуы керек.')}</p>}
    <label className="text-sm block mt-3">{L('Вопрос по документу (необязательно)', 'Question about this document (optional)', 'Құжат бойынша сұрақ (міндетті емес)')}<textarea rows={2} maxLength={1000} className="input mt-1" value={question} onChange={(e) => setQuestion(e.target.value)} disabled={busy} /></label>
    <label className="flex gap-2 items-start text-sm mt-3"><input type="checkbox" className="mt-1" checked={consent} onChange={(e) => setConsent(e.target.checked)} disabled={busy || !status?.configured} /><span>{L('Разрешаю отправить этот файл, включая данные внутри него, в OpenAI для обработки. Запрос использует платный API.', 'I agree to send this file and its contents to OpenAI for processing through the paid API.', 'Осы файлды ішіндегі деректерімен OpenAI-ға ақылы API арқылы өңдеуге жіберуге келісемін.')}</span></label>
    <button type="button" className="btn btn-primary mt-3" disabled={busy || !consent || !status?.configured} onClick={run}><Sparkles size={15} />{busy ? L('Обработка…', 'Processing…', 'Өңделуде…') : doc.status === 'needs_review' ? L('Распознать с ChatGPT', 'Extract with ChatGPT', 'ChatGPT арқылы тану') : L('Объяснить с ChatGPT', 'Explain with ChatGPT', 'ChatGPT арқылы түсіндіру')}</button>
    {error && <p role="alert" className="text-red-700 text-sm mt-3">{error}</p>}
    {doc.ai && <div className="rounded-xl border border-line p-4 mt-4 grid gap-3 text-sm" role="status"><div className="flex items-center gap-2"><Info size={15} /><strong>OpenAI · {doc.ai.model}</strong></div><p>{doc.ai.summary}</p>{doc.ai.warnings?.length > 0 && <ul className="list-disc pl-5">{doc.ai.warnings.map((text, i) => <li key={i}>{text}</li>)}</ul>}{doc.ai.questions?.length > 0 && <div><strong>{L('Вопросы к врачу', 'Questions for your doctor', 'Дәрігерге сұрақтар')}</strong><ul className="list-disc pl-5 mt-1">{doc.ai.questions.map((text, i) => <li key={i}>{text}</li>)}</ul></div>}</div>}
  </Card>;
}
