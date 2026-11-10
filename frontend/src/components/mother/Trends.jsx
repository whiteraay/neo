/* «Динамика»: confirmed values by week of pregnancy, home readings, and plain prompts from fixed rules. docs/maternal_labs.md */
import { useEffect, useMemo, useState } from 'react';
import { ResponsiveContainer, LineChart, Line, BarChart, Bar, LabelList, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine, ReferenceArea, Legend } from 'recharts';
import { Plus, AlertTriangle, MessageCircle, Info, Trash2, LineChart as LineIcon } from 'lucide-react';
import { Card, Badge } from '../../lib/ui.jsx';
import { useT } from '../../lib/i18n.jsx';
import { api } from '../../services/api.js';
import { labPointStatus, hbCutoff, POINT_COLORS } from '../../lib/labPointStatus.js';
import Hypertension from './Hypertension.jsx';
import CardioConclusion from './CardioConclusion.jsx';
import HeadCircumference from './HeadCircumference.jsx';
import { fmtDate, fmtGa, testName, unitLabel, StudySummary } from './Labs.jsx';

const COLORS = ['#0E9F9B', '#D97706', '#6D5BD0']; // validated categorical order (CVD ΔE ≥ 14)
const GLUCOSE = ['glucose', 'ogtt_0', 'ogtt_1h', 'ogtt_2h'];
/* Five categories instead of one per lab group: similar results are shown together. */
const CATEGORIES = ['blood', 'exam', 'urine', 'ultrasound', 'cardio'];
const CATEGORY_OF_GROUP = { cbc: 'blood', biochem: 'blood', thyroid: 'blood', ogtt: 'blood', exam: 'exam', urine: 'urine', ultrasound: 'ultrasound', pelvis: 'ultrasound' };
const groupOf = (c, catalog) => catalog.find((x) => x.code === c)?.group;
const subFor = (c, catalog) => (GLUCOSE.includes(c) ? 'glucose' : groupOf(c, catalog));
const categoryFor = (c, catalog) => CATEGORY_OF_GROUP[groupOf(c, catalog)];
const BLOOD_SECTIONS = ['cbc', 'glucose', 'biochem', 'thyroid'];
/* Charts that combine series of one unit, so related values are read together. */
const COMBINED = { exam: [['bp_sys', 'bp_dia'], ['weight']], ultrasound: [['follicles_r', 'follicles_l'], ['ovary_r_length', 'ovary_l_length'], ['endometrium'], ['uterus_length']] };

/** Timeline points may carry ref_low / ref_high / laboratory; when the server omits them, take them from the documents. */
function enrich(series, docs) {
  const byObs = {}; for (const d of docs || []) for (const o of d.observations) byObs[o.id] = { ref_low: o.ref_low, ref_high: o.ref_high, laboratory: d.laboratory };
  const out = {}; for (const [code, pts] of Object.entries(series || {})) out[code] = pts.map((p) => ({ ...byObs[p.observation_id], ...Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined)) }));
  return out;
}

export const alertText = (a, t, tx, catalog, lang) => {
  const name = testName(catalog, a.test, lang);
  return t(`rule.${a.code}`, { test: name, value: a.value ?? '', unit: unitLabel(a.unit, tx), prev: a.previous ?? '', delta: a.delta != null ? Math.abs(a.delta) : '' });
};

export function Alerts({ alerts, catalog }) {
  const { t, tx, lang } = useT();
  if (!alerts) return null;
  const style = { urgent: { border: '#FCA5A5', background: '#FEE2E2', color: '#991B1B' }, discuss: { border: '#FCD34D', background: '#FEF3C7', color: '#92400E' }, info: { border: 'var(--line, #D9E8EC)', background: 'transparent', color: 'inherit' } };
  const icon = { urgent: AlertTriangle, discuss: MessageCircle, info: Info };
  return (
    <div className="grid gap-2">
      {alerts.length === 0 && <div className="muted text-sm">{t('trend.noAlerts')}</div>}
      {alerts.map((a, i) => { const I = icon[a.level] || Info; const s = style[a.level] || style.info; return (
        <div key={`${a.code}-${a.test}-${i}`} className="rounded-md border p-3 text-sm flex gap-2.5" style={{ borderColor: s.border, background: s.background, color: s.color }}>
          <I size={16} className="shrink-0 mt-0.5" />
          <div className="min-w-0"><div className="font-semibold">{t(`level.${a.level}`)}</div><div>{alertText(a, t, tx, catalog, lang)}</div>
            <div className="text-xs opacity-80 mt-0.5">{fmtDate(a.date, lang)}{a.ga_days != null ? ` · ${fmtGa(a.ga_days, t)}` : ''}</div></div>
        </div>); })}
      <p className="muted text-xs flex gap-1.5"><Info size={13} className="shrink-0 mt-0.5" />{t('trend.disclaimer')}</p>
    </div>
  );
}

