/* CardioAI on a cardiology conclusion (.docx): the de-identified example from backend/data/examples or her own file.
   The server reads the document in memory (not stored, not sent to OpenAI) and returns the CardioAI feature row, visit
   dynamics and the model's class shares. Charts follow the dataviz rules: one axis per chart, legend for ≥2 series,
   diastolic lines dashed as a second encoding, a table next to every chart. Research output, not a diagnosis. */
import { useEffect, useRef, useState } from 'react';
import { ResponsiveContainer, BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend, LabelList, Cell } from 'recharts';
import { FileText, Upload, Download, HeartPulse, Info, AlertTriangle } from 'lucide-react';
import { Card, Badge } from '../../lib/ui.jsx';
import { useT } from '../../lib/i18n.jsx';
import { api } from '../../services/api.js';
import { fmtDate } from './Labs.jsx';

const C1 = '#0E9F9B'; const C2 = '#D97706'; // validated pair (CVD ΔE 14.9, normal ΔE 24.6)
const GRID = '#DDE9EE'; const AX = { fill: '#647C8B', fontSize: 11 };
const fmt = (v, d = 2) => (v == null ? '—' : Number(v.toFixed(d)).toLocaleString('ru-RU'));

function Chart({ title, note, children, height = 220 }) {
  return <div className="rounded-xl border border-line p-3 min-w-0">
    <div className="text-sm font-semibold mb-1">{title}</div>
    <div style={{ height }}><ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer></div>
    {note && <p className="muted text-xs mt-1">{note}</p>}
  </div>;
}

function Tip({ active, payload, label, unit, labelFmt }) {
  if (!active || !payload?.length) return null;
  return <div className="card p-2.5 text-xs shadow-sm">
    <div className="font-semibold mb-1">{labelFmt ? labelFmt(label) : label}</div>
    {payload.filter((p) => p.value != null).map((p) => <div key={p.dataKey} className="flex items-center gap-2"><span aria-hidden="true" style={{ color: p.color || p.fill }}>●</span><span>{p.name}:</span><span className="mono">{p.value}</span>{unit && <span className="muted">{unit}</span>}</div>)}
  </div>;
}

