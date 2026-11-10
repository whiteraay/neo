import { useEffect, useMemo, useState } from 'react';
import { Users, AlertTriangle, Activity, ClipboardList, CalendarClock, ArrowRight, ClipboardPlus, ListChecks, Stethoscope, BookOpen } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell, CartesianGrid } from 'recharts';
import { Card, Badge, Stat, dueLabel } from '../../lib/ui.jsx';
import { useT, DataText } from '../../lib/i18n.jsx';
import { locale, ventName, taskTitle } from '../../lib/i18n/doctor.js';
import { scoreRisk, TIER_COLOR } from '../../lib/risk.js';
import { featuresFor } from '../../lib/mock.js';
import { SITUATIONS } from '../../lib/situations.js';
import { api } from '../../services/api.js';

const VENT_ORDER = ['HFOV', 'SIMV', 'nCPAP', 'HFNC', 'room air'];
const GA_BANDS = [[0, 28, '< 28'], [28, 32, '28–31'], [32, 37, '32–36'], [37, 99, '≥ 37']];

/** A labelled count with a bar sized against the unit total. */
const CountBar = ({ label, n, total, color }) => (
  <div className="grid grid-cols-[92px_1fr_20px] items-center gap-2 text-xs">
    <span className="truncate">{label}</span>
    <span className="h-2 rounded-full bg-cream overflow-hidden"><span className="block h-full rounded-full" style={{ width: `${(n / total) * 100}%`, background: color }} /></span>
    <span className="mono text-right">{n}</span>
  </div>
);

/**
 * Ward home (ported from the initial repository's WelcomeDashboard): patients in the unit, critical count,
 * average 24 h risk, sign-off queue; patients sorted by risk; risk distribution chart; today's appointments;
 * open shift tasks, unit composition and handbook shortcuts.
 */