function PointStatus({ code, point }) {
  const { t } = useT(); const status = labPointStatus(code, point);
  return <span className={`lab-status lab-status-${status.level}`} title={t(`chart.reason.${status.reason}`)}><span aria-hidden="true">{status.level === 'critical' ? '▲' : status.level === 'warning' ? '◆' : '●'}</span>{t(`chart.status.${status.level}`)}</span>;
}

function StatusDot({ cx, cy, payload, code, active = false }) {
  if (!Number.isFinite(cx) || !Number.isFinite(cy) || !payload?.pts?.[code]) return null;
  const point = payload.pts[code]; const status = labPointStatus(code, point); const r = active ? 7 : 5;
  return <g aria-label={`${point.value} ${point.unit}`}>
    <circle cx={cx} cy={cy} r={r + 4} fill={status.color} fillOpacity={active ? 0.16 : 0.08} />
    {status.level === 'critical' ? <path d={`M ${cx} ${cy-r-1} L ${cx+r+1} ${cy+r} L ${cx-r-1} ${cy+r} Z`} fill={status.color} stroke="white" strokeWidth={1.5} /> : status.level === 'warning' ? <path d={`M ${cx} ${cy-r-1} L ${cx+r+1} ${cy} L ${cx} ${cy+r+1} L ${cx-r-1} ${cy} Z`} fill={status.color} stroke="white" strokeWidth={1.5} /> : <circle cx={cx} cy={cy} r={r} fill={status.color} stroke="white" strokeWidth={2} />}
  </g>;
}

