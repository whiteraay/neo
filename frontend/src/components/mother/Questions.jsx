/* «Вопросы к врачу»: a printable list to take to the appointment. Questions, not conclusions. */
import { useEffect, useMemo, useState } from 'react';
import { Printer, Plus, Trash2, MessageCircle, Info } from 'lucide-react';
import { Card, Badge } from '../../lib/ui.jsx';
import { useT } from '../../lib/i18n.jsx';
import { api } from '../../services/api.js';
import { fmtDate, fmtGa, testName, unitLabel } from './Labs.jsx';
import { alertText } from './Trends.jsx';

const KEY_OWN = 'neo.mom.questions';
const KEY_DONE = 'neo.mom.questions.done';
const readLS = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const writeLS = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode: keep in memory only */ } };
const CHANGE_SHARE = 0.1; // a change of 10 % or more between the last two results is worth a question

const PRINT_CSS = `@media print { body * { visibility: hidden !important; } #mom-print, #mom-print * { visibility: visible !important; } #mom-print { position: absolute; inset: 0 auto auto 0; width: 100%; padding: 16px; } .no-print { display: none !important; } }`;

export default function Questions() {
  const { t, tx, lang } = useT();
  const [tl, setTl] = useState(null); const [catalog, setCatalog] = useState([]);
  const [own, setOwn] = useState(() => readLS(KEY_OWN, [])); const [done, setDone] = useState(() => readLS(KEY_DONE, {})); const [draft, setDraft] = useState('');
  useEffect(() => { api.labCatalog().then((c) => setCatalog(c.tests)).catch(() => {}); api.labTimeline().then(setTl).catch(() => setTl({ series: {}, alerts: [] })); }, []);
  useEffect(() => writeLS(KEY_OWN, own), [own]);
  useEffect(() => writeLS(KEY_DONE, done), [done]);

  const generated = useMemo(() => {
    if (!tl) return [];
    const out = []; const seen = new Set();
    for (const a of tl.alerts || []) {
      const id = `a:${a.code}:${a.test}:${a.date}`; if (seen.has(a.test)) continue; seen.add(a.test);
      out.push({ id, level: a.level, why: alertText(a, t, tx, catalog, lang), q: t(`q.${a.code}`, { test: testName(catalog, a.test, lang) }) });
    }
    for (const [code, pts] of Object.entries(tl.series || {})) {
      const nums = pts.filter((p) => p.value != null); if (nums.length < 2 || seen.has(code)) continue;
      const [a, b] = nums.slice(-2); if (!a.value || Math.abs(b.value - a.value) / Math.abs(a.value) < CHANGE_SHARE) continue;
      seen.add(code);
      out.push({ id: `c:${code}:${b.date}`, level: 'info', why: t('q.changeWhy', { test: testName(catalog, code, lang), a: a.value, b: b.value, unit: unitLabel(b.unit, tx), ga: fmtGa(b.ga_days, t) }), q: t('q.change', { test: testName(catalog, code, lang) }) });
    }
    return out;
  }, [tl, catalog, lang, t, tx]);

  const latest = useMemo(() => Object.entries(tl?.series || {}).map(([code, pts]) => ({ code, p: pts[pts.length - 1] })).filter((x) => x.p).sort((a, b) => b.p.date.localeCompare(a.p.date)), [tl]);
  const toggle = (id) => setDone((d) => ({ ...d, [id]: !d[id] }));
  const add = (e) => { e.preventDefault(); const text = draft.trim(); if (text.length < 3) return; setOwn((o) => [...o, { id: `o:${Date.now()}`, text }]); setDraft(''); };
  if (!tl) return <div className="muted text-sm">{t('loading')}</div>;

  return (
    <div id="mom-print" className="grid gap-4 lg:grid-cols-[1fr_360px]">
      <style>{PRINT_CSS}</style>
      <div className="grid gap-4 self-start min-w-0">
        <Card title={<span className="flex items-center gap-2"><MessageCircle size={16} />{t('q.title')}</span>} sub={t('q.sub')} right={<button type="button" className="btn no-print" onClick={() => window.print()}><Printer size={14} />{t('q.print')}</button>}>
          <div className="eyebrow mb-2">{t('q.fromResults')}</div>
          {generated.length === 0 && <div className="muted text-sm mb-3">{t('q.noneGenerated')}</div>}
          <div className="grid gap-2 mb-4">{generated.map((g) => (
            <label key={g.id} className="card p-3 flex gap-3 items-start cursor-pointer">
              <input type="checkbox" className="mt-1" checked={!!done[g.id]} onChange={() => toggle(g.id)} />
              <div className="min-w-0" style={done[g.id] ? { opacity: 0.55 } : undefined}><div className="font-semibold text-sm">{g.q}</div><div className="muted text-xs mt-0.5">{g.why}</div></div>
              {g.level === 'urgent' && <Badge tone="critical">{t('level.urgent')}</Badge>}
            </label>))}</div>
          <div className="eyebrow mb-2">{t('q.mine')}</div>
          <div className="grid gap-2">{own.map((o) => (
            <div key={o.id} className="card p-3 flex gap-3 items-start">
              <input type="checkbox" className="mt-1" checked={!!done[o.id]} onChange={() => toggle(o.id)} aria-label={o.text} />
              <div className="flex-1 text-sm" style={done[o.id] ? { opacity: 0.55 } : undefined}>{o.text}</div>
              <button type="button" className="btn px-2 py-1 no-print" aria-label={t('lab.delete')} onClick={() => setOwn((xs) => xs.filter((x) => x.id !== o.id))}><Trash2 size={13} /></button>
            </div>))}</div>
          <form className="flex gap-2 mt-3 no-print" onSubmit={add}><input className="input flex-1" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={t('q.placeholder')} /><button type="submit" className="btn btn-primary"><Plus size={14} />{t('q.add')}</button></form>
        </Card>
      </div>
      <div className="grid gap-4 self-start">
        <Card title={t('q.recent')} sub={tl.gestational_age_today_days != null ? `${t('q.today')} ${fmtGa(tl.gestational_age_today_days, t)}` : ''}>
          {latest.length === 0 ? <div className="muted text-sm">{t('trend.noData')}</div> : (
            <table className="table text-sm"><thead><tr><th>{t('lab.col.test')}</th><th>{t('lab.col.value')}</th><th>{t('trend.date')}</th></tr></thead>
              <tbody>{latest.map(({ code, p }) => <tr key={code}><td>{testName(catalog, code, lang)}</td><td className="mono whitespace-nowrap">{p.value ?? p.value_text} {unitLabel(p.unit, tx)}</td><td className="whitespace-nowrap">{fmtDate(p.date, lang)}{p.ga_days != null ? <div className="muted text-[11px]">{fmtGa(p.ga_days, t)}</div> : null}</td></tr>)}</tbody></table>)}
        </Card>
        <p className="muted text-xs flex gap-1.5"><Info size={13} className="shrink-0 mt-0.5" />{t('q.note')}</p>
      </div>
    </div>
  );
}
