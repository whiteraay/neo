import { useEffect, useMemo, useState } from 'react';
import { Map as MapIcon, ShieldCheck, Calculator, Database, Flag, Globe, Cpu, MapPinned, Layers } from 'lucide-react';
import RegionalDashboard from '../regional/RegionalDashboard.jsx';
import DatasetsCatalogue from '../DatasetsCatalogue.jsx';
import ModelOpsDashboard from '../ModelOpsDashboard.jsx';
import { OriginPill, DataFlow, useProvenance } from '../DataOrigin.jsx';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell, CartesianGrid, AreaChart, Area, Line, ReferenceLine, Legend } from 'recharts';
import Shell from './Shell.jsx';
import { Card, Badge, Stat, Gauge } from '../../lib/ui.jsx';
import { useT } from '../../lib/i18n.jsx';
import { api } from '../../services/api.js';
import DatasetIntegrationTab from '../DatasetIntegrationTab.jsx';
import PilotChecklistTab from '../PilotChecklistTab.jsx';

const LEVEL_COLOR = { 3: '#0E9F9B', 2: '#16A34A', 1: '#8AA0B2' };
const fmtKzt = (n) => `${Math.round(n).toLocaleString('ru-RU')} ₸`;
const LOCALE = { kz: 'kk-KZ', ru: 'ru-RU', en: 'en-GB' };