/* one chart, several series; x = week of pregnancy, or the date when the pregnancy record is missing */
function SeriesChart({ codes, series, catalog, refLines = [], band = null, height = 'h-64' }) {
  const { t, tx, lang } = useT();
  const present = codes.filter((c) => series[c]?.length);
  const byWeek = present.every((c) => series[c].every((p) => p.ga_days != null));
  const xOf = (p) => (byWeek ? p.ga_days / 7 : new Date(`${p.date}T00:00:00`).getTime());
  const rows = useMemo(() => {
    if (present.length === 1) { const code = present[0]; return series[code].filter((p) => p.value != null).map((p) => ({ x: xOf(p), [code]: p.value, pts: { [code]: p } })).sort((a, b) => a.x - b.x); }
    const m = new Map();
    for (const c of present) for (const p of series[c]) { if (p.value == null) continue; const x = xOf(p); const r = m.get(x) || { x, pts: {} }; r[c] = p.value; r.pts[c] = p; m.set(x, r); }
    return [...m.values()].sort((a, b) => a.x - b.x);
  }, [series, present.join(), byWeek]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!present.length || !rows.length) return <div className={`${height} grid place-items-center muted text-sm border border-dashed border-line-strong rounded-md`}>{t('trend.noData')}</div>;
  const unit = unitLabel(series[present[0]][0].unit, tx);
  const xs = rows.map((r) => r.x); const longSpan = !byWeek && xs.length > 1 && Math.max(...xs) - Math.min(...xs) > 300 * 86400000; // more than ~10 months: show the year
  // Axis: at least ±2 weeks around the data, ticks on whole weeks (or whole days), so one or two points do not look lost
  const lo0 = Math.min(...xs); const hi0 = Math.max(...xs); const minPad = byWeek ? 2 : 14 * 86400000;
  const pad = Math.max((hi0 - lo0) * 0.08, minPad);
  let lo = lo0 - pad; let hi = hi0 + pad;
  let ticks;
  if (byWeek) { lo = Math.floor(lo); hi = Math.ceil(hi); const step = [1, 2, 4, 8].find((s) => (hi - lo) / s <= 7) || 8; ticks = []; for (let w = Math.ceil(lo / step) * step; w <= hi; w += step) ticks.push(w); }
  const tick = (x) => (byWeek ? t('trend.wk', { n: Math.round(x) }) : new Date(x).toLocaleDateString(lang === 'en' ? 'en-GB' : lang === 'kz' ? 'kk-KZ' : 'ru-RU', longSpan ? { month: '2-digit', year: '2-digit' } : { day: '2-digit', month: '2-digit' }));
  const Tip = ({ active, payload }) => {
    if (!active || !payload?.length) return null; const r = payload[0].payload;
    return (
      <div className="card p-2.5 text-xs shadow-sm">
        {present.filter((c) => r.pts[c]).map((c) => { const p = r.pts[c]; return (
          <div key={c} className="mb-1 last:mb-0"><div className="font-semibold">{testName(catalog, c, lang)}: <span className="mono">{p.value}</span> {unitLabel(p.unit, tx)}</div>
            <div className="my-1.5"><PointStatus code={c} point={p} /></div>
            <div className="muted mb-1">{t(`chart.reason.${labPointStatus(c, p).reason}`)}</div>
            <div className="muted">{fmtDate(p.date, lang)}{p.ga_days != null ? ` · ${fmtGa(p.ga_days, t)}` : ''}{p.laboratory ? ` · ${p.laboratory}` : ''}{p.manual ? ` · ${t('trend.home')}` : ''}</div></div>); })}
      </div>);
  };
  return (
    <div className="lab-chart">
      <div className="lab-chart-legend" aria-label={t('chart.legend')}>
        {Object.entries(POINT_COLORS).map(([level, color]) => <span key={level}><span aria-hidden="true" style={{ color }}>{level === 'critical' ? '▲' : level === 'warning' ? '◆' : '●'}</span>{t(`chart.status.${level}`)}</span>)}
      </div>
      <div className={height}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{ left: 0, right: 28, top: 18, bottom: 6 }}>
          <CartesianGrid vertical={false} stroke="#DDE9EE" strokeDasharray="3 6" />
          <XAxis dataKey="x" type="number" domain={[lo, hi]} ticks={ticks} tickFormatter={tick} tickLine={false} axisLine={false} minTickGap={35} tick={{ fill: '#647C8B', fontSize: 11 }} />
          <YAxis tickLine={false} axisLine={false} tick={{ fill: '#647C8B', fontSize: 11 }} tickFormatter={(v) => Number(v.toFixed(2))} width={56} domain={['auto', 'auto']} label={{ value: unit, angle: -90, position: 'insideLeft', offset: 18, fontSize: 11 }} />
          <Tooltip content={<Tip />} cursor={{ stroke: '#A9BEC9', strokeDasharray: '4 4' }} />
          {band && <ReferenceArea y1={band[0]} y2={band[1]} fill="#16A34A" fillOpacity={0.07} />}
          {(present.includes('hb') ? [...new Set(series.hb.map(hbCutoff).filter((x) => x != null))].map((y) => [y, '#B77908']) : refLines).map(([y, color]) => <ReferenceLine key={y} y={y} stroke={color} strokeDasharray="4 4" label={{ value: String(y), position: 'right', fontSize: 10, fill: color }} />)}
          {present.length > 1 && <Legend formatter={(c) => testName(catalog, c, lang)} />}
          {present.map((c, i) => <Line key={c} dataKey={c} name={c} stroke={COLORS[i % COLORS.length]} strokeWidth={2.2} dot={(props) => <StatusDot {...props} key={props.payload?.pts?.[c]?.observation_id || `${c}-${props.index}`} code={c} />} activeDot={(props) => <StatusDot {...props} code={c} active />} connectNulls isAnimationActive={false} />)}
        </LineChart>
      </ResponsiveContainer>
      </div>
      <p className="muted text-xs mt-2">{t('chart.note')}</p>
    </div>
  );
}

