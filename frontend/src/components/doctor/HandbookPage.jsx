import { useState } from 'react';
import { Search, AlertTriangle, ListChecks, ExternalLink, Stethoscope, Siren, BookMarked, Sparkles, Plus, Check } from 'lucide-react';
import { Card, Badge } from '../../lib/ui.jsx';
import { useT } from '../../lib/i18n.jsx';
import { api } from '../../services/api.js';
import { SITUATIONS } from '../../lib/situations.js';

const SYMBOL = { fio2: 'FiO₂', spo2: 'SpO₂', pco2: 'pCO₂' };
const AREA = { 'Обмен веществ': 'metabolism', 'Печень и кровь': 'liver', Дыхание: 'breathing', Терморегуляция: 'thermo', Инфекции: 'infection' };
const TONE = { mild: 'low', moderate: 'moderate' };

/** "Поставить контроль": turns the card's follow-up into a shift task (existing /api/tasks contract). */
function Recheck({ s, patients }) {
  const { t } = useT();
  const [pid, setPid] = useState('');
  const [state, setState] = useState('');
  const add = async () => {
    setState('…');
    try { await api.addTask({ title: s.recheck.title, patient_id: pid || null, priority: s.recheck.priority, due_in_minutes: s.recheck.minutes }); setState('ok'); } catch (e) { setState(e.message); }
  };
  const when = s.recheck.minutes >= 60 ? t('due.h').replace('{n}', s.recheck.minutes / 60) : t('due.min').replace('{n}', s.recheck.minutes);
  return (
    <div className="rounded-lg border border-line p-3 grid gap-2" style={{ background: 'var(--color-teal-soft)' }}>
      <div className="font-medium text-sm flex items-center gap-2"><ListChecks size={15} />{t('hb.recheck')}: «{s.recheck.title}» {when}</div>
      <div className="flex flex-col sm:flex-row gap-2">
        <select value={pid} onChange={(e) => { setPid(e.target.value); setState(''); }} aria-label={t('hb.patient')} className="sm:flex-1"><option value="">{t('hb.patientPick')}</option>{patients.map((p) => <option key={p.id} value={p.id}>{p.id} · {t('home.bed')} {p.bed}</option>)}</select>
        <button type="button" className="btn btn-primary" onClick={add} disabled={state === '…'}>{state === 'ok' ? <Check size={14} /> : <Plus size={14} />}{t('hb.toTasks')}</button>
      </div>
      {state && !['ok', '…'].includes(state) && <div className="text-xs font-semibold" style={{ color: 'var(--color-coral)' }}>{state}</div>}
    </div>
  );
}

