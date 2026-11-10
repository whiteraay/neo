import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Globe } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, ComposedChart, Area, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend, ReferenceLine, Cell } from 'recharts';
import { Card, Badge } from '../../lib/ui.jsx';
import { useT } from '../../lib/i18n.jsx';
import { api } from '../../services/api.js';
import { OriginPill } from '../DataOrigin.jsx';
import { dateLocale } from '../../lib/official.js';

// stat.gov.kz infant mortality 2008– per region + next-year forecast, built offline by data/scripts/pipeline.py.
const fmt = (v, d = 2) => (v == null ? '—' : Number(v).toFixed(d));
const STATUS = { 'above expected': ['#C62828', 'high', 'reg.fc.above'], 'below expected': ['#15803D', 'low', 'reg.fc.below'], 'as expected': ['#CBD5E1', 'muted', 'reg.fc.asExpected'] };

export default function RegionalForecast({ selected, onSelect, visibleIds }) {
  const { t, tx, lang } = useT();
  const [data, setData] = useState(null); const [err, setErr] = useState(null);
  useEffect(() => { api.regionForecast().then(setData).catch((e) => setErr(e.message || t('reg.fc.failed'))); }, []);
  const name = (r) => (r ? r[lang] || r.ru || r.en : '');

  const byExcess = useMemo(() => {
    if (!data) return [];
    const rs = visibleIds?.length ? data.regions.filter((r) => visibleIds.includes(r.id)) : data.regions;
    return rs.map((r) => ({ id: r.id, label: name(r), ...r.expected, excess: r.expected.observed - r.expected.expected })).sort((a, b) => b.excess - a.excess);
  }, [data, visibleIds, lang]); // eslint-disable-line react-hooks/exhaustive-deps

  if (err) return <Card title={t('reg.fc.title')} sub={err}><p className="muted text-sm">{t('reg.fc.unavailable')}</p></Card>;
  if (!data) return <div className="muted text-sm">{t('loading')}</div>;

  const nat = data.national; const M = data.model; const Y = data.data_year;
  const r = data.regions.find((x) => x.id === selected) || data.regions[0]; const fc = r.forecast; const ex = r.expected;
  const natByYear = Object.fromEntries(nat.trend.map((p) => [p.year, p.imr]));
  const last = r.trend[r.trend.length - 1];
  const series = [
    ...r.trend.map((p) => ({ year: p.year, imr: p.imr, national: natByYear[p.year] ?? null, ...(p.year === last.year ? { forecast: p.imr, band: [p.imr, p.imr] } : {}) })),
    { year: fc.year, national: nat.forecast.imr, forecast: fc.imr, band: [fc.lo80, fc.hi80] },
  ];

  return (
    <div className="grid gap-4">
      <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
        <Card title={`${t('reg.fc.title')} — ${name(r)}`} sub={t('reg.fc.sub')} right={<div className="flex flex-wrap gap-1.5"><OriginPill kind="official">stat.gov.kz · 2008–{Y}</OriginPill><Badge tone={STATUS[ex.status][1]}>{ex.year}: {t(STATUS[ex.status][2])}</Badge></div>}>
          <div className="grid grid-cols-3 gap-3 mb-3">
            <div><div className="eyebrow">{t('reg.fc.imr')} {Y}</div><div className="big-num text-3xl mt-1" style={{ color: r.latest.imr > nat.latest.imr ? '#C62828' : '#15803D' }}>{fmt(r.latest.imr)} ‰</div><div className="muted text-xs">{t('reg.national')} {fmt(nat.latest.imr)} ‰</div></div>
            <div><div className="eyebrow">{t('reg.fc.forecast')} {fc.year}</div><div className="big-num text-3xl mt-1" style={{ color: '#0E9F9B' }}>{fmt(fc.imr)} ‰</div><div className="muted text-xs">80%: {fmt(fc.lo80)} – {fmt(fc.hi80)}</div></div>
            <div><div className="eyebrow">{t('reg.fc.births')} {Y}</div><div className="mono text-xl font-semibold mt-2">{r.latest.births?.toLocaleString(dateLocale(lang)) ?? '—'}</div><div className="muted text-xs">{r.latest.infant_deaths ?? '—'} {t('reg.fc.infantDeaths')}</div></div>
          </div>
          <div className="h-64"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={series} margin={{ left: -10, right: 12, top: 8, bottom: 0 }}><CartesianGrid vertical={false} /><XAxis dataKey="year" /><YAxis domain={[0, 'auto']} /><Tooltip formatter={(v, n) => [Array.isArray(v) ? `${fmt(v[0])} – ${fmt(v[1])} ‰` : `${fmt(v)} ‰`, n]} /><Legend />
            <Area dataKey="band" name={t('reg.fc.range')} stroke="none" fill="#0E9F9B" fillOpacity={0.15} isAnimationActive={false} />
            <Line dataKey="national" name={t('reg.kzShort')} stroke="#52708A" strokeDasharray="5 5" dot={false} isAnimationActive={false} />
            <Line dataKey="imr" name={name(r)} stroke="#0E9F9B" strokeWidth={2.5} dot={{ r: 2 }} isAnimationActive={false} />
            <Line dataKey="forecast" name={t('reg.fc.forecast')} stroke="#0E9F9B" strokeDasharray="5 5" isAnimationActive={false} />
          </ComposedChart></ResponsiveContainer></div>
        </Card>

        <Card title={`${t('reg.fc.expTitle')}, ${ex.year}`} sub={t('reg.fc.expSub')}>
          <div style={{ height: Math.max(260, byExcess.length * 20) }}><ResponsiveContainer width="100%" height="100%"><BarChart data={byExcess} layout="vertical" margin={{ top: 0, right: 16, left: 4, bottom: 0 }}><CartesianGrid horizontal={false} /><XAxis type="number" /><YAxis type="category" dataKey="label" width={112} interval={0} tick={{ fontSize: 11 }} />
            <Tooltip content={({ active, payload }) => (active && payload?.length ? <div className="card p-2 text-xs"><div className="font-semibold">{payload[0].payload.label}</div><div>{t('reg.fc.observed')} {fmt(payload[0].payload.observed)} · {t('reg.fc.expected')} {fmt(payload[0].payload.expected)}</div><div className="muted">80%: {fmt(payload[0].payload.lo80)} – {fmt(payload[0].payload.hi80)}</div></div> : null)} />
            <ReferenceLine x={0} stroke="#52708A" />
            <Bar dataKey="excess" onClick={(d) => d && onSelect(d.id)}>{byExcess.map((x) => <Cell key={x.id} fill={x.id === r.id ? '#0E9F9B' : STATUS[x.status][0]} cursor="pointer" />)}</Bar>
          </BarChart></ResponsiveContainer></div>
        </Card>
      </div>

      <Card title={t('reg.fc.modelTitle')} sub={tx(M.task)} right={<Badge tone="violet">{M.selected}</Badge>}>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
          <div><div className="eyebrow">{t('reg.fc.mae')}</div><div className="big-num text-2xl mt-1">{fmt(M.mae)}</div><div className="muted text-xs">{t('reg.fc.maeSub')} {M.backtest_years}</div></div>
          <div><div className="eyebrow">{t('reg.fc.skill')}</div><div className="big-num text-2xl mt-1">{fmt(M.skill_vs_persistence * 100, 1)}%</div><div className="muted text-xs">{t('reg.fc.skillSub')}</div></div>
          <div><div className="eyebrow">{t('reg.fc.coverage')}</div><div className="big-num text-2xl mt-1">{fmt(M.interval_coverage * 100, 0)}%</div><div className="muted text-xs">{t('reg.fc.coverageSub')}</div></div>
          <div><div className="eyebrow">{t('reg.fc.training')}</div><div className="big-num text-2xl mt-1">{M.training_rows}</div><div className="muted text-xs">{t('reg.fc.trainingSub')} {M.trained_through}</div></div>
        </div>
        <details className="mt-3 text-sm"><summary className="cursor-pointer muted">{t('reg.fc.candidates')}</summary><table className="mt-2 text-xs"><tbody>{M.ranking.map((m) => <tr key={m.model}><td className="mono pr-6">{m.model}</td><td className="mono">{fmt(m.mae, 3)}</td></tr>)}</tbody></table></details>
        <ul className="mt-3 grid gap-1 text-xs muted">{[data.metric.note, ...data.caveats].map((c) => <li key={c} className="flex gap-2"><AlertTriangle size={14} className="shrink-0 mt-px" />{tx(c)}</li>)}</ul>
        <div className="flex flex-wrap gap-3 mt-3 text-xs">{data.sources.map((s) => <a key={s.name} href={s.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-primary"><Globe size={12} />{tx(s.name)}</a>)}</div>
      </Card>
    </div>
  );
}