/* Pelvic ultrasound: the latest study as one picture (right vs left ovary, uterus sizes); no ranges are printed on such reports. */
const OVARY = [['length', 'ovary_r_length', 'ovary_l_length'], ['width', 'ovary_r_width', 'ovary_l_width'], ['follicle', 'follicle_r_mm', 'follicle_l_mm']];
const UTERUS = ['uterus_length', 'uterus_ap', 'uterus_width', 'endometrium', 'cervix_length', 'cervix_width'];
function PelvisStudy({ series, docs, catalog }) {
  const { t, tx, lang } = useT();
  const order = (c) => { const i = catalog.findIndex((x) => x.code === c); return i < 0 ? 999 : i; };
  const codes = Object.keys(series).filter((c) => groupOf(c, catalog) === 'pelvis').sort((a, b) => order(a) - order(b));
  const dates = [...new Set(codes.flatMap((c) => series[c].map((p) => p.date)))].sort();
  const [picked, setPicked] = useState(null);
  if (!dates.length) return null;
  const day = dates.includes(picked) ? picked : dates[dates.length - 1];
  const at = (c) => series[c]?.find((p) => p.date === day && p.value != null);
  const doc = docs.find((d) => codes.some((c) => at(c)?.document_id === d.id));
  const side = (key) => ({ length: t('pel.length'), width: t('pel.width'), follicle: t('pel.follicle') })[key];
  const ovary = OVARY.map(([k, r, l]) => ({ name: side(k), right: at(r)?.value ?? null, left: at(l)?.value ?? null })).filter((x) => x.right != null || x.left != null);
  const uterus = UTERUS.filter((c) => at(c)).map((c) => ({ name: t(`pel.${c}`), code: c, value: at(c).value }));
  const counts = [['follicles_r', t('pel.right')], ['follicles_l', t('pel.left')]].filter(([c]) => at(c));
  const AX = { fill: '#647C8B', fontSize: 11 }; const mm = unitLabel('mm', tx);
  const Tip = ({ active, payload, label }) => active && payload?.length ? <div className="card p-2.5 text-xs shadow-sm"><div className="font-semibold mb-1">{label}</div>{payload.filter((p) => p.value != null).map((p) => <div key={p.dataKey}><span style={{ color: p.fill }}>● </span>{p.name}: <span className="mono">{p.value}</span> {mm}</div>)}</div> : null;
  return <>
    <Card title={<span className="flex items-center gap-2"><LineIcon size={16} />{t('pel.title')}</span>} sub={t('pel.studies', { n: dates.length })}
      right={dates.length > 1 ? <select className="input py-1 text-sm w-auto" aria-label={t('pel.pick')} value={day} onChange={(e) => setPicked(e.target.value)}>{[...dates].reverse().map((d) => <option key={d} value={d}>{fmtDate(d, lang)}</option>)}</select> : <span className="text-sm">{fmtDate(day, lang)}</span>}>
      <div className="grid gap-3 lg:grid-cols-2">
        {ovary.length > 0 && <div className="rounded-xl border border-line p-3 min-w-0"><div className="text-sm font-semibold mb-1">{t('pel.ovaries')}, {mm}</div>
          <div className="h-56"><ResponsiveContainer width="100%" height="100%"><BarChart data={ovary} margin={{ left: 0, right: 8, top: 18, bottom: 4 }} barGap={2}>
            <CartesianGrid vertical={false} stroke="#DDE9EE" strokeDasharray="3 6" />
            <XAxis dataKey="name" tickLine={false} axisLine={false} tick={AX} /><YAxis tickLine={false} axisLine={false} tick={AX} width={36} />
            <Tooltip content={<Tip />} cursor={{ fill: '#EEF5F7' }} /><Legend />
            <Bar dataKey="right" name={t('pel.right')} fill="#0E9F9B" radius={[4, 4, 0, 0]} isAnimationActive={false}><LabelList dataKey="right" position="top" style={{ fill: '#33505F', fontSize: 11 }} /></Bar>
            <Bar dataKey="left" name={t('pel.left')} fill="#D97706" radius={[4, 4, 0, 0]} isAnimationActive={false}><LabelList dataKey="left" position="top" style={{ fill: '#33505F', fontSize: 11 }} /></Bar>
          </BarChart></ResponsiveContainer></div>
          {counts.length > 0 && <p className="text-xs mt-1"><span className="muted">{t('pel.counts')}:</span> {counts.map(([c, n]) => `${n} ${at(c).value}`).join(' · ')}</p>}</div>}
        {uterus.length > 0 && <div className="rounded-xl border border-line p-3 min-w-0"><div className="text-sm font-semibold mb-1">{t('pel.uterus')}, {mm}</div>
          <div className="h-56"><ResponsiveContainer width="100%" height="100%"><BarChart data={uterus} layout="vertical" margin={{ left: 4, right: 36, top: 4, bottom: 4 }}>
            <CartesianGrid horizontal={false} stroke="#DDE9EE" strokeDasharray="3 6" />
            <XAxis type="number" tickLine={false} axisLine={false} tick={AX} /><YAxis type="category" dataKey="name" width={150} tickLine={false} axisLine={false} tick={AX} />
            <Tooltip content={<Tip />} cursor={{ fill: '#EEF5F7' }} />
            <Bar dataKey="value" name={t('pel.size')} fill="#0E9F9B" radius={[0, 4, 4, 0]} barSize={16} isAnimationActive={false}><LabelList dataKey="value" position="right" style={{ fill: '#33505F', fontSize: 11 }} /></Bar>
          </BarChart></ResponsiveContainer></div></div>}
      </div>
      <div className="overflow-x-auto mt-3"><table className="table text-sm"><thead><tr><th>{t('lab.col.test')}</th><th>{t('lab.col.value')}</th><th>{t('lab.asPrinted')}</th></tr></thead>
        <tbody>{codes.filter((c) => at(c)).map((c) => <tr key={c}><td>{testName(catalog, c, lang)}</td><td className="mono">{at(c).value} {unitLabel(at(c).unit, tx)}</td><td className="muted">{doc?.observations?.find((o) => o.id === at(c).observation_id)?.original_value ?? ''} {unitLabel(doc?.observations?.find((o) => o.id === at(c).observation_id)?.original_unit, tx)}</td></tr>)}</tbody></table></div>
      <p className="muted text-xs mt-2">{t('pel.note')}</p>
    </Card>
    {doc?.summary && <StudySummary summary={doc.summary} />}
  </>;
}