export default function WelcomeDashboard({ patients, onOpenPatient, onGoIntake, onGoTasks, onOpenSituation, streaming }) {
  const { t, tx, lang } = useT();
  const [queue, setQueue] = useState(null); const [appts, setAppts] = useState([]);
  useEffect(() => { Promise.all([api.predictions(), api.documents().catch(() => [])]).then(([predictions, documents]) => setQueue(predictions.filter((p) => !p.review).length + documents.filter((d) => d.status === 'pending').length)).catch(() => setQueue(0)); api.appointments().then(setAppts).catch(() => setAppts([])); }, [patients]);
  const [tasks, setTasks] = useState([]);
  const loadTasks = () => api.tasks().then(setTasks).catch(() => setTasks([]));
  useEffect(() => { loadTasks(); }, [patients]);
  const [server, setServer] = useState({});
  useEffect(() => { if (!api.online) return; let on = true; Promise.all(patients.map((p) => api.predict(p.id, {}, false).then((r) => [p.id, r]).catch(() => null))).then((rs) => { if (on) setServer(Object.fromEntries(rs.filter(Boolean))); }); return () => { on = false; }; }, [patients]);
  const scored = useMemo(() => patients.map((p) => { const r = server[p.id]; const score = r ? { risk_percent: r.risk_percent, risk_tier: r.risk_tier } : scoreRisk(featuresFor(p)); return { ...p, score }; }).sort((a, b) => b.score.risk_percent - a.score.risk_percent), [patients, server]);
  const critical = scored.filter((p) => p.score.risk_tier === 'critical' || p.score.risk_tier === 'high').length;
  const avgRisk = scored.length ? Math.round(scored.reduce((s, p) => s + p.score.risk_percent, 0) / scored.length) : 0;
  const upcoming = appts.filter((a) => a.status === 'scheduled').slice(0, 4);
  const fmt = (iso) => new Date(iso).toLocaleString(locale(lang), { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  return (
    <div className="grid gap-4">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label={<span className="inline-flex items-center gap-1.5"><Users size={13} />{t('home.patients')}</span>} value={String(patients.length)} unit={t('home.patientsHint')} />
        <Stat label={<span className="inline-flex items-center gap-1.5"><AlertTriangle size={13} />{t('home.critical')}</span>} value={String(critical)} unit={t('home.criticalHint')} tone="#C62828" />
        <Stat label={<span className="inline-flex items-center gap-1.5"><Activity size={13} />{t('home.avgRisk')}</span>} value={`${avgRisk}%`} unit={streaming ? t('home.live') : t('home.paused')} tone="#B45309" />
        <Stat label={<span className="inline-flex items-center gap-1.5"><ClipboardList size={13} />{t('doc.queue')}</span>} value={queue == null ? '…' : String(queue)} unit={t('home.queueHint')} tone="#0E9F9B" />
      </section>
      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card title={t('home.byRisk')} sub={t('home.byRiskSub')} right={<button type="button" className="btn whitespace-nowrap" onClick={onGoIntake}><ClipboardPlus size={14} />{t('doc.admission')}</button>}>
          <div className="grid gap-2">
            {scored.map((p) => (
              <button key={p.id} type="button" className="tile py-3 flex items-center gap-3 text-left" onClick={() => onOpenPatient(p.id)}>
                <span className="w-12 h-12 rounded-md grid place-items-center big-num text-base text-white shrink-0" style={{ background: TIER_COLOR[p.score.risk_tier] }}>{p.score.risk_percent}%</span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2"><span className="mono text-xs text-primary">{p.id}</span><Badge tone={p.score.risk_tier}>{t(`tier.${p.score.risk_tier}`)}</Badge><span className="muted text-xs ml-auto">{t('home.bed')} {p.bed}</span></span>
                  <span className="block font-semibold text-sm mt-0.5 truncate"><DataText text={p.diagnosis} /></span>
                  <span className="block muted text-xs">{p.gestational_age_wk} {t('home.wk')} · {p.birth_weight_g} {t('u.g')} · {p.postnatal_age_h} {t('u.h')} · {ventName(t, p.ventilation_mode)}</span>
                </span>
                <ArrowRight size={16} className="muted shrink-0" />
              </button>
            ))}
          </div>
        </Card>
        <div className="grid gap-4 self-start">
          <Card title={t('home.distribution')} sub={t('home.distributionSub')}>
            <div className="h-56"><ResponsiveContainer width="100%" height="100%"><BarChart data={scored.map((p) => ({ name: p.id.replace('KZ-2026-', '#'), risk: p.score.risk_percent, tier: p.score.risk_tier }))} margin={{ left: -18, right: 8, top: 8, bottom: 0 }}><CartesianGrid vertical={false} /><XAxis dataKey="name" /><YAxis domain={[0, 100]} /><Tooltip cursor={{ fill: 'rgba(15,76,129,.06)' }} formatter={(v) => [`${v}%`, t('doc.risk')]} /><Bar dataKey="risk" radius={[6, 6, 0, 0]}>{scored.map((p) => <Cell key={p.id} fill={TIER_COLOR[p.score.risk_tier]} />)}</Bar></BarChart></ResponsiveContainer></div>
          </Card>
          <Card title={<span className="flex items-center gap-2"><CalendarClock size={16} />{t('appt.title')}</span>} sub={t('home.apptSub')}>
            {upcoming.length === 0 ? <div className="muted text-sm">{t('appt.none')}</div> : <div className="grid gap-2">{upcoming.map((a) => <div key={a.id} className="flex items-start gap-3 text-sm"><span className="mono text-xs text-primary whitespace-nowrap pt-0.5">{fmt(a.scheduled_at)}</span><span className="min-w-0"><span className="font-medium">{a.patient_label}</span><span className="muted block text-xs truncate">{t(`appt.type.${a.appointment_type}`)} · {a.clinician_name}</span></span></div>)}</div>}
          </Card>
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title={<span className="flex items-center gap-2"><ListChecks size={16} />{t('doc.tasks')}</span>} sub={t('home.tasksSub')} right={<button type="button" className="btn whitespace-nowrap" onClick={onGoTasks}>{t('home.tasksAll')}</button>}>
          {tasks.length === 0 ? <div className="muted text-sm">{t('home.tasksNone')}</div> : <div className="grid">{tasks.slice(0, 4).map((x) => { const overdue = x.due_at && new Date(x.due_at) < Date.now(); return (
            <label key={x.id} className="flex items-start gap-2.5 text-sm py-2 border-b border-line last:border-b-0 cursor-pointer">
              <input type="checkbox" className="mt-0.5" onChange={() => api.toggleTask(x.id, true).then(loadTasks)} />
              <span className="min-w-0 flex-1"><span className="block font-medium">{taskTitle(t, tx, x.title)}</span><span className="block muted text-xs">{x.patient_id ? `${x.patient_id} · ` : ''}<span style={overdue ? { color: '#C62828', fontWeight: 600 } : undefined}>{dueLabel(x.due_at, t)}</span></span></span>
              <Badge tone={x.priority === 'normal' ? 'muted' : x.priority}>{x.priority === 'normal' ? t('prio.normal') : t(`tier.${x.priority}`)}</Badge>
            </label>); })}</div>}
        </Card>
        <Card title={<span className="flex items-center gap-2"><Stethoscope size={16} />{t('home.unit')}</span>} sub={t('home.unitSub')}>
          <div className="eyebrow mb-2">{t('home.vent')}</div>
          <div className="grid gap-1.5">{VENT_ORDER.map((m) => [m, patients.filter((p) => p.ventilation_mode === m).length]).filter(([, n]) => n).map(([m, n]) => <CountBar key={m} label={m === 'room air' ? t('home.roomAir') : m} n={n} total={patients.length} color="#0E9F9B" />)}</div>
          <div className="eyebrow mt-4 mb-2">{t('home.ga')}, {t('home.wk')}</div>
          <div className="grid gap-1.5">{GA_BANDS.map(([from, to, label]) => [label, patients.filter((p) => p.gestational_age_wk >= from && p.gestational_age_wk < to).length]).filter(([, n]) => n).map(([label, n]) => <CountBar key={label} label={label} n={n} total={patients.length} color="#2F80ED" />)}</div>
        </Card>
        <Card title={<span className="flex items-center gap-2"><BookOpen size={16} />{t('doc.handbook')}</span>} sub={t('home.hbSub')}>
          <div className="grid gap-1.5">{SITUATIONS.map((s) => <button key={s.id} type="button" className="tile py-2 flex items-center gap-2 text-left text-sm font-medium" onClick={() => onOpenSituation(s.id)}><span className="min-w-0 flex-1 truncate">{lang === 'kz' ? s.kz : lang === 'en' ? s.en || s.title : s.title}</span><ArrowRight size={14} className="muted shrink-0" /></button>)}</div>
        </Card>
      </div>
    </div>
  );
}