export default function CardioConclusion() {
  const { lang } = useT(); const L = (ru, en, kz) => ({ ru, en, kz })[lang] || ru;
  const [res, setRes] = useState(null); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const fileRef = useRef(null);
  const [variant, setVariant] = useState('original');
  const VARIANTS = [['original', L('Пример из 1.docx (обезличенный)', 'Example from 1.docx (de-identified)', '1.docx мысалы (иесіз)')], ['normal', L('Сгенерировать: без АГ', 'Generate: no hypertension', 'Жасау: АГ жоқ')],
    ['ag1', L('Сгенерировать: АГ 1 степени', 'Generate: stage 1', 'Жасау: АГ 1-дәреже')], ['ag2', L('Сгенерировать: АГ 2 степени', 'Generate: stage 2', 'Жасау: АГ 2-дәреже')], ['ag3', L('Сгенерировать: АГ 3 степени', 'Generate: stage 3', 'Жасау: АГ 3-дәреже')]];
  const load = (v) => { setVariant(v); run(() => api.cardioExample(v)); }; // a generated variant gets new random data on every call
  useEffect(() => { load('original'); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const run = async (fn) => { setBusy(true); setError(''); try { setRes(await fn()); } catch (e) { setError(e.detail?.code ? errorText(e.detail.code) : e.message); } finally { setBusy(false); } };
  const errorText = (code) => ({
    not_docx: L('Это не файл .docx.', 'This is not a .docx file.', 'Бұл .docx файлы емес.'),
    not_conclusion: L('В документе не найдено медицинское заключение с давлением (АДdex/АДsin).', 'No medical conclusion with blood pressure (АДdex/АДsin) was found.', 'Құжатта қысымы бар медициналық қорытынды табылмады.'),
    too_large: L('Документ слишком большой.', 'The document is too large.', 'Құжат тым үлкен.'),
  })[code] || code;
  const download = async () => { try { const u = await api.cardioExampleFile(res?.variant || 'original', res?.seed || 1); const a = document.createElement('a'); a.href = u; a.download = res?.variant && res.variant !== 'original' ? `conclusion_example_${res.variant}_${res.seed}.docx` : 'cardioai_conclusion_example.docx'; a.click(); setTimeout(() => URL.revokeObjectURL(u), 1000); } catch (e) { setError(e.message); } };
  const onFile = (f) => { if (!f) return; if (!/\.docx$/i.test(f.name)) { setError(errorText('not_docx')); return; } if (f.size > 10 * 1024 * 1024) { setError(L('Файл больше 10 МБ.', 'File is larger than 10 MB.', 'Файл 10 МБ-тан үлкен.')); return; } run(() => api.cardioConclusion(f)); };

  return <Card title={<span className="flex items-center gap-2"><HeartPulse size={16} />{L('CardioAI: кардиологическое заключение', 'CardioAI: cardiology conclusion', 'CardioAI: кардиологиялық қорытынды')}</span>}
    sub={L('Модель обучена на заключениях этого формата (.docx). Признаки извлекаются из текста и показываются на графиках.', 'The model was trained on conclusions in this format (.docx). Features are read from the text and charted.', 'Модель осы форматтағы қорытындыларда оқытылған (.docx). Белгілер мәтіннен алынып, графикте көрсетіледі.')}
    right={<Badge tone="moderate">{L('исследование', 'research', 'зерттеу')}</Badge>}>
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <select className="input py-1.5 w-auto" aria-label={L('Пример заключения', 'Example conclusion', 'Қорытынды мысалы')} value={res?.source === 'upload' ? '' : variant} disabled={busy} onChange={(e) => load(e.target.value)}>
        {res?.source === 'upload' && <option value="">{L('Загруженный документ', 'Uploaded document', 'Жүктелген құжат')}</option>}
        {VARIANTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
      {variant !== 'original' && res?.source !== 'upload' && <button type="button" className="btn" disabled={busy} onClick={() => load(variant)}><FileText size={14} />{L('Другой пример', 'Another example', 'Басқа мысал')}</button>}
      <button type="button" className="btn btn-primary" disabled={busy} onClick={() => fileRef.current?.click()}><Upload size={14} />{L('Загрузить своё заключение (.docx)', 'Upload your conclusion (.docx)', 'Өз қорытындыңызды жүктеу (.docx)')}</button>
      {res?.source !== 'upload' && <button type="button" className="text-sm underline" onClick={download}><Download size={13} className="inline mr-1" />{L('Скачать этот пример .docx', 'Download this example .docx', 'Осы мысалды .docx жүктеп алу')}</button>}
      <input ref={fileRef} type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="hidden" onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ''; }} />
    </div>
    <p className="muted text-xs mt-2 flex gap-1.5"><Info size={13} className="shrink-0 mt-0.5" />{L('Файл читается на сервере в памяти: не сохраняется в базе и не отправляется в OpenAI. Модель не валидирована для беременных и не ставит диагноз.', 'The file is read in server memory: not saved and not sent to OpenAI. The model is not validated for pregnancy and does not diagnose.', 'Файл сервер жадында оқылады: сақталмайды және OpenAI-ға жіберілмейді. Модель жүктілер үшін тексерілмеген, диагноз қоймайды.')}</p>
    {busy && <p className="muted text-sm mt-3">{L('Анализ документа…', 'Analysing the document…', 'Құжат талдануда…')}</p>}
    {error && <p role="alert" className="text-sm mt-3 flex gap-1.5" style={{ color: '#C62828' }}><AlertTriangle size={15} className="shrink-0 mt-0.5" />{error}</p>}
    {res && !busy && <Result res={res} L={L} lang={lang} />}
  </Card>;
}

function Result({ res, L, lang }) {
  const p = res.prediction; const f = res.features;
  const shares = p.class_shares.map((c) => ({ name: c.stage === 0 ? L('0 · степень не указана', '0 · stage not given', '0 · дәреже жоқ') : L(`степень ${c.stage}`, `stage ${c.stage}`, `${c.stage}-дәреже`), stage: c.stage, pct: Math.round(c.share * 1000) / 10 }));
  const top = shares.reduce((a, b) => (b.pct > a.pct ? b : a));
  const v0 = res.visits[0] || {};
  const limbs = [['arm_dex', L('Правая рука', 'Right arm', 'Оң қол')], ['arm_sin', L('Левая рука', 'Left arm', 'Сол қол')], ['leg_dex', L('Правая нога', 'Right leg', 'Оң аяқ')], ['leg_sin', L('Левая нога', 'Left leg', 'Сол аяқ')]]
    .map(([k, name]) => ({ name, sys: v0[`bp_${k}_upper`] ?? null, dia: v0[`bp_${k}_lower`] ?? null })).filter((r) => r.sys != null);
  const SYS = L('систолическое', 'systolic', 'систолалық'); const DIA = L('диастолическое', 'diastolic', 'диастолалық');
  const visits = res.visits.map((v) => ({ date: v.date, rs: v.bp_arm_dex_upper ?? null, rd: v.bp_arm_dex_lower ?? null, ls: v.bp_arm_sin_upper ?? null, ld: v.bp_arm_sin_lower ?? null, hr: v.heart_rate ?? null }));
  const labs = res.labs;
  const num = Object.fromEntries(f.numeric.map((x) => [x.name, x.value]));
  const lipids = [['total_cholesterol', L('Общий ХС', 'Total chol.', 'Жалпы ХС')], ['ldl', L('ЛПНП', 'LDL', 'ЛПНП')], ['hdl', L('ЛПВП', 'HDL', 'ЛПВП')], ['triglycerides', L('ТГ', 'TG', 'ТГ')]]
    .filter(([k]) => num[k] != null).map(([k, name]) => ({ name, value: num[k] }));
  const date = (d) => fmtDate(d, lang);
  const series = (key) => labs.filter((r) => r[key] != null).map((r) => ({ date: r.date, v: r[key] }));
  const creat = series('creatinine'); const gfr = series('gfr_ckd_epi');
  const label = res.diagnosis.document_label;
  return <div className="grid gap-4 mt-4">
    <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3">
      <div className="rounded-xl border border-line p-3"><div className="muted text-xs">{L('Класс модели', 'Model class', 'Модель класы')}</div><div className="text-xl font-semibold mt-1">{top.name}</div><div className="muted text-xs mt-1">{L('доля голосов деревьев', 'share of tree votes', 'ағаштар дауысының үлесі')}: <span className="mono">{top.pct}%</span></div></div>
      <div className="rounded-xl border border-line p-3"><div className="muted text-xs">{L('Разметка самого документа', 'Label in the document itself', 'Құжаттың өз белгісі')}</div><div className="text-xl font-semibold mt-1">{label === 0 ? L('0 · АГ не указана', '0 · no HTN stage', '0 · АГ көрсетілмеген') : L(`степень ${label}`, `stage ${label}`, `${label}-дәреже`)}</div><div className="muted text-xs mt-1">{L('как в обучении: «гипертензия N» в предв. диагнозе', 'as in training: "гипертензия N" in the preliminary diagnosis', 'оқытудағыдай: алдын ала диагноздағы «гипертензия N»')}</div></div>
      <div className="rounded-xl border border-line p-3"><div className="muted text-xs">{L('Признаков заполнено', 'Features supplied', 'Толтырылған белгілер')}</div><div className="text-xl font-semibold mt-1 mono">{f.numeric_supplied}/{f.numeric_total} · {f.categorical_supplied}/{f.categorical_total}</div><div className="muted text-xs mt-1">{L('числовых · категориальных', 'numeric · categorical', 'сандық · санаттық')}</div></div>
      <div className="rounded-xl border border-line p-3"><div className="muted text-xs">{L('Документ', 'Document', 'Құжат')}</div><div className="text-sm font-semibold mt-1 break-all">{res.source !== 'example' ? res.filename : res.variant && res.variant !== 'original' ? L('Сгенерированный пример', 'Generated example', 'Жасалған мысал') : L('Пример (обезличен)', 'Example (de-identified)', 'Мысал (иесіз)')}</div><div className="muted text-xs mt-1">{res.age != null ? L(`${res.age} лет`, `${res.age} y`, `${res.age} жас`) : ''}{res.gender !== 'unknown' ? ` · ${res.gender === 'female' ? L('женщина', 'female', 'әйел') : L('мужчина', 'male', 'ер')}` : ''} · {L('визитов', 'visits', 'қабылдау')}: {res.visits.length}</div></div>
    </div>

    <div className="grid gap-3 lg:grid-cols-2">
      <Chart title={L('CardioAI: доли голосов по классам, %', 'CardioAI: class vote shares, %', 'CardioAI: кластар бойынша дауыс үлесі, %')} note={L('Класс 0 означает, что в исходной разметке степень не была указана, — это не доказательство нормального давления.', 'Class 0 means no stage was given in the original labels — not proof of normal pressure.', '0-класс бастапқы белгілерде дәреже көрсетілмегенін білдіреді — қалыпты қысымның дәлелі емес.')}>
        <BarChart data={shares} layout="vertical" margin={{ left: 8, right: 40, top: 4, bottom: 4 }}>
          <CartesianGrid horizontal={false} stroke={GRID} strokeDasharray="3 6" />
          <XAxis type="number" domain={[0, 100]} tickLine={false} axisLine={false} tick={AX} unit="%" />
          <YAxis type="category" dataKey="name" width={150} tickLine={false} axisLine={false} tick={AX} />
          <Tooltip content={<Tip unit="%" />} cursor={{ fill: '#EEF5F7' }} />
          <Bar dataKey="pct" name={L('доля', 'share', 'үлес')} radius={[0, 4, 4, 0]} barSize={18} isAnimationActive={false}>
            {shares.map((s) => <Cell key={s.stage} fill={s.stage === top.stage ? C1 : '#A9BEC9'} />)}
            <LabelList dataKey="pct" position="right" formatter={(v) => `${v}%`} style={{ fill: '#33505F', fontSize: 11 }} />
          </Bar>
        </BarChart>
      </Chart>
      {limbs.length > 0 && <Chart title={L(`АД на конечностях, мм рт. ст. · ${date(v0.date)}`, `BP by limb, mmHg · ${date(v0.date)}`, `Аяқ-қолдағы қысым, мм с.б. · ${date(v0.date)}`)}
        note={num.lpi_dex != null ? L(`ЛПИ: справа ${fmt(num.lpi_dex)}, слева ${fmt(num.lpi_sin)}`, `ABI: right ${fmt(num.lpi_dex)}, left ${fmt(num.lpi_sin)}`, `ТЖИ: оң ${fmt(num.lpi_dex)}, сол ${fmt(num.lpi_sin)}`) : null}>
        <BarChart data={limbs} margin={{ left: 0, right: 8, top: 18, bottom: 4 }} barGap={2}>
          <CartesianGrid vertical={false} stroke={GRID} strokeDasharray="3 6" />
          <XAxis dataKey="name" tickLine={false} axisLine={false} tick={AX} />
          <YAxis tickLine={false} axisLine={false} tick={AX} width={40} domain={[0, 'auto']} />
          <Tooltip content={<Tip unit={L('мм рт. ст.', 'mmHg', 'мм с.б.')} />} cursor={{ fill: '#EEF5F7' }} />
          <Legend />
          <Bar dataKey="sys" name={SYS} fill={C1} radius={[4, 4, 0, 0]} isAnimationActive={false}><LabelList dataKey="sys" position="top" style={{ fill: '#33505F', fontSize: 11 }} /></Bar>
          <Bar dataKey="dia" name={DIA} fill={C2} radius={[4, 4, 0, 0]} isAnimationActive={false}><LabelList dataKey="dia" position="top" style={{ fill: '#33505F', fontSize: 11 }} /></Bar>
        </BarChart>
      </Chart>}
      {visits.length > 1 && <Chart title={L('АД на руках по визитам, мм рт. ст.', 'Arm BP by visit, mmHg', 'Қабылдаулар бойынша қолдағы қысым, мм с.б.')} note={L('Сплошная линия — систолическое, пунктир — диастолическое.', 'Solid — systolic, dashed — diastolic.', 'Тұтас — систолалық, үзік — диастолалық.')}>
        <LineChart data={visits} margin={{ left: 0, right: 16, top: 8, bottom: 4 }}>
          <CartesianGrid vertical={false} stroke={GRID} strokeDasharray="3 6" />
          <XAxis dataKey="date" tickFormatter={date} tickLine={false} axisLine={false} tick={AX} padding={{ left: 28, right: 28 }} />
          <YAxis tickLine={false} axisLine={false} tick={AX} width={40} domain={['auto', 'auto']} />
          <Tooltip content={<Tip unit={L('мм рт. ст.', 'mmHg', 'мм с.б.')} labelFmt={date} />} cursor={{ stroke: '#A9BEC9', strokeDasharray: '4 4' }} />
          <Legend />
          <Line dataKey="rs" name={L('правая, сист.', 'right, sys', 'оң, сист.')} stroke={C1} strokeWidth={2} dot={{ r: 4 }} connectNulls isAnimationActive={false} />
          <Line dataKey="rd" name={L('правая, диаст.', 'right, dia', 'оң, диаст.')} stroke={C1} strokeWidth={2} strokeDasharray="5 4" dot={{ r: 4 }} connectNulls isAnimationActive={false} />
          <Line dataKey="ls" name={L('левая, сист.', 'left, sys', 'сол, сист.')} stroke={C2} strokeWidth={2} dot={{ r: 4 }} connectNulls isAnimationActive={false} />
          <Line dataKey="ld" name={L('левая, диаст.', 'left, dia', 'сол, диаст.')} stroke={C2} strokeWidth={2} strokeDasharray="5 4" dot={{ r: 4 }} connectNulls isAnimationActive={false} />
        </LineChart>
      </Chart>}
      {visits.some((v) => v.hr != null) && visits.length > 1 && <Chart title={L('ЧСС по визитам, уд/мин', 'Heart rate by visit, bpm', 'Қабылдаулар бойынша ЖСЖ, соқ/мин')}>
        <LineChart data={visits} margin={{ left: 0, right: 16, top: 8, bottom: 4 }}>
          <CartesianGrid vertical={false} stroke={GRID} strokeDasharray="3 6" />
          <XAxis dataKey="date" tickFormatter={date} tickLine={false} axisLine={false} tick={AX} padding={{ left: 28, right: 28 }} />
          <YAxis tickLine={false} axisLine={false} tick={AX} width={40} domain={['auto', 'auto']} />
          <Tooltip content={<Tip unit={L('уд/мин', 'bpm', 'соқ/мин')} labelFmt={date} />} cursor={{ stroke: '#A9BEC9', strokeDasharray: '4 4' }} />
          <Line dataKey="hr" name={L('ЧСС', 'HR', 'ЖСЖ')} stroke={C1} strokeWidth={2} dot={{ r: 4 }} isAnimationActive={false} />
        </LineChart>
      </Chart>}
      {creat.length > 0 && <Chart title={L('Креатинин, мкмоль/л', 'Creatinine, µmol/L', 'Креатинин, мкмоль/л')} height={180}>
        <LineChart data={creat} margin={{ left: 0, right: 16, top: 16, bottom: 4 }}>
          <CartesianGrid vertical={false} stroke={GRID} strokeDasharray="3 6" />
          <XAxis dataKey="date" tickFormatter={date} tickLine={false} axisLine={false} tick={AX} padding={{ left: 28, right: 28 }} />
          <YAxis tickLine={false} axisLine={false} tick={AX} width={40} domain={['auto', 'auto']} />
          <Tooltip content={<Tip unit={L('мкмоль/л', 'µmol/L', 'мкмоль/л')} labelFmt={date} />} />
          <Line dataKey="v" name={L('креатинин', 'creatinine', 'креатинин')} stroke={C1} strokeWidth={2} dot={{ r: 4 }} isAnimationActive={false}><LabelList dataKey="v" position="top" style={{ fill: '#33505F', fontSize: 11 }} /></Line>
        </LineChart>
      </Chart>}
      {gfr.length > 0 && <Chart title={L('рСКФ (CKD-EPI), мл/мин/1,73 м²', 'eGFR (CKD-EPI), mL/min/1.73 m²', 'ШСЖ (CKD-EPI), мл/мин/1,73 м²')} height={180}>
        <LineChart data={gfr} margin={{ left: 0, right: 16, top: 16, bottom: 4 }}>
          <CartesianGrid vertical={false} stroke={GRID} strokeDasharray="3 6" />
          <XAxis dataKey="date" tickFormatter={date} tickLine={false} axisLine={false} tick={AX} padding={{ left: 28, right: 28 }} />
          <YAxis tickLine={false} axisLine={false} tick={AX} width={40} domain={['auto', 'auto']} />
          <Tooltip content={<Tip unit={L('мл/мин/1,73 м²', 'mL/min/1.73 m²', 'мл/мин/1,73 м²')} labelFmt={date} />} />
          <Line dataKey="v" name={L('рСКФ', 'eGFR', 'ШСЖ')} stroke={C1} strokeWidth={2} dot={{ r: 4 }} isAnimationActive={false}><LabelList dataKey="v" position="top" style={{ fill: '#33505F', fontSize: 11 }} /></Line>
        </LineChart>
      </Chart>}
      {lipids.length > 0 && <Chart title={L('Липидный профиль, ммоль/л', 'Lipid profile, mmol/L', 'Липидтік профиль, ммоль/л')} height={180} note={L('Референсы в заключении не напечатаны, поэтому нормы не показываются.', 'The conclusion prints no reference ranges, so none are shown.', 'Қорытындыда референс жоқ, сондықтан норма көрсетілмейді.')}>
        <BarChart data={lipids} margin={{ left: 0, right: 8, top: 18, bottom: 4 }}>
          <CartesianGrid vertical={false} stroke={GRID} strokeDasharray="3 6" />
          <XAxis dataKey="name" tickLine={false} axisLine={false} tick={AX} />
          <YAxis tickLine={false} axisLine={false} tick={AX} width={40} />
          <Tooltip content={<Tip unit={L('ммоль/л', 'mmol/L', 'ммоль/л')} />} cursor={{ fill: '#EEF5F7' }} />
          <Bar dataKey="value" name={L('значение', 'value', 'мәні')} fill={C1} radius={[4, 4, 0, 0]} barSize={36} isAnimationActive={false}><LabelList dataKey="value" position="top" style={{ fill: '#33505F', fontSize: 11 }} /></Bar>
        </BarChart>
      </Chart>}
    </div>

    {res.phenotype && <Phenotype ph={res.phenotype} labels={Object.fromEntries(f.numeric.map((x) => [x.name, x.label]))} L={L} lang={lang} />}

    <div className="overflow-x-auto"><table className="table text-sm">
      <thead><tr><th>{L('Визит', 'Visit', 'Қабылдау')}</th><th>{L('АД правая', 'BP right', 'Қысым оң')}</th><th>{L('АД левая', 'BP left', 'Қысым сол')}</th><th>{L('ЧСС', 'HR', 'ЖСЖ')}</th><th>CardioAI</th>{res.phenotype && <th>{L('Фенотип', 'Phenotype', 'Фенотип')}</th>}</tr></thead>
      <tbody>{res.per_visit.map((pv) => { const v = visits.find((x) => x.date === pv.date) || {}; const best = pv.class_shares.reduce((a, b) => (b.share > a.share ? b : a)); return <tr key={pv.date}>
        <td>{date(pv.date)}</td><td className="mono">{v.rs != null ? `${v.rs}/${v.rd}` : '—'}</td><td className="mono">{v.ls != null ? `${v.ls}/${v.ld}` : '—'}</td><td className="mono">{v.hr ?? '—'}</td>
        <td>{best.stage === 0 ? L('класс 0', 'class 0', '0-класс') : L(`степень ${best.stage}`, `stage ${best.stage}`, `${best.stage}-дәреже`)} <span className="muted mono text-xs">{Math.round(best.share * 100)}%</span></td>{res.phenotype && <td>{pv.phenotype != null ? `${pv.phenotype} · ${res.phenotype.clusters[pv.phenotype]?.name?.[lang] || ''}` : '—'}</td>}</tr>; })}</tbody>
    </table></div>

    {(res.diagnosis.preliminary || res.diagnosis.final) && <div className="rounded-xl border border-line p-3 text-sm grid gap-1">
      {res.diagnosis.preliminary && <div><span className="muted">{L('Предварительный диагноз', 'Preliminary diagnosis', 'Алдын ала диагноз')}:</span> {res.diagnosis.preliminary}</div>}
      {res.diagnosis.final && <div><span className="muted">{L('Заключительный диагноз', 'Final diagnosis', 'Қорытынды диагноз')}:</span> {res.diagnosis.final}</div>}
    </div>}

    <details className="rounded-xl border border-line p-3">
      <summary className="cursor-pointer text-sm font-semibold">{L('Все признаки модели и где они найдены', 'All model features and where they were found', 'Модельдің барлық белгілері және табылған жері')}</summary>
      <div className="overflow-x-auto mt-3"><table className="table text-xs">
        <thead><tr><th>{L('Признак', 'Feature', 'Белгі')}</th><th>{L('Значение', 'Value', 'Мәні')}</th><th>{L('Фрагмент документа', 'Document excerpt', 'Құжат үзіндісі')}</th></tr></thead>
        <tbody>
          {f.numeric.map((x) => <tr key={`n-${x.name}`}><td><span className="mono">{x.name}</span>{x.label && <div className="muted">{x.label}</div>}</td>
            <td className="mono">{x.value != null ? x.value : <span className="muted">{L('нет → среднее обучения', 'missing → training mean', 'жоқ → оқыту ортасы')} {fmt(x.training_mean)}</span>}</td><td className="muted">{x.source || ''}</td></tr>)}
          {f.categorical.map((x) => <tr key={`c-${x.name}`}><td><span className="mono">{x.name}</span> <span className="muted">{L('(категория)', '(category)', '(санат)')}</span></td>
            <td>{x.value != null ? String(x.value) : <span className="muted">unknown</span>}</td><td className="muted">{x.source || ''}</td></tr>)}
        </tbody>
      </table></div>
      <p className="muted text-xs mt-2">{L('Свободный текст (жалобы, описание ЭхоКГ) исходный CardioAI сокращал через LLM; здесь он не воспроизводится и остаётся unknown.', 'Free text (complaints, echo description) was summarised by an LLM in the original CardioAI; it is not reproduced here and stays unknown.', 'Еркін мәтінді (шағымдар, ЭхоКГ) бастапқы CardioAI LLM арқылы қысқартқан; мұнда ол unknown болып қалады.')}</p>
    </details>
  </div>;
}

/* CardioAI phenotype: KMeans over 38 numeric features. Closeness = inverse distance share to each cluster centre. */
function Phenotype({ ph, labels, L, lang }) {
  const own = ph.clusters[ph.cluster];
  const bars = ph.clusters.map((c) => ({ name: `${c.cluster} · ${c.name?.[lang] || ''}`, cluster: c.cluster, pct: Math.round(c.closeness * 1000) / 10 }));
  return <div className="rounded-xl border border-line p-3 grid gap-3">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div><div className="text-sm font-semibold">{L('Фенотип CardioAI (кластеризация)', 'CardioAI phenotype (clustering)', 'CardioAI фенотипі (кластерлеу)')}</div>
        <div className="muted text-xs">{L('Модель без учителя: к какой из 3 групп пациентов обучающей выборки заключение ближе всего', 'Unsupervised model: which of 3 patient groups of the training data the conclusion is closest to', 'Мұғалімсіз модель: қорытынды оқыту деректеріндегі 3 топтың қайсысына жақын')}</div></div>
      <div className="text-right"><div className="text-lg font-semibold">{L('Кластер', 'Cluster', 'Кластер')} {ph.cluster}</div><div className="text-sm">{own.name?.[lang]}</div></div>
    </div>
    <div className="grid gap-3 lg:grid-cols-2">
      <div style={{ height: 150 }}><ResponsiveContainer width="100%" height="100%">
        <BarChart data={bars} layout="vertical" margin={{ left: 4, right: 44, top: 4, bottom: 4 }}>
          <CartesianGrid horizontal={false} stroke={GRID} strokeDasharray="3 6" />
          <XAxis type="number" domain={[0, 100]} unit="%" tickLine={false} axisLine={false} tick={AX} />
          <YAxis type="category" dataKey="name" width={190} tickLine={false} axisLine={false} tick={AX} />
          <Tooltip content={<Tip unit="%" />} cursor={{ fill: '#EEF5F7' }} />
          <Bar dataKey="pct" name={L('близость', 'closeness', 'жақындық')} radius={[0, 4, 4, 0]} barSize={16} isAnimationActive={false}>
            {bars.map((b) => <Cell key={b.cluster} fill={b.cluster === ph.cluster ? C1 : '#A9BEC9'} />)}
            <LabelList dataKey="pct" position="right" formatter={(v) => `${v}%`} style={{ fill: '#33505F', fontSize: 11 }} />
          </Bar>
        </BarChart></ResponsiveContainer></div>
      <div className="overflow-x-auto"><table className="table text-xs">
        <thead><tr><th>{L('Отличает кластер', 'Distinguishes the cluster', 'Кластерді ажыратады')}</th><th>{L('Центр кластера', 'Cluster centre', 'Кластер орталығы')}</th><th>{L('Заключение', 'Conclusion', 'Қорытынды')}</th></tr></thead>
        <tbody>{own.key_features.map((k) => <tr key={k.name}><td>{labels[k.name] || k.name}</td><td className="mono">{k.center_value} <span className="muted">({k.center_z > 0 ? '↑' : '↓'})</span></td><td className="mono">{k.patient_value ?? '—'}</td></tr>)}</tbody>
      </table></div>
    </div>
    <p className="muted text-xs">{L(`Близость — доля обратного расстояния до центра кластера. Названия кластеров даны по их центрам: в исходном CardioAI все три подписаны одинаково («Функциональный / аритмический фенотип»). Признаков заполнено ${ph.numeric_supplied}/${ph.numeric_total}.`, `Closeness is the share of inverse distance to each centre. Cluster names describe their centres: the original CardioAI labels all three the same. Features supplied ${ph.numeric_supplied}/${ph.numeric_total}.`, `Жақындық — орталыққа дейінгі кері қашықтық үлесі. Кластер атаулары орталықтары бойынша берілген. Толтырылған белгілер ${ph.numeric_supplied}/${ph.numeric_total}.`)}</p>
  </div>;
}
