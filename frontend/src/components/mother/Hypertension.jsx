import { useEffect, useState } from 'react';
import { Card } from '../../lib/ui.jsx';
import { useT } from '../../lib/i18n.jsx';
import { api } from '../../services/api.js';
import { fmtDate } from './Labs.jsx';

export default function Hypertension() {
  const { t, lang } = useT();
  const [arm, setArm] = useState('unknown'); const [data, setData] = useState(null); const [error, setError] = useState('');
  useEffect(() => { let active = true; setData(null); setError(''); api.hypertension(arm).then((r) => { if (active) setData(r); }).catch((e) => { if (active) setError(e.message); }); return () => { active = false; }; }, [arm]);
  return <>
  <Card title={t('ht.title')} sub={t('ht.sub')}>
    <p className="muted text-sm mb-4">{t('ht.note')}</p>
    <label className="text-sm block mb-4">{t('ht.arm')}<select className="input mt-1" value={arm} onChange={(e) => setArm(e.target.value)}>{['unknown', 'right', 'left'].map((k) => <option key={k} value={k}>{t(`ht.arm.${k}`)}</option>)}</select></label>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {!data && !error && <p className="muted">{t('loading')}</p>}
    {data && <>
      <div className="grid sm:grid-cols-3 gap-3 mb-4">{['dates', 'elevated_dates', 'severe_dates'].map((key) => <div className="rounded-xl border border-line p-3" key={key}><div className="muted text-xs">{t(`ht.${key}`)}</div><div className="text-2xl font-semibold mt-1">{data.counts[key]}</div></div>)}</div>
      <p className="muted text-xs mb-3">{t('ht.thresholds')}</p>
      {data.rows.length === 0 ? <p className="muted">{t('ht.empty')}</p> : <div className="overflow-x-auto"><table className="table text-sm"><thead><tr><th>{t('trend.date')}</th><th>{t('trend.bpTitle')}</th><th>CardioAI · {t('ht.research')}</th></tr></thead><tbody>{[...data.rows].reverse().map((r) => <tr key={r.date}><td>{fmtDate(r.date, lang)}</td><td><span className={`lab-status lab-status-${r.level === 'below_threshold' ? 'unknown' : r.level}`}>{r.systolic}/{r.diastolic}</span></td><td>{r.model ? <><div>{r.model.stage === 0 ? t('ht.zero') : t('ht.stage', { n: r.model.stage })}</div><div className="muted text-xs mt-1">{t('ht.coverage')}: {r.model.numeric_supplied}/{r.model.numeric_total}</div></> : r.model_error ? t('ht.unavailable') : t('ht.selectArm')}</td></tr>)}</tbody></table></div>}
    </>}
    <a className="text-xs underline mt-4 inline-block" href="https://github.com/AdeleKunuspekova/CardioAI/tree/d03b5d7be5386ed31ac90e92a06bce9814c18dd6/models/hypertensia" target="_blank" rel="noreferrer">{t('ht.source')} · CardioAI</a>
  </Card>
  </>;
}
