/**
 * ModelOpsDashboard — analyst interface for the retraining engine:
 * trigger a run, watch progress, upload a dataset (auto-retrain), compare versions, roll back / activate.
 */
import { useEffect, useRef, useState } from 'react';
import { Cpu, Play, Upload, RotateCcw, CheckCircle2, AlertTriangle, Database, RefreshCw } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell, CartesianGrid, ReferenceLine } from 'recharts';
import { Card, Badge, Stat } from '../lib/ui.jsx';
import { useT } from '../lib/i18n.jsx';
import { api } from '../services/api.js';

const STATUS_TONE = { active: 'low', candidate: 'primary', archived: 'muted', rolled_back: 'moderate', failed: 'critical' };
const TRIGGERS = ['manual', 'dataset_upload', 'feedback_loop', 'scheduler', 'bootstrap'];
const STATUSES = ['idle', 'running', 'done', 'failed', 'active', 'candidate', 'archived', 'rolled_back'];
/* Stage names the training engine reports (backend/ml/train_tabular.py, services/retraining_engine.py). */
const STAGE_KEY = { queued: 'queued', 'gathering data': 'gather', 'validating schema': 'schema', 'cross-validation': 'cv', 'final fit': 'fit', calibration: 'calibration', 'saving artifacts': 'saving' };
const LOCALE = { kz: 'kk-KZ', ru: 'ru-RU', en: 'en-GB' };

function useLabels() {
  const { t } = useT();
  return {
    trigger: (x) => (TRIGGERS.includes(x) ? t(`mlops.trigger.${x}`) : x),
    status: (x) => (STATUSES.includes(x) ? t(`mlops.status.${x}`) : x),
    stage: (x) => {
      if (!x) return t('mlops.status.idle');
      if (x === 'done') return t('mlops.status.done');
      const fold = /^fold (\d+)\/5$/.exec(x);
      if (fold) return t('mlops.stage.fold', { i: fold[1] });
      return STAGE_KEY[x] ? t(`mlops.stage.${STAGE_KEY[x]}`) : x;
    },
  };
}

export function DatasetUploader({ onDone, compact }) {
  const { t } = useT();
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState(null); const [retrain, setRetrain] = useState(true);
  const upload = async (file) => {
    if (!file) return; setBusy(true); setMsg(null);
    try { const r = await api.uploadDataset(file, retrain); setMsg({ ok: true, text: `${t('mlops.uploadMsg', { file: r.file, rows: r.rows, f: r.features_present, p: Math.round(r.prevalence * 100) })}${r.retrain_started ? t('mlops.retrainStarted') : ''}` }); onDone?.(r); }
    catch (e) { setMsg({ ok: false, text: e.message }); } finally { setBusy(false); }
  };
  return (
    <div className={compact ? '' : 'card p-4'}>
      {!compact && <div className="eyebrow mb-2 flex items-center gap-2"><Database size={12} />{t('mlops.ingest')}</div>}
      <div className="flex flex-wrap items-center gap-3">
        <label className="btn btn-primary cursor-pointer"><Upload size={14} />{busy ? t('mlops.uploading') : t('mlops.upload')}<input type="file" accept=".csv,.parquet" className="hidden" disabled={busy} onChange={(e) => upload(e.target.files?.[0])} /></label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={retrain} onChange={(e) => setRetrain(e.target.checked)} />{t('mlops.autoRetrain')}</label>
      </div>
      <p className="muted text-xs mt-2">{t('mlops.hint1')} <span className="mono">deteriorated_24h</span>{t('mlops.hint2')}</p>
      {msg && <div className={`text-sm mt-2 flex items-start gap-2 ${msg.ok ? 'text-ok' : 'text-coral'}`}>{msg.ok ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}<span>{msg.text}</span></div>}
    </div>
  );
}

