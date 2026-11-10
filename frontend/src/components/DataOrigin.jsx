/**
 * Provenance UI. Every dataset-backed component states where its numbers come from with one of these pills,
 * fed by GET /api/ml/provenance and the `sources` block of /api/analytics/regions.
 */
import { useEffect, useState } from 'react';
import { Database, Radio, Sparkles, ShieldCheck, FileSpreadsheet, ArrowRight, Cpu, BrainCircuit, ClipboardCheck, RefreshCw } from 'lucide-react';
import { api } from '../services/api.js';
import { useT } from '../lib/i18n.jsx';

/** The API labels the training data in English, e.g. "PIC v1.1.0 (2545 neonates, NICU)"; render it in the viewer's language. */
export function trainedOnLabel(s, t) {
  if (!s) return s;
  let m = s.match(/^(.*) \((\d+) neonates, NICU\)$/);
  if (m) return t('origin.neonates', { src: m[1], n: m[2] });
  m = s.match(/^PICDB-shaped synthetic baseline \((\d+) admissions\)$/);
  if (m) return t('origin.synthBaseline', { n: m[1] });
  return s;
}

const KIND = {
  official: { cls: 'origin-official', Icon: ShieldCheck },
  synthetic: { cls: 'origin-synthetic', Icon: Database },
  simulated: { cls: 'origin-simulated', Icon: Radio },
  model: { cls: 'origin-model', Icon: Cpu },
  estimate: { cls: 'origin-estimate', Icon: Sparkles },
  real: { cls: 'origin-official', Icon: Database },
};

export function OriginPill({ kind = 'estimate', children, title }) {
  const { cls, Icon } = KIND[kind] || KIND.estimate;
  return <span className={`origin ${cls}`} title={title}><Icon size={11} />{children}</span>;
}

export function useProvenance() {
  const [prov, setProv] = useState(null);
  useEffect(() => { api.provenance().then(setProv).catch(() => setProv(null)); }, []);
  return prov;
}

/** Pill describing the active tabular model and the data it was trained on. */
export function ModelOriginPill({ prov }) {
  const { t: tr } = useT();
  const p = prov || useProvenance();
  if (!p) return <OriginPill kind="model">{tr('origin.modelLoading')}</OriginPill>;
  const t = p.tabular; const synthetic = t.baseline?.is_synthetic && !(t.uploads?.length);
  return (
    <span className="inline-flex flex-wrap gap-1.5">
      <OriginPill kind="model" title={tr('origin.activeModel', { v: t.model_version })}>{t.model_version?.replace('xgb-24h-', 'xgb ')}</OriginPill>
      <OriginPill kind={synthetic ? 'synthetic' : 'real'} title={trainedOnLabel(t.trained_on, tr)}>{synthetic ? tr('origin.trainedSynthetic', { n: t.n || 804 }) : tr('origin.trainedOn', { src: trainedOnLabel(t.trained_on, tr) })}</OriginPill>
      {t.uploads?.length > 0 && <OriginPill kind="real">{tr('origin.localDatasets', { n: t.uploads.length })}</OriginPill>}
    </span>
  );
}

/** Horizontal data-flow indicator: EHR export → schema mapper → 31 features → model → SHAP → sign-off → retrain. */
export function DataFlow({ compact = false, prov }) {
  const { t } = useT();
  const steps = [
    [FileSpreadsheet, t('flow.export'), t('flow.export.sub')],
    [ArrowRight, t('flow.mapper'), t('flow.mapper.sub')],
    [Database, prov?.tabular?.baseline?.is_synthetic ? t('flow.baseline') : t('flow.local'), trainedOnLabel(prov?.tabular?.trained_on, t) || t('flow.baseline.sub')],
    [Cpu, `XGBoost ${prov?.tabular?.model_version?.replace('xgb-24h-', '') || ''}`, t('flow.model.sub')],
    [BrainCircuit, t('flow.shap'), t('flow.shap.sub')],
    [ClipboardCheck, t('flow.signoff'), t('flow.signoff.sub')],
    [RefreshCw, t('flow.retrain'), t('flow.retrain.sub')],
  ];
  return (
    <div className={`flex ${compact ? 'gap-1' : 'gap-2'} overflow-x-auto py-1`}>
      {steps.map(([Icon, title, sub], i) => (
        <div key={i} className="flex items-center gap-2 shrink-0">
          <div className={`card ${compact ? 'px-2.5 py-1.5' : 'px-3 py-2'} flex items-center gap-2`}><Icon size={14} className="text-primary" /><div><div className="text-xs font-semibold whitespace-nowrap">{title}</div>{!compact && <div className="muted text-[11px] whitespace-nowrap">{sub}</div>}</div></div>
          {i < steps.length - 1 && <ArrowRight size={12} className="text-line-strong shrink-0" />}
        </div>
      ))}
    </div>
  );
}
