import { useEffect, useMemo, useState } from 'react';
import { Layers, Database, Plug, ClipboardCheck, BrainCircuit, Link2, X, Check, Flag } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, LineChart, Line, CartesianGrid, Legend } from 'recharts';
import { Card, Badge, Stat, Tabs } from '../lib/ui.jsx';
import { useT } from '../lib/i18n.jsx';
import { tier } from '../lib/risk.js';
import { api } from '../services/api.js';
import { subscribeHisLog } from '../services/websocket.js';
import { HIS_ENDPOINTS, REVIEW_SEED } from '../lib/mock.js';
import { DatasetUploader } from './ModelOpsDashboard.jsx';
import { OriginPill } from './DataOrigin.jsx';

const LOCALE = { kz: 'kk-KZ', ru: 'ru-RU', en: 'en-GB' };

/* Benchmark names and notes arrive as English text; some carry counts, so match those patterns before falling back to tx(). */
function useBenchText() {
  const { t, tx } = useT();
  const name = (s) => {
    if (!s) return s;
    const pic = /^PIC v([\d.]+) \((\d+) neonates, NICU\)$/.exec(s);
    if (pic) return `PIC v${pic[1]} (${t('hub.neonates', { n: pic[2] })})`;
    const syn = /^PICDB-shaped synthetic baseline \((\d+) admissions\)$/.exec(s);
    if (syn) return t('hub.synthBaseline', { n: syn[1] });
    return tx(s);
  };
  const note = (s) => {
    if (!s) return s;
    const adm = /^In-hospital death, trained on 2021–2023, tested on (\S+) admissions of 2024–2025\.(?: Sensitivity (\S+), predictions run high \(mean (\S+)\)\.)?$/.exec(s);
    if (adm) return `${t('hub.admNote', { n: adm[1] })}${adm[2] ? ` ${t('hub.admNoteSens', { s: adm[2], m: adm[3] })}` : ''}`;
    return tx(s);
  };
  const site = (s) => String(s ?? '').replace('held-out', t('hub.heldOut')).replace('Asfendiyarov', t('src.asf'));
  return { name, note, site };
}