export default function ModelOpsDashboard() {
  const { t, lang } = useT(); const L = useLabels();
  const [status, setStatus] = useState(null); const [versions, setVersions] = useState([]); const [datasets, setDatasets] = useState([]); const [notes, setNotes] = useState(''); const [err, setErr] = useState('');
  const timer = useRef(null);
  const load = async () => { const [s, v, d] = await Promise.all([api.mlStatus(), api.mlVersions(), api.mlDatasets()]); setStatus(s); setVersions(v); setDatasets(d); return s; };
  useEffect(() => { load(); return () => clearInterval(timer.current); }, []);
  useEffect(() => { clearInterval(timer.current); if (status?.status === 'running') timer.current = setInterval(load, 1500); return () => clearInterval(timer.current); }, [status?.status]); // eslint-disable-line
  const retrain = async () => { setErr(''); try { await api.retrain({ notes, auto_activate: true }); await load(); } catch (e) { setErr(e.message); } };
  const activate = async (v) => { setErr(''); try { await api.rollback(v.version, v.active ? '' : `activated from Model Ops (was ${v.status})`); await load(); } catch (e) { setErr(e.message); } };
  if (!status) return <div className="muted text-sm">{t('loading')}</div>;
  const running = status.status === 'running'; const act = status.active || {}; const m = act.metrics || {};
  const chart = versions.filter((v) => v.metrics?.auroc).map((v) => ({ v: v.version.replace('-kz-local', ''), auroc: v.metrics.auroc, status: v.status })).reverse();
  return (
    <div className="grid gap-4">
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label={t('mlops.active')} value={act.version?.replace('xgb-24h-', '') || '—'} unit={act.calibrated ? t('an.q.calibrated') : t('an.q.uncalibrated')} tone="#0E9F9B" />
        <Stat label="AUROC (CV)" value={m.auroc?.toFixed(3) ?? '—'} unit={m.sensitivity != null ? t('mlops.sensSpec', { s: Math.round(m.sensitivity * 100), p: Math.round(m.specificity * 100) }) : ''} />
        <Stat label={t('mlops.versions')} value={versions.length} unit={t('mlops.candidates', { n: versions.filter((v) => v.status === 'candidate').length })} />
        <Stat label={t('mlops.fbTrigger')} value={`${status.feedback?.threshold ?? 25}`} unit={t('mlops.fbUnit')} />
      </div>

      <div className="grid lg:grid-cols-[1fr_1fr] gap-4">
        <Card title={<span className="flex items-center gap-2"><Cpu size={16} />{t('mlops.engine')}</span>} sub={t('mlops.engineSub')}>
          <div className="flex flex-wrap gap-2 items-center">
            <input className="input flex-1 min-w-[180px]" placeholder={t('mlops.notes')} value={notes} onChange={(e) => setNotes(e.target.value)} disabled={running} />
            <button type="button" className="btn btn-primary" disabled={running} onClick={retrain}>{running ? <RefreshCw size={14} className="animate-spin" /> : <Play size={14} />}{running ? t('mlops.training') : t('mlops.retrainNow')}</button>
          </div>
          {err && <div className="text-coral text-sm mt-2">{err}</div>}
          <div className="mt-4">
            <div className="flex justify-between text-xs mb-1"><span className="muted">{L.stage(status.stage)}{status.version && ` · ${status.version}`}</span><span className="mono">{status.progress}%</span></div>
            <div className="meter"><span style={{ width: `${status.progress}%`, background: status.status === 'failed' ? '#E5484D' : status.status === 'done' ? '#16A34A' : '#0E9F9B' }} /></div>
            <div className="flex flex-wrap gap-2 mt-2 text-xs">
              <Badge tone={{ idle: 'muted', running: 'primary', done: 'low', failed: 'critical' }[status.status]}>{L.status(status.status)}</Badge>
              {status.trigger && <Badge>{L.trigger(status.trigger)}</Badge>}
              {status.rows > 0 && <span className="muted">{t('mlops.rowsSources', { r: status.rows.toLocaleString(LOCALE[lang]), s: status.sources?.length })}</span>}
              {status.activated === true && <span className="text-ok font-semibold">{t('mlops.activated')}</span>}{status.activated === false && status.status === 'done' && <span className="text-amber font-semibold">{t('mlops.keptCandidate')}</span>}
            </div>
            {status.error && <div className="text-coral text-xs mt-1">{status.error}</div>}
          </div>
          <div className="log p-3 mt-3 h-40 overflow-auto rounded-md" style={{ background: '#0B2239', color: '#D9E8EC' }}>{(status.log || []).length === 0 && <span style={{ color: '#8AA0B2' }}>{t('mlops.noRun')}</span>}{(status.log || []).map((l, i) => <div key={i}>{l}</div>)}</div>
        </Card>
        <div className="grid gap-4">
          <DatasetUploader onDone={load} />
          <Card title={t('mlops.ingested')} sub={t('mlops.ingestedSub')}>{datasets.length === 0 ? <div className="muted text-sm">{t('mlops.noneYet')}</div> : <table className="table"><thead><tr><th>{t('mlops.file')}</th><th>{t('mlops.size')}</th></tr></thead><tbody>{datasets.map((d) => <tr key={d.file}><td className="mono text-xs">{d.file}</td><td className="mono text-xs">{d.size_kb} KB</td></tr>)}</tbody></table>}</Card>
        </div>
      </div>

      <div className="grid lg:grid-cols-[1fr_2fr] gap-4">
        <Card title={t('mlops.byVersion')} sub={t('mlops.cv')}><div className="h-56"><ResponsiveContainer width="100%" height="100%"><BarChart data={chart} margin={{ left: -14, right: 8, top: 8, bottom: 0 }}><CartesianGrid vertical={false} /><XAxis dataKey="v" tick={{ fontSize: 10 }} /><YAxis domain={[0.7, 1]} /><Tooltip /><ReferenceLine y={0.85} stroke="#F59E0B" strokeDasharray="4 4" /><Bar dataKey="auroc" name="AUROC">{chart.map((c, i) => <Cell key={i} fill={c.status === 'active' ? '#0E9F9B' : c.status === 'candidate' ? '#16A34A' : '#B8D0D8'} />)}</Bar></BarChart></ResponsiveContainer></div></Card>
        <Card title={t('mlops.registry')} sub={t('mlops.registrySub')}>
          <div className="overflow-x-auto"><table className="table"><thead><tr><th>{t('mlops.col.version')}</th><th>{t('mlops.col.status')}</th><th>{t('mlops.col.trigger')}</th><th>{t('mlops.col.rows')}</th><th>AUROC</th><th>F1</th><th>ECE</th><th>{t('mlops.col.trained')}</th><th></th></tr></thead><tbody>
            {versions.map((v) => <tr key={v.id}><td className="mono text-xs font-semibold whitespace-nowrap">{v.version}</td><td><Badge tone={STATUS_TONE[v.status] || 'muted'}>{L.status(v.status)}</Badge></td><td className="text-xs">{L.trigger(v.trigger)}</td><td className="mono text-xs">{v.n_rows?.toLocaleString(LOCALE[lang])}</td><td className="mono text-xs">{v.metrics?.auroc?.toFixed(3) ?? '—'}</td><td className="mono text-xs">{v.metrics?.f1?.toFixed(3) ?? '—'}</td><td className="mono text-xs">{(v.metrics?.ece_calibrated ?? v.metrics?.ece_raw)?.toFixed(3) ?? '—'}</td><td className="mono text-xs whitespace-nowrap">{new Date(v.trained_at).toLocaleString(LOCALE[lang])}</td>
              <td>{!v.active && v.status !== 'failed' && <button type="button" className="btn py-1.5 px-2.5 text-xs whitespace-nowrap" onClick={() => activate(v)}><RotateCcw size={12} />{v.status === 'candidate' ? t('mlops.activate') : t('mlops.rollback')}</button>}</td></tr>)}
          </tbody></table></div>
        </Card>
      </div>
    </div>
  );
}