/* ---------- Regional map (SVG, equirectangular projection of the national outline) ---------- */
function RegionalMap() {
  const { t, tx, lang } = useT();
  const [data, setData] = useState(null); const [sel, setSel] = useState('turkestan'); const [metric, setMetric] = useState('nmr');
  useEffect(() => { api.regions().then(setData); }, []);
  const proj = useMemo(() => { if (!data) return null; const lons = data.outline.map((p) => p[0]), lats = data.outline.map((p) => p[1]); const [x0, x1, y0, y1] = [Math.min(...lons) - 1, Math.max(...lons) + 1, Math.min(...lats) - 1, Math.max(...lats) + 1]; const W = 900, H = 420; return (lon, lat) => [((lon - x0) / (x1 - x0)) * W, H - ((lat - y0) / (y1 - y0)) * H * 1.0]; }, [data]);
  if (!data || !proj) return <div className="muted text-sm">{t('loading')}</div>;
  const R = data.regions; const byId = Object.fromEntries(R.map((r) => [r.id, r])); const r = byId[sel];
  const path = data.outline.map((p, i) => `${i ? 'L' : 'M'}${proj(p[0], p[1]).map((v) => v.toFixed(1)).join(',')}`).join(' ') + ' Z';
  const scale = { nmr: (v) => v / 8, utilisation: (v) => (v - 70) / 30 }[metric];
  const hot = (v) => { if (v == null) return '#B8D0D8'; const k = Math.max(0, Math.min(1, scale(v))); return k > 0.66 ? '#E5484D' : k > 0.33 ? '#F59E0B' : '#16A34A'; };
  const name = (x) => x[lang] || x.en;
  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
      <Card title={t('an.map')} sub={t('an.map.sub')} right={<div className="flex flex-wrap items-center gap-2"><OriginPill kind={metric === 'nmr' ? 'official' : 'estimate'}>{metric === 'nmr' ? t('an.map.official') : t('an.programmeEstimate')}</OriginPill><div className="flex border border-line-strong rounded-md overflow-hidden">{[['nmr', t('an.nmr')], ['utilisation', t('an.beds') + ' %']].map(([k, l]) => <button key={k} type="button" className={`btn border-0 rounded-none ${metric === k ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setMetric(k)}>{l}</button>)}</div></div>}>
        <div className="overflow-x-auto"><svg viewBox="0 0 900 430" className="w-full min-w-[640px]" role="img" aria-label={t('an.map.aria')}>
          <path d={path} fill="#F7FBFC" stroke="#B8D0D8" strokeWidth="1.5" />
          {data.transfer_routes.map(([a, b]) => { const A = proj(byId[a].lon, byId[a].lat), B = proj(byId[b].lon, byId[b].lat); return <line key={a + b} x1={A[0]} y1={A[1]} x2={B[0]} y2={B[1]} stroke="#0E9F9B" strokeWidth="1" strokeDasharray="4 3" opacity=".5" />; })}
          {R.map((x) => { const [cx, cy] = proj(x.lon, x.lat); const rad = 6 + Math.sqrt(x.live_births) / 18; const active = x.id === sel; return (
            <g key={x.id} onClick={() => setSel(x.id)} style={{ cursor: 'pointer' }}>
              {x.growth && <circle cx={cx} cy={cy} r={rad + 6} fill="none" stroke="#F59E0B" strokeWidth="1.5" strokeDasharray="3 2" />}
              <circle cx={cx} cy={cy} r={rad} fill={hot(x[metric])} fillOpacity={x[metric] == null ? 0.35 : 0.85} stroke={active ? '#0B2239' : '#fff'} strokeWidth={active ? 2.5 : 1.5} strokeDasharray={x[metric] == null ? '3 2' : undefined} />
              <circle cx={cx} cy={cy} r={3} fill={LEVEL_COLOR[x.level]} stroke="#fff" strokeWidth="1" />
              <text x={cx} y={cy - rad - 5} textAnchor="middle" fontSize="10" fontFamily="JetBrains Mono" fill="#0B2239">{tx(x.centre)}</text>
            </g>); })}
        </svg></div>
        <div className="flex flex-wrap gap-4 mt-2 text-xs muted"><span className="flex items-center gap-1"><span className="dot" style={{ background: '#0E9F9B' }} />{t('an.level')} III</span><span className="flex items-center gap-1"><span className="dot" style={{ background: '#16A34A' }} />{t('an.level')} II</span><span className="flex items-center gap-1"><span className="dot" style={{ background: '#8AA0B2' }} />{t('an.level')} I</span><span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-full border border-dashed" style={{ borderColor: '#F59E0B' }} />{t('an.growth')}</span><span>{t('an.map.route')}</span><span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-full border border-dashed border-line-strong bg-line" />{t('an.map.suppressed')}</span><span className="ml-auto">{t('source')}: {data.sources[0].name} · {t('an.map.levelsSrc')}</span></div>
      </Card>
      <div className="grid gap-3 self-start">
        <Card title={name(r)} sub={`${tx(r.centre)} · ${t('an.level')} ${['', 'I', 'II', 'III'][r.level]}`} right={r.growth && <Badge tone="moderate">{t('an.growth')}</Badge>}>
          <div className="grid grid-cols-2 gap-3"><div><div className="eyebrow">{t('an.nmr')}</div><div className="big-num text-3xl mt-1" style={{ color: hot(r.nmr) }}>{r.nmr ?? '—'}</div><div className="muted text-xs">{r.nmr == null ? t('an.suppressedShort') : '/1000 · MICS 2024'}</div></div><div><div className="eyebrow">{t('an.beds')}</div><div className="big-num text-3xl mt-1">{r.nicu_beds}</div><div className="muted text-xs">{r.utilisation}% · <span className="origin origin-estimate" style={{ padding: '0 6px' }}>{t('an.estimate')}</span></div></div><div><div className="eyebrow">{t('an.births')}</div><div className="mono text-xl font-semibold mt-1">{r.live_births.toLocaleString(LOCALE[lang])}</div></div><div><div className="eyebrow">{t('an.specialists')}</div><div className="mono text-xl font-semibold mt-1">{r.specialists_per_10k}</div></div></div>
          <div className="muted text-xs mt-3">{t('an.transfersTo')}: <span className="font-semibold text-fg">{data.transfer_routes.filter(([a]) => a === r.id).map(([, b]) => tx(byId[b].centre)).join(', ') || t('an.hubL3')}</span></div>
        </Card>
        <Card title={t('an.nmr')} sub={t('an.nmr.chartSub')} right={<OriginPill kind="official">{t('an.official')}</OriginPill>}><div className="h-56"><ResponsiveContainer width="100%" height="100%"><BarChart data={R.filter((x) => x.nmr != null).sort((a, b) => b.nmr - a.nmr)} layout="vertical" margin={{ left: 0, right: 16, top: 0, bottom: 0 }}><XAxis type="number" domain={[0, 8]} hide /><YAxis type="category" dataKey="centre" width={78} tickFormatter={(c) => tx(c)} /><Tooltip labelFormatter={(c) => tx(c)} formatter={(v) => [v, t('an.nmr')]} /><ReferenceLine x={data.national?.mics_2024 ?? data.national_nmr} stroke="#F59E0B" strokeDasharray="4 4" label={{ value: t('an.nationalLine', { n: data.national?.mics_2024 ?? data.national_nmr }), fill: '#B45309', fontSize: 10, position: 'insideTopRight' }} /><Bar dataKey="nmr" onClick={(d) => d && setSel(d.id)}>{R.filter((x) => x.nmr != null).sort((a, b) => b.nmr - a.nmr).map((x) => <Cell key={x.id} fill={x.id === sel ? '#0E9F9B' : hot(x.nmr)} cursor="pointer" />)}</Bar></BarChart></ResponsiveContainer></div><div className="eyebrow mt-2">{t('source')}: {data.sources[0].name}</div></Card>
      </div>
      <Card title={t('an.trend')} sub={t('an.trend.sub', { y: data.national?.year ?? 2024, v: data.national?.value, y2: data.national?.year })} right={<OriginPill kind="official">UN IGME</OriginPill>} className="xl:col-span-2"><div className="h-52"><ResponsiveContainer width="100%" height="100%"><AreaChart data={data.national_trend} margin={{ left: -14, right: 8, top: 8, bottom: 0 }}><defs><linearGradient id="g2" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#0E9F9B" stopOpacity={.3} /><stop offset="100%" stopColor="#0E9F9B" stopOpacity={.02} /></linearGradient></defs><CartesianGrid vertical={false} /><XAxis dataKey="year" /><YAxis domain={[0, 6]} /><Tooltip /><Legend /><Area dataKey="nmr" name={t('an.trend.series')} stroke="#0E9F9B" fill="url(#g2)" strokeWidth={2} isAnimationActive={false} /><Line dataKey="target" name={t('an.trend.target')} stroke="#16A34A" strokeDasharray="5 5" dot={false} isAnimationActive={false} /></AreaChart></ResponsiveContainer></div><div className="flex flex-wrap gap-3 mt-2 text-xs">{data.sources.map((s) => <a key={s.id} href={s.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-primary"><Globe size={12} />{s.name}{s.official === false && <span className="origin origin-estimate" style={{ padding: '0 6px' }}>{t('an.pending')}</span>}</a>)}<span className="muted ml-auto">{tx(data.note)}</span></div></Card>
    </div>
  );
}

/* ---------- Audit & model quality ---------- */
function AuditView() {
  const { t, lang } = useT();
  const [audit, setAudit] = useState(null); const [q, setQ] = useState(null); const [filter, setFilter] = useState('');
  useEffect(() => { api.audit('?limit=200').then(setAudit); api.modelQuality().then(setQ); }, []);
  if (!audit || !q) return <div className="muted text-sm">{t('loading')}</div>;
  const entries = audit.entries.filter((e) => !filter || e.action.startsWith(filter));
  const m = q.training_metrics || {};
  return (
    <div className="grid gap-4">
      <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3"><Stat label={t('an.q.model')} value={q.model_version} unit={q.calibrated ? t('an.q.calibrated') : t('an.q.uncalibrated')} /><Stat label="AUROC (CV)" value={m.auroc?.toFixed(3) ?? '—'} tone="#0E9F9B" unit={t('an.q.cvUnit')} /><Stat label="ECE" value={(m.ece_calibrated ?? m.ece_raw)?.toFixed(3) ?? '—'} /><Stat label={t('an.q.agreement')} value={q.reviewed ? `${Math.round(q.agreement * 100)}%` : '—'} unit={t('an.q.reviewed', { n: q.reviewed })} tone={!q.reviewed ? undefined : q.agreement >= 0.85 ? '#16A34A' : '#F59E0B'} /><Stat label={t('an.q.pred7')} value={q.predictions_7d} unit={t('an.q.total', { n: q.predictions_total })} /></div>
      <div className="grid lg:grid-cols-2 gap-4">
        <Card title={t('an.quality')} sub={t('an.q.binSub')}><div className="h-52"><ResponsiveContainer width="100%" height="100%"><BarChart data={q.agreement_by_bin} margin={{ left: -14, right: 8, top: 8, bottom: 0 }}><CartesianGrid vertical={false} /><XAxis dataKey="bin" /><YAxis domain={[0, 1]} tickFormatter={(v) => `${v * 100}%`} /><Tooltip formatter={(v) => [`${Math.round(v * 100)}%`, t('an.q.agreementWord')]} /><ReferenceLine y={0.85} stroke="#F59E0B" strokeDasharray="4 4" /><Bar dataKey="agreement" name={t('an.q.agreementWord')}>{q.agreement_by_bin.map((b, i) => <Cell key={i} fill={(b.agreement ?? 0) >= 0.85 ? '#16A34A' : '#F59E0B'} />)}</Bar></BarChart></ResponsiveContainer></div></Card>
        <Card title={t('an.q.tierDist')} sub={t('an.q.allPred')}><div className="h-52"><ResponsiveContainer width="100%" height="100%"><BarChart data={Object.entries(q.tier_distribution).map(([k, v]) => ({ tier: k, n: v }))} margin={{ left: -14, right: 8, top: 8, bottom: 0 }}><CartesianGrid vertical={false} /><XAxis dataKey="tier" tickFormatter={(k) => t(`tier.${k}`)} /><YAxis allowDecimals={false} /><Tooltip labelFormatter={(k) => t(`tier.${k}`)} /><Bar dataKey="n" name={t('an.q.nPred')}>{['#16A34A', '#F59E0B', '#F97316', '#E5484D'].map((c, i) => <Cell key={i} fill={c} />)}</Bar></BarChart></ResponsiveContainer></div></Card>
      </div>
      <Card title={<span className="flex items-center gap-2"><ShieldCheck size={16} />{t('an.audit')}</span>} sub={t('an.audit.sub')} right={<select className="w-auto" value={filter} onChange={(e) => setFilter(e.target.value)}><option value="">{t('an.audit.all')}</option>{Object.keys(audit.by_action).sort().map((a) => <option key={a} value={a}>{a} ({audit.by_action[a]})</option>)}</select>}>
        <div className="overflow-x-auto"><table className="table"><thead><tr><th>{t('an.audit.time')}</th><th>{t('an.audit.actor')}</th><th>{t('an.audit.role')}</th><th>{t('an.audit.hospital')}</th><th>{t('an.audit.action')}</th><th>{t('an.audit.resource')}</th><th>{t('an.audit.detail')}</th><th>IP</th></tr></thead><tbody>{entries.map((e) => <tr key={e.id}><td className="mono text-xs whitespace-nowrap">{new Date(e.at).toLocaleString(LOCALE[lang])}</td><td>{e.actor}</td><td><Badge tone={{ neonatologist: 'low', analyst: 'primary', mother: 'violet', admin: 'moderate' }[e.role] || 'muted'}>{e.role ? t(`an.role.${e.role}`, e.role) : '—'}</Badge></td><td className="muted text-xs max-w-[200px] truncate">{e.hospital}</td><td className="mono text-xs">{e.action}</td><td className="mono muted text-xs">{e.resource}</td><td className="mono muted text-xs">{Object.keys(e.detail || {}).length ? JSON.stringify(e.detail) : ''}</td><td className="mono muted text-xs">{e.ip || ''}</td></tr>)}</tbody></table></div>
      </Card>
    </div>
  );
}

/* ---------- Economic & outcome impact ---------- */
/* [field, step]; the label is t('an.econ.<field>') */
const ECON_FIELDS = [['nicu_admissions_per_year', 1], ['escalation_rate', 0.01], ['early_alert_coverage', 0.05], ['los_reduction_days_per_alert', 0.1], ['bed_day_tariff_kzt', 1000], ['transfers_avoided_share', 0.01], ['transfer_cost_kzt', 10000], ['pilot_cost_kzt', 1000000]];
function Economics() {
  const { t, lang } = useT();
  const [inp, setInp] = useState({ nicu_admissions_per_year: 1200, escalation_rate: 0.22, early_alert_coverage: 0.6, los_reduction_days_per_alert: 2.2, bed_day_tariff_kzt: 85000, transfers_avoided_share: 0.15, transfer_cost_kzt: 350000, pilot_cost_kzt: 24000000 });
  const [out, setOut] = useState(null);
  useEffect(() => { const id = setTimeout(() => api.economics(inp).then(setOut), 250); return () => clearTimeout(id); }, [inp]);
  return (
    <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
      <Card title={<span className="flex items-center gap-2"><Calculator size={16} />{t('an.economics')}</span>} sub={t('an.economics.sub')} className="self-start">
        <div className="grid gap-2">{ECON_FIELDS.map(([k, step]) => <label key={k} className="text-xs"><span className="muted">{t(`an.econ.${k}`)}</span><input type="number" className="input mono py-1.5" step={step} value={inp[k]} onChange={(e) => setInp((x) => ({ ...x, [k]: parseFloat(e.target.value) || 0 }))} /></label>)}</div>
        <p className="muted text-xs mt-3">{t('an.econ.note')}</p>
      </Card>
      {out && <div className="grid gap-4 self-start">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3"><Stat label={t('an.econ.net')} value={fmtKzt(out.net_savings_kzt)} tone={out.net_savings_kzt >= 0 ? '#16A34A' : '#E5484D'} unit={`ROI ${out.roi != null ? `${Math.round(out.roi * 100)}%` : '—'}`} /><Stat label={t('an.econ.bedDays')} value={out.bed_days_saved.toLocaleString(LOCALE[lang])} unit={t('an.econ.bedsFreed', { n: out.beds_freed_equivalent })} /><Stat label={t('an.econ.alerts')} value={out.early_alerts} unit={t('an.econ.ofDet', { n: out.deteriorations_per_year })} /></div>
        <Card title={t('an.breakdown')}><div className="h-56"><ResponsiveContainer width="100%" height="100%"><BarChart data={[{ k: t('an.econ.bedSave'), v: out.bed_day_savings_kzt }, { k: t('an.econ.transferSave'), v: out.transfer_savings_kzt }, { k: t('an.econ.platform'), v: -inp.pilot_cost_kzt }, { k: t('an.econ.netShort'), v: out.net_savings_kzt }]} margin={{ left: 10, right: 8, top: 8, bottom: 0 }}><CartesianGrid vertical={false} /><XAxis dataKey="k" /><YAxis tickFormatter={(v) => `${Math.round(v / 1e6)}${t('an.econ.mln')}`} /><Tooltip formatter={(v) => [fmtKzt(v), '']} /><ReferenceLine y={0} stroke="#0B2239" /><Bar dataKey="v">{['#16A34A', '#16A34A', '#E5484D', '#0E9F9B'].map((c, i) => <Cell key={i} fill={c} />)}</Bar></BarChart></ResponsiveContainer></div><div className="eyebrow mt-2">{t('an.econ.src')}</div></Card>
      </div>}
    </div>
  );
}

export default function AnalystPortal({ user, onLogout }) {
  const { t } = useT();
  const [view, setView] = useState('regions'); const prov = useProvenance();
  const NAV = [['regions', t('an.regions'), MapPinned], ['map', t('an.map'), MapIcon], ['datasets', t('an.datasets'), Layers], ['audit', t('an.audit'), ShieldCheck], ['economics', t('an.economics'), Calculator], ['mlops', t('an.mlops'), Cpu], ['hub', t('an.hub'), Database], ['readiness', t('an.readiness'), Flag]];
  const TITLES = { regions: [t('an.regions'), t('an.regions.sub')], datasets: [t('an.datasets'), t('an.datasets.sub')], map: [t('an.map'), t('an.map.sub')], audit: [t('an.audit'), t('an.audit.sub')], economics: [t('an.economics'), t('an.economics.sub')], mlops: [t('an.mlops'), t('an.mlops.sub')], hub: [t('an.hub'), t('an.hub.sub')], readiness: [t('an.readiness'), t('an.readiness.sub')] };
  return (
    <Shell user={user} portalLabel={t('nav.analyst')} nav={NAV} view={view} setView={setView} title={TITLES[view][0]} sub={TITLES[view][1]} onLogout={onLogout} accent="#16A34A">
      {view === 'regions' && <RegionalDashboard />}
      {view === 'datasets' && <DatasetsCatalogue />}
      {view === 'map' && <RegionalMap />}
      {view === 'audit' && <AuditView />}
      {view === 'economics' && <Economics />}
      {view === 'mlops' && <ModelOpsDashboard />}
      {view === 'hub' && <div className="grid gap-4"><div className="card p-4"><div className="eyebrow mb-2">{t('hub.pipeline')}</div><DataFlow prov={prov} /></div><DatasetIntegrationTab user={user} predictions={[]} /></div>}
      {view === 'readiness' && <PilotChecklistTab />}
    </Shell>
  );
}