const lastBand = (pts) => { const numeric = (pts || []).filter((p) => p.value != null); const first = numeric[0]; return first && Number.isFinite(first.ref_low) && Number.isFinite(first.ref_high) && first.ref_low <= first.ref_high && numeric.every((p) => p.ref_low === first.ref_low && p.ref_high === first.ref_high) ? [first.ref_low, first.ref_high] : null; };

function HomeReading({ onSaved }) {
  const { t } = useT();
  const today = new Date().toISOString().slice(0, 10);
  const [kind, setKind] = useState('bp'); const [date, setDate] = useState(today); const [sys, setSys] = useState(''); const [dia, setDia] = useState(''); const [kg, setKg] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState(null); const [ok, setOk] = useState(false);
  const num = (v) => parseFloat(String(v).replace(',', '.'));
  const valid = date && date <= today && (kind === 'bp' ? num(sys) >= 60 && num(sys) <= 260 && num(dia) >= 30 && num(dia) <= 160 : num(kg) >= 30 && num(kg) <= 250);
  const save = async (e) => {
    e.preventDefault(); if (!valid) return; setBusy(true); setError(null); setOk(false);
    try {
      if (kind === 'bp') { await api.addObservation({ code: 'bp_sys', value: num(sys), unit: 'mmHg', specimen_date: date }); await api.addObservation({ code: 'bp_dia', value: num(dia), unit: 'mmHg', specimen_date: date }); setSys(''); setDia(''); }
      else { await api.addObservation({ code: 'weight', value: num(kg), unit: 'kg', specimen_date: date }); setKg(''); }
      setOk(true); onSaved();
    } catch (er) { setError(er.message); } finally { setBusy(false); }
  };
  return (
    <form className="grid gap-2" onSubmit={save}>
      <div className="flex gap-2">{[['bp', t('trend.bp')], ['weight', t('trend.weight')]].map(([k, l]) => <button key={k} type="button" className={`btn flex-1 ${kind === k ? 'btn-dark' : ''}`} onClick={() => setKind(k)}>{l}</button>)}</div>
      <label className="text-xs"><span className="muted block">{t('trend.date')}</span><input type="date" className="input py-1.5" max={today} value={date} onChange={(e) => setDate(e.target.value)} /></label>
      {kind === 'bp' ? (
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs"><span className="muted block">{t('trend.sys')}</span><input className="input mono py-1.5" inputMode="numeric" value={sys} onChange={(e) => setSys(e.target.value)} placeholder="120" /></label>
          <label className="text-xs"><span className="muted block">{t('trend.dia')}</span><input className="input mono py-1.5" inputMode="numeric" value={dia} onChange={(e) => setDia(e.target.value)} placeholder="80" /></label>
        </div>
      ) : <label className="text-xs"><span className="muted block">{t('trend.kg')}</span><input className="input mono py-1.5" inputMode="decimal" value={kg} onChange={(e) => setKg(e.target.value)} placeholder="68.5" /></label>}
      <button type="submit" className="btn btn-primary" disabled={!valid || busy}><Plus size={14} />{t('trend.add')}</button>
      {ok && <div className="text-xs" style={{ color: '#15803D' }}>{t('trend.added')}</div>}
      {error && <div className="text-xs" style={{ color: '#C62828' }}>{error}</div>}
    </form>
  );
}