/* ---------- Benchmarking ---------- */
function Benchmarking() {
  const { t, lang } = useT(); const B = useBenchText();
  const [data, setData] = useState(null); const [origin, setOrigin] = useState('tabular');
  useEffect(() => { api.benchmarks().then(setData); }, []);
  if (!data) return <div className="muted text-sm">{t('hub.loadingBench')}</div>;
  const b = data[origin];
  return (
    <div className="grid gap-4 fade-in">
      <Card title={t('hub.measured')} sub={t('hub.measuredSub')} right={<div className="flex border border-line-strong">{[['tabular', t('hub.m24')], ['admission', t('hub.mAdm')]].map(([k, l]) => <button key={k} type="button" className={`btn border-0 ${origin === k ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setOrigin(k)}>{l}</button>)}</div>}>
        <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3"><Stat label={t('hub.cohort')} value={b.n?.toLocaleString(LOCALE[lang]) ?? '—'} unit={b.unit ? t(`hub.unit.${b.unit}`, b.unit) : ''} /><Stat label="AUROC" value={b.auroc?.toFixed(3) ?? '—'} tone="#0E9F9B" /><Stat label="AUPRC" value={b.auprc?.toFixed(2) ?? '—'} /><Stat label="Brier" value={b.brier?.toFixed(3) ?? '—'} /><Stat label="ECE" value={b.ece?.toFixed(3) ?? '—'} /></div>
        <p className="muted text-xs mt-3">{B.name(b.name)} · {b.period} · {t('hub.eventRate')} {b.prevalence}%. {B.note(b.note)}</p>
        <div className="mt-4 pt-4 border-t border-line"><div className="eyebrow mb-2">{t('hub.addLocal')}</div><DatasetUploader compact /></div>
      </Card>
      <div className="grid lg:grid-cols-2 gap-4">
        <Card title={t('hub.discr')} sub={t('hub.discrSub')}><div className="h-60"><ResponsiveContainer width="100%" height="100%"><BarChart data={data.validation} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}><CartesianGrid vertical={false} /><XAxis dataKey="site" tickFormatter={B.site} /><YAxis domain={[0.5, 1]} /><Tooltip labelFormatter={B.site} /><Bar dataKey="auroc" name="AUROC" fill="#0E9F9B" /></BarChart></ResponsiveContainer></div></Card>
        <Card title={t('hub.calib')} sub={t('hub.calibSub')}><div className="h-60"><ResponsiveContainer width="100%" height="100%"><LineChart data={data.calibration} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}><CartesianGrid /><XAxis dataKey="bin" /><YAxis /><Tooltip /><Legend /><Line dataKey="predicted" name={t('hub.predicted')} stroke="#8AA0B2" strokeDasharray="5 5" isAnimationActive={false} /><Line dataKey="observed" name={t('hub.observed')} stroke="#0E9F9B" strokeWidth={2} isAnimationActive={false} /></LineChart></ResponsiveContainer></div></Card>
      </div>
    </div>
  );
}

/* ---------- Schema mapper ---------- */
function SchemaMapper() {
  const { t, lang } = useT();
  const [schema, setSchema] = useState(null); const [mapping, setMapping] = useState({}); const [drag, setDrag] = useState(null); const [validation, setValidation] = useState(null);
  useEffect(() => { api.schema().then((s) => { setSchema(s); setMapping(Object.fromEntries(s.core_features.slice(0, 11).map((f) => [f.key, s.suggested_mapping[f.key]]))); }); }, []);
  const used = useMemo(() => new Set(Object.values(mapping)), [mapping]);
  if (!schema) return <div className="muted text-sm">{t('hub.loadingSchema')}</div>;
  const mapped = Object.values(mapping).filter(Boolean).length; const total = schema.core_features.length;
  const validate = async () => setValidation(await api.validateMapping(mapping));
  const fname = (f) => f[lang] || f.en;
  const others = (f) => ['kz', 'ru', 'en'].filter((l) => l !== lang).map((l) => f[l]).filter(Boolean).join(' · ');
  return (
    <div className="grid lg:grid-cols-[240px_1fr] gap-4 fade-in">
      <Card title={t('hub.cols')} sub={t('hub.colsSub')} className="lg:sticky lg:top-20 self-start">
        <div className="flex flex-wrap gap-1.5">{schema.export_columns.map((c) => <span key={c} draggable onDragStart={() => setDrag(c)} onDragEnd={() => setDrag(null)} className={`mono text-xs px-2 py-1 border bg-surface cursor-grab ${used.has(c) ? 'opacity-40' : ''}`} style={{ borderColor: drag === c ? '#0E9F9B' : '#B8D0D8' }}>{c}</span>)}</div>
      </Card>
      <Card title={t('hub.mapperTitle', { n: total })} right={<div className="flex gap-2"><button type="button" className="btn" onClick={() => setMapping({ ...schema.suggested_mapping })}><BrainCircuit size={16} />{t('hub.auto')}</button><button type="button" className="btn btn-ghost" onClick={() => { setMapping({}); setValidation(null); }}>{t('hub.clear')}</button><button type="button" className="btn btn-dark" onClick={validate}>{t('hub.validate')}</button></div>}>
        <div className="flex items-center gap-3 mb-3"><div className="meter flex-1"><span style={{ width: `${(mapped / total) * 100}%` }} /></div><span className="mono text-sm font-semibold">{mapped}/{total}</span><Badge tone={mapped === total ? 'low' : mapped >= 25 ? 'moderate' : 'high'}>{mapped === total ? t('hub.complete') : t('hub.unmapped', { n: total - mapped })}</Badge></div>
        {validation && <div className={`text-xs mb-3 p-2 border ${validation.valid ? 'border-teal' : 'border-coral'}`}>{t('hub.coverage', { p: Math.round(validation.coverage * 100) })} · {validation.valid ? t('hub.valid') : `${t('hub.issues')}: ${[...validation.duplicate_columns.map((d) => `${t('hub.dup')} ${d}`), ...validation.unknown_columns.map((u) => `${t('hub.unknown')} ${u}`)].join(', ')}`}{validation.missing.length > 0 && ` · ${t('hub.missingList')}: ${validation.missing.slice(0, 6).join(', ')}${validation.missing.length > 6 ? '…' : ''}`}</div>}
        <div className="overflow-x-auto"><table className="table"><thead><tr><th>{t('hub.col.feature')}</th><th>{t('hub.col.names')}</th><th>LOINC</th><th>{t('hub.col.local')}</th><th>{t('mlops.col.status')}</th></tr></thead><tbody>{schema.core_features.map((f) => { const v = mapping[f.key] || ''; return (
          <tr key={f.key} onDragOver={(e) => e.preventDefault()} onDrop={() => { if (drag) setMapping((m) => ({ ...m, [f.key]: drag })); }} style={drag ? { background: 'rgba(15,76,129,.06)' } : undefined}><td><div className="font-medium">{fname(f)}</div><div className="mono muted text-xs">{f.key}</div></td><td className="muted text-xs">{others(f)}</td><td className="mono muted text-xs">{f.loinc || '—'}</td><td><select aria-label={t('hub.mapAria', { f: fname(f) })} value={v} onChange={(e) => setMapping((m) => ({ ...m, [f.key]: e.target.value }))}><option value="">{t('hub.notMapped')}</option>{schema.export_columns.map((c) => <option key={c} value={c}>{c}</option>)}</select></td><td>{v ? <Badge tone={v === schema.suggested_mapping[f.key] ? 'low' : 'moderate'}>{v === schema.suggested_mapping[f.key] ? t('hub.matched') : t('hub.manual')}</Badge> : <Badge tone="high">{t('hub.missing')}</Badge>}</td></tr>); })}</tbody></table></div>
      </Card>
    </div>
  );
}

/* ---------- HIS simulator ---------- */
function HisSimulator({ user }) {
  const { t, tx } = useT();
  const [connected, setConnected] = useState(false); const [logs, setLogs] = useState([]); const [endpoints, setEndpoints] = useState(HIS_ENDPOINTS.map((e) => ({ ...e, status: 'offline' }))); const [token, setToken] = useState(null);
  useEffect(() => { api.hisStatus().then((s) => { if (s) { setConnected(s.connected); setLogs(s.log_tail || []); setEndpoints(s.endpoints); setToken(s.token_preview); } }).catch(() => {}); }, []);
  useEffect(() => {
    if (!connected) return;
    const stop = subscribeHisLog((msg) => { if (msg.type === 'log') { setLogs((l) => [...l.slice(-200), msg.entry]); setEndpoints(msg.endpoints); } });
    return stop;
  }, [connected]);
  const toggle = async () => {
    if (api.online) { const s = connected ? await api.hisDisconnect() : await api.hisConnect(); setConnected(s.connected); setLogs(s.log_tail || []); setEndpoints(s.endpoints); setToken(s.token_preview); }
    else { setConnected((c) => !c); setLogs([]); setToken(connected ? null : 'mock_7Hq…'); if (connected) setEndpoints(HIS_ENDPOINTS.map((e) => ({ ...e, status: 'offline' }))); }
  };
  const colors = { ok: '#16A34A', warn: '#F59E0B', err: '#E5484D', info: '#60A5FA' };
  const epStatus = (s) => (s === 'connecting' ? '…' : s === 'live' || s === 'offline' ? t(`hub.ep.${s}`) : s);
  return (
    <div className="grid lg:grid-cols-[320px_1fr] gap-4 fade-in">
      <Card title={t('hub.his.status')} sub={user.hospital.name}>
        <button type="button" className={`btn w-full justify-center ${connected ? '' : 'btn-primary'}`} onClick={toggle}>{connected ? <X size={16} /> : <Link2 size={16} />}{connected ? t('hub.his.disconnect') : t('hub.his.connect')}</button>
        <div className="grid gap-2 mt-4">{endpoints.map((e) => <div key={e.id} className="card p-3 flex items-center gap-3"><span className={`dot ${e.status === 'live' ? 'dot-live' : ''}`} /><div className="min-w-0 flex-1"><div className="text-sm font-medium">{tx(e.name)}</div><div className="muted text-xs">{tx(e.detail)}</div></div><Badge tone={e.status === 'live' ? 'low' : 'muted'}>{epStatus(e.status)}</Badge></div>)}</div>
        <div className="kv mt-4"><span className="muted">{t('hub.his.auth')}</span><span>OAuth2 client-credentials · SMART backend</span><span className="muted">{t('hub.his.token')}</span><span className="mono">{token || '—'}</span><span className="muted">{t('hub.his.residency')}</span><span>{t('hub.his.residencyVal')}</span><span className="muted">{t('hub.his.audit')}</span><span>{t('hub.his.auditVal')}</span></div>
      </Card>
      <Card title={t('hub.his.log')} sub={api.online ? 'WebSocket /api/integration/ws/his' : t('hub.his.local')} right={connected && <span className="flex items-center gap-2 text-xs"><span className="dot dot-live" />{t('hub.his.streaming')}</span>}>
        <div className="log p-3 h-96 overflow-auto" style={{ background: '#0B2239', color: '#D9E8EC', borderRadius: 4 }}>{logs.length === 0 && <div style={{ color: '#8AA0B2' }}>{t('hub.his.noSession')}</div>}{logs.map((l, i) => <div key={i}><span style={{ color: '#8AA0B2' }}>{new Date((l.t || 0) * 1000).toLocaleTimeString('en-GB')}</span> <span style={{ color: colors[l.level] }}>[{(l.level || 'info').toUpperCase()}]</span> {l.msg}</div>)}</div>
      </Card>
    </div>
  );
}

/* ---------- Expert review loop ---------- */
const AWAITING = 'Awaiting 24 h follow-up';
function ExpertReview({ user, predictions }) {
  const { t, tx } = useT();
  const [items, setItems] = useState([]); const [draft, setDraft] = useState({}); const [stats, setStats] = useState(null);
  const canReview = user.role === 'neonatologist';
  const load = async () => {
    const serverItems = await api.predictions();
    const base = serverItems.length ? serverItems.map((p) => ({ id: p.id, patient_id: p.patient_id, risk_percent: p.risk_percent, observed: p.review?.observed_outcome || AWAITING, review: p.review })) : REVIEW_SEED;
    const local = predictions.filter((p) => String(p.prediction_id).startsWith('local-')).map((p) => ({ id: p.prediction_id, patient_id: p.patient_id, risk_percent: p.risk_percent, observed: AWAITING, review: null }));
    setItems([...local.reverse(), ...base]); setStats(await api.reviewStats());
  };
  useEffect(() => { load(); }, [predictions.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const sign = async (item, status) => {
    const body = { status, note: draft[item.id] ?? item.review?.note ?? '', observed_outcome: item.observed, confidence_flag: 0 };
    if (api.online && !String(item.id).startsWith('local-') && !String(item.id).startsWith('r')) { await api.review(item.id, body); await load(); }
    else setItems((xs) => xs.map((x) => x.id === item.id ? { ...x, review: { ...body, reviewer_name: user.full_name } } : x));
  };
  const approved = stats?.approved ?? items.filter((i) => i.review?.status === 'approved').length, flagged = stats?.flagged ?? items.filter((i) => i.review?.status === 'flagged').length;
  const revStatus = (s) => (s === 'approved' || s === 'flagged' ? t(`hub.rev.st.${s}`) : s);
  return (
    <div className="grid gap-4 fade-in">
      <div className="grid grid-cols-3 gap-3"><Stat label={t('hub.rev.approved')} value={approved} tone="#16A34A" /><Stat label={t('hub.rev.flagged')} value={flagged} tone="#E5484D" /><Stat label={t('hub.rev.pending')} value={items.length - approved - flagged} tone="#B45309" /></div>
      <Card title={t('hub.rev.title')} sub={canReview ? t('hub.rev.sub') : t('hub.rev.readonly')}>
        <div className="grid gap-3">{items.map((r) => { const tr = tier(r.risk_percent); return (
          <div key={r.id} className="card p-3 grid md:grid-cols-[160px_1fr_auto] gap-3 items-start">
            <div><div className="mono text-sm text-primary">{r.patient_id}</div><div className="mt-1"><Badge tone={tr}>{t(`tier.${tr}`)} {r.risk_percent}%</Badge></div><div className="muted text-xs mt-2">{t('hub.rev.observed')}: {tx(r.observed)}</div>{r.review?.reviewer_name && <div className="muted text-xs mt-1">{t('hub.rev.signed')}: {r.review.reviewer_name}</div>}</div>
            <div className="min-w-0"><label className="eyebrow" htmlFor={`note-${r.id}`}>{t('doc.note')}</label><textarea id={`note-${r.id}`} rows={2} placeholder={t('hub.rev.ph')} disabled={!canReview} value={draft[r.id] ?? (r.review?.note ? tx(r.review.note) : '')} onChange={(e) => setDraft((n) => ({ ...n, [r.id]: e.target.value }))} /></div>
            <div className="flex md:flex-col gap-2">{!r.review ? <><button type="button" className="btn text-ok" disabled={!canReview} onClick={() => sign(r, 'approved')}><Check size={16} />{t('hub.rev.approve')}</button><button type="button" className="btn text-coral" disabled={!canReview} onClick={() => sign(r, 'flagged')}><Flag size={16} />{t('hub.rev.flag')}</button></> : <Badge tone={r.review.status === 'approved' ? 'low' : 'critical'}>{revStatus(r.review.status)}</Badge>}</div>
          </div>); })}</div>
        <p className="muted text-xs mt-3">{t('hub.rev.reviewer')}: {user.full_name} · {t(`an.role.${user.role}`, user.role)}</p>
      </Card>
    </div>
  );
}

export default function DatasetIntegrationTab({ user, predictions }) {
  const { t } = useT();
  const [tab, setTab] = useState('bench');
  return (
    <div className="grid gap-4">
      <Tabs tabs={[['bench', t('hub.tab.bench'), Layers], ['schema', t('hub.tab.schema'), Database], ['his', t('hub.tab.his'), Plug], ['review', t('hub.tab.review'), ClipboardCheck]]} value={tab} onChange={setTab} />
      {tab === 'bench' && <Benchmarking />}
      {tab === 'schema' && <SchemaMapper />}
      {tab === 'his' && <HisSimulator user={user} />}
      {tab === 'review' && <ExpertReview user={user} predictions={predictions} />}
    </div>
  );
}