/** Quick reference cards for common mild–moderate NICU situations, each with its source. */
export default function HandbookPage({ patients, initial }) {
  const { t, lang } = useT();
  const title = (x) => (lang === 'kz' ? x.kz : x.title);
  const area = (x) => t(`hb.area.${AREA[x.area]}`);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(initial || SITUATIONS[0].id);
  const needle = q.trim().toLowerCase();
  const list = SITUATIONS.filter((s) => !needle || [s.title, s.kz, s.area, ...s.when, ...s.steps].join(' ').toLowerCase().includes(needle));
  const s = SITUATIONS.find((x) => x.id === sel) || SITUATIONS[0];

  return (
    <div className="grid gap-4">
      <div className="card p-3 text-sm flex items-start gap-2" style={{ background: 'var(--color-amber-soft)', borderColor: '#F5D9A8' }}><AlertTriangle size={16} className="shrink-0 mt-0.5" style={{ color: 'var(--color-amber)' }} /><span>{t('hb.draft')}</span></div>
      <div className="grid gap-4 xl:grid-cols-[280px_1fr]">
        <Card title={t('doc.handbook')} sub={`${SITUATIONS.length} · ${SITUATIONS.map((x) => t(`hb.sev.${x.severity}`)).filter((v, i, a) => a.indexOf(v) === i).join(' / ').toLowerCase()}`} className="xl:sticky xl:top-20 self-start">
          <label className="relative block mb-3"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 muted" /><input className="input pl-8" placeholder={t('hb.searchHint')} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t('hb.search')} /></label>
          <div className="grid gap-2">{list.map((x) => (
            <button key={x.id} type="button" onClick={() => setSel(x.id)} className={`tile py-2.5 text-left ${sel === x.id ? 'selected' : ''}`}>
              <div className="font-semibold text-sm">{title(x)}</div>
              <div className="flex items-center gap-1.5 mt-1"><Badge tone={TONE[x.severity]}>{t(`hb.sev.${x.severity}`)}</Badge><span className="muted text-xs">{area(x)}</span></div>
            </button>))}
            {!list.length && <div className="muted text-sm">{t('hb.none')}</div>}</div>
        </Card>

        <Card className="min-w-0">
          <div className="grid gap-5">
            <header>
              <div className="flex flex-wrap items-center gap-2"><Badge tone={TONE[s.severity]}>{t(`hb.sev.${s.severity}`)} {t('hb.severity')}</Badge><Badge tone="muted">{area(s)}</Badge></div>
              <h2 className="text-2xl font-semibold mt-2" style={{ letterSpacing: '-0.02em' }}>{title(s)}</h2><div className="muted text-sm">{lang === 'kz' ? s.title : s.kz}</div>{lang !== 'ru' && <p className="muted text-xs mt-2">{t('hb.ruOnly')}</p>}
            </header>
            <section><h3 className="font-semibold text-sm flex items-center gap-2 mb-2"><Stethoscope size={15} />{t('hb.when')}</h3><ul className="grid gap-1.5 text-sm">{s.when.map((w) => <li key={w} className="flex gap-2"><span className="text-primary">•</span>{w}</li>)}</ul></section>
            <section><h3 className="font-semibold text-sm flex items-center gap-2 mb-2"><ListChecks size={15} />{t('hb.steps')}</h3><ol className="grid gap-2 text-sm">{s.steps.map((st, i) => <li key={st} className="flex gap-3"><span className="w-6 h-6 rounded-full grid place-items-center text-xs font-semibold shrink-0 text-white" style={{ background: 'var(--color-primary)' }}>{i + 1}</span><span className="pt-0.5">{st}</span></li>)}</ol></section>
            <section className="rounded-lg p-4" style={{ background: 'var(--color-coral-soft)', border: '1px solid #F6B8A8' }}><h3 className="font-semibold text-sm flex items-center gap-2 mb-2" style={{ color: 'var(--color-coral)' }}><Siren size={15} />{t('hb.escalate')}</h3><ul className="grid gap-1.5 text-sm">{s.escalate.map((e) => <li key={e} className="flex gap-2"><span style={{ color: 'var(--color-coral)' }}>!</span>{e}</li>)}</ul></section>
            <Recheck key={s.id} s={s} patients={patients} />
            <section className="text-sm"><div className="font-medium flex items-center gap-2 mb-1"><Sparkles size={14} />{t('hb.link')}</div><div className="muted">{t('hb.linkBody')}: {s.features.map((f) => SYMBOL[f] || t(`hb.f.${f}`)).join(', ')}.</div></section>
            <section className="border-t border-line pt-4"><div className="font-medium flex items-center gap-2 mb-2 text-sm"><BookMarked size={14} />{t('hb.sources')}</div>
              <ul className="grid gap-1.5 text-sm">{s.sources.map((src) => <li key={src.url}><a href={src.url} target="_blank" rel="noopener noreferrer" className="text-primary underline inline-flex items-center gap-1">{src.name}<ExternalLink size={12} /></a></li>)}
                <li className="muted">{t('hb.protocol')}</li></ul></section>
          </div>
        </Card>
      </div>
    </div>
  );
}