/* OGTT is one test (usually at 24–28 weeks): show it as its curve — fasting, 1 h, 2 h — against the WHO 2013 thresholds. */
const OGTT = [['ogtt_0', 5.1], ['ogtt_1h', 10.0], ['ogtt_2h', 8.5]];
function OgttCurve({ series }) {
  const { t, tx, lang } = useT();
  const dates = [...new Set(OGTT.flatMap(([c]) => (series[c] || []).filter((p) => p.value != null).map((p) => p.date)))].sort().slice(-3);
  if (!dates.length) return null;
  const stage = { ogtt_0: t('ogtt.fasting'), ogtt_1h: t('ogtt.h1'), ogtt_2h: t('ogtt.h2') };
  const data = OGTT.map(([c, thr]) => ({ name: stage[c], thr, ...Object.fromEntries(dates.map((d) => [d, series[c]?.find((p) => p.date === d)?.value ?? null])) }));
  const AX = { fill: '#647C8B', fontSize: 11 }; const unit = unitLabel('mmol/L', tx);
  const flagged = OGTT.filter(([c, thr]) => dates.some((d) => (series[c]?.find((p) => p.date === d)?.value ?? 0) >= thr));
  const Tip = ({ active, payload, label }) => active && payload?.length ? <div className="card p-2.5 text-xs shadow-sm"><div className="font-semibold mb-1">{label}</div>
    {payload.filter((p) => p.value != null).map((p) => <div key={p.dataKey}><span style={{ color: p.color }}>● </span>{p.name}: <span className="mono">{p.value}</span> {unit}</div>)}</div> : null;
  return <Card title={<span className="flex items-center gap-2"><LineIcon size={16} />{t('ogtt.title')}</span>} sub={t('ogtt.sub')}>
    <div className="h-60"><ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ left: 0, right: 24, top: 18, bottom: 4 }}>
        <CartesianGrid vertical={false} stroke="#DDE9EE" strokeDasharray="3 6" />
        <XAxis dataKey="name" tickLine={false} axisLine={false} tick={AX} padding={{ left: 40, right: 40 }} />
        <YAxis tickLine={false} axisLine={false} tick={AX} width={44} domain={[0, (max) => Math.ceil(Math.max(max, 11) + 1)]} label={{ value: unit, angle: -90, position: 'insideLeft', offset: 14, fontSize: 11 }} />
        <Tooltip content={<Tip />} cursor={{ stroke: '#A9BEC9', strokeDasharray: '4 4' }} />
        <Legend />
        <Line dataKey="thr" name={t('ogtt.threshold')} stroke="#D34253" strokeWidth={1.5} strokeDasharray="5 4" dot={{ r: 3, fill: '#D34253' }} isAnimationActive={false} />
        {dates.map((d, i) => <Line key={d} dataKey={d} name={`${t('ogtt.test')} ${fmtDate(d, lang)}`} stroke={COLORS[i % COLORS.length]} strokeWidth={2.4} dot={{ r: 5 }} isAnimationActive={false}>
          <LabelList dataKey={d} position="top" style={{ fill: '#33505F', fontSize: 11 }} /></Line>)}
      </LineChart>
    </ResponsiveContainer></div>
    <p className="text-xs mt-2" style={flagged.length ? { color: '#B45309' } : undefined}>{flagged.length ? t('ogtt.flagged', { list: flagged.map(([c]) => stage[c]).join(', ') }) : t('ogtt.ok')}</p>
  </Card>;
}

function ChartCard({ codes, series, catalog, title, docs, onRemove }) {
  const { t, tx, lang } = useT();
  const single = codes.length === 1 ? codes[0] : null;
  const refLines = codes.includes('hb') ? [[110, '#B77908']] : codes.includes('bp_sys') ? [[140, '#D34253'], [90, '#B77908']] : [];
  const rows = codes.flatMap((c) => (series[c] || []).map((p) => ({ ...p, code: c }))).sort((a, b) => b.date.localeCompare(a.date));
  return <Card title={<span className="flex items-center gap-2"><LineIcon size={16} />{title || testName(catalog, single, lang)}</span>} sub={single === 'hb' ? t('chart.hbNote') : null}>
    <SeriesChart codes={codes} series={series} catalog={catalog} refLines={refLines} band={single ? lastBand(series[single]) : null} height="h-52" />
    <details className="mt-2"><summary className="cursor-pointer text-xs muted">{t('trend.table', { n: rows.length })}</summary>
      <div className="overflow-x-auto mt-2"><table className="table text-sm"><thead><tr><th>{t('trend.date')}</th><th>{t('lab.gaShort')}</th>{!single && <th>{t('lab.col.test')}</th>}<th>{t('lab.col.value')}</th><th>{t('chart.statusTitle')}</th><th>{t('lab.laboratory')}</th><th /></tr></thead>
        <tbody>{rows.map((p) => <tr key={p.observation_id}><td>{fmtDate(p.date, lang)}</td><td>{fmtGa(p.ga_days, t)}</td>{!single && <td>{testName(catalog, p.code, lang)}</td>}<td className="mono">{p.value ?? p.value_text} {unitLabel(p.unit, tx)}</td><td><PointStatus code={p.code} point={p} /></td><td>{p.manual ? t('trend.home') : (p.laboratory || '—')}{docs.find((d) => d.id === p.document_id)?.demo && <span className="ml-2">DEMO</span>}</td>
          <td>{p.manual && <button type="button" className="btn px-2 py-1" aria-label={t('lab.delete')} onClick={() => onRemove(p.observation_id)}><Trash2 size={13} /></button>}</td></tr>)}</tbody></table></div></details>
  </Card>;
}

export default function Trends({ onGoLabs }) {
  const { t, tx, lang } = useT();
  const [category, setCategory] = useState('blood');
  const today = new Date().toLocaleDateString('en-CA');
  const [demoDate, setDemoDate] = useState(today); const [demoBusy, setDemoBusy] = useState(false); const [demoMessage, setDemoMessage] = useState('');
  const [tl, setTl] = useState(null); const [catalog, setCatalog] = useState([]); const [docs, setDocs] = useState([]); const [error, setError] = useState(null);
  const load = () => Promise.all([api.labTimeline(), api.labDocuments()]).then(([x, d]) => { setTl(x); setDocs(d); }).catch((e) => { setError(e.message); setTl({ series: {}, alerts: [] }); });
  useEffect(() => { api.labCatalog().then((c) => setCatalog(c.tests)).catch(() => {}); load(); }, []);
  const series = useMemo(() => enrich(tl?.series, docs), [tl, docs]);
  const has = (c) => series[c]?.some((p) => p.value != null);
  const activeCodes = catalog.filter((c) => categoryFor(c.code, catalog) === category && has(c.code)).map((c) => c.code);
  const categoryAlerts = (tl?.alerts || []).filter((a) => categoryFor(a.test, catalog) === category);
  const demoAction = async (remove = false) => {
    setDemoBusy(true); setError(null); setDemoMessage('');
    try { const result = remove ? await api.removeLabDemoHistory() : await api.labDemoHistory(demoDate); await load(); setDemoMessage(t(remove ? 'trend.demoRemoved' : 'trend.demoSaved', { n: remove ? result.deleted : result.created })); }
    catch (e) { setError(e.message); } finally { setDemoBusy(false); }
  };
  if (!tl) return <div className="muted text-sm">{t('loading')}</div>;
  const empty = Object.keys(series).length === 0;
  const removeManual = async (id) => { await api.deleteObservation(id); load(); };
  const card = (codes, title) => <ChartCard key={codes.join()} codes={codes} series={series} catalog={catalog} title={title} docs={docs} onRemove={removeManual} />;
  const grid = (cards) => cards.length > 0 && <div className="grid gap-4 2xl:grid-cols-2">{cards}</div>;
  const enough = (c) => category !== 'ultrasound' || groupOf(c, catalog) !== 'pelvis' || series[c].filter((p) => p.value != null).length > 1;
  const combined = (COMBINED[category] || []).map((codes) => codes.filter((c) => activeCodes.includes(c) && enough(c))).filter((codes) => codes.length);
  const inCombined = new Set((COMBINED[category] || []).flat());
  const count = (key) => Object.keys(series).filter((c) => categoryFor(c, catalog) === key && has(c)).length;
  const comboTitle = (codes) => (codes.length < 2 ? null : codes[0] === 'bp_sys' ? t('trend.bpTitle') : codes[0] === 'follicles_r' ? t('pel.trendFollicles') : t('pel.trendOvary'));

  let body = null;
  if (category === 'cardio') body = <CardioConclusion />;
  else if (category === 'blood') body = BLOOD_SECTIONS.map((sec) => { const codes = activeCodes.filter((c) => subFor(c, catalog) === sec); const plain = codes.filter((c) => !c.startsWith('ogtt_')); return codes.length > 0 && <section key={sec} className="grid gap-3">
    <h3 className="text-sm font-semibold muted">{t(`trend.category.${sec}`)}</h3>{sec === 'glucose' && <OgttCurve series={series} />}{grid(plain.map((c) => card([c])))}</section>; });
  else body = <>
    {category === 'ultrasound' && <PelvisStudy series={series} docs={docs} catalog={catalog} />}
    {grid([...combined.map((codes) => card(codes, comboTitle(codes))), ...activeCodes.filter((c) => !inCombined.has(c) && groupOf(c, catalog) !== 'pelvis').map((c) => card([c]))])}
    {category === 'exam' && <Hypertension key={tl.last_verified_at || 'current'} />}
    {category === 'ultrasound' && <HeadCircumference onSaved={load} />}
  </>;

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
      <div className="grid gap-4 min-w-0 self-start">
        {error && <div className="text-sm" style={{ color: '#C62828' }}>{error}</div>}
        {empty && <Card><div className="text-sm">{t('trend.empty')} <button type="button" className="btn btn-primary ml-2" onClick={onGoLabs}>{t('trend.goLabs')}</button></div></Card>}
        <div className="flex flex-wrap gap-2" role="tablist" aria-label={t('trend.categories')}>
          {CATEGORIES.map((key) => { const n = count(key); return <button key={key} type="button" role="tab" aria-selected={category === key} onClick={() => setCategory(key)} className={`btn ${category === key ? 'btn-primary' : ''}`} style={{ minHeight: 44 }}>{t(`trend.cat.${key}`)}{key !== 'cardio' && n > 0 && <span className="mono text-xs opacity-80">{n}</span>}</button>; })}
        </div>
        {(category === 'blood' || category === 'urine' || category === 'exam') && activeCodes.length === 0 && <Card><p className="muted text-sm">{t('trend.categoryEmpty')}</p><button type="button" className="btn mt-3" onClick={onGoLabs}>{t('trend.goLabs')}</button></Card>}
        {body}
      </div>
      <div className="grid gap-4 self-start">
        {category !== 'cardio' && <Card title={t('trend.alerts')} sub={t('trend.alertsSub')}><Alerts alerts={categoryAlerts} catalog={catalog} /></Card>}
        <Card title={t('trend.homeTitle')} sub={t('trend.homeSub')}><HomeReading onSaved={load} /></Card>
        {(series.bp_sys?.some((p) => p.manual) || series.weight?.some((p) => p.manual)) && (
          <Card title={t('trend.myReadings')}>
            <div className="grid gap-1.5 text-sm">{[...(series.bp_sys || []).filter((p) => p.manual).map((p) => ({ ...p, dia: (series.bp_dia || []).find((q) => q.manual && q.date === p.date) })), ...(series.weight || []).filter((p) => p.manual)]
              .sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8).map((p) => (
                <div key={p.observation_id} className="flex items-center gap-2"><span className="muted text-xs w-20">{fmtDate(p.date, lang)}</span>
                  <span className="mono flex-1">{p.dia ? `${p.value}/${p.dia.value} ${unitLabel('mmHg', tx)}` : `${p.value} ${unitLabel(p.unit, tx)}`}</span>
                  <button type="button" className="btn px-2 py-1" aria-label={t('lab.delete')} onClick={async () => { await api.deleteObservation(p.observation_id); if (p.dia) await api.deleteObservation(p.dia.observation_id); load(); }}><Trash2 size={13} /></button></div>))}</div>
          </Card>)}
        <details className="card p-4">
          <summary className="cursor-pointer text-sm font-semibold">{t('trend.demoTitle')}</summary>
          <p className="muted text-xs mt-2">{t('trend.demoSub')}</p>
          <div className="flex flex-wrap items-end gap-2 mt-3">
            <input type="date" className="input py-1.5" aria-label={t('trend.demoDate')} min="2000-04-01" max={today} value={demoDate} onChange={(e) => setDemoDate(e.target.value)} />
            <button type="button" className="btn btn-primary" disabled={demoBusy || !demoDate || demoDate > today || demoDate < '2000-04-01'} onClick={() => demoAction()}>{demoBusy ? t('loading') : t('trend.demoAdd')}</button>
            {docs.some((d) => d.demo) && <button type="button" className="btn" disabled={demoBusy} onClick={() => demoAction(true)}>{t('trend.demoDelete')}</button>}
          </div>
          {demoMessage && <p className="text-sm mt-2" role="status">{demoMessage}</p>}
        </details>
      </div>
    </div>
  );
}
