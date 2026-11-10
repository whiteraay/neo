/**
 * Official regional datasets bundled with the frontend (offline fallback and client-side helpers).
 *  - БНС РК 2025 (initial NeoOutcome repository): infant / neonatal mortality, hospital beds, nursing staff, 2020–2025 trends
 *  - MICS 2024 microdata (bh.sav) and WorldPop 2015 pregnancies, pre-aggregated by the backend build script
 */
import ashyq from '../data/ashyq_regional_2025.json';
import overlay from '../data/official_overlay.json';

export const ASHYQ = ashyq;
export const OVERLAY = overlay;
export const YEARS = [2020, 2021, 2022, 2023, 2024, 2025];

/** Regional centres: the API sends Latin names. */
const CENTRES = {
  Aktau: { ru: 'Актау', kz: 'Ақтау' }, Aktobe: { ru: 'Актобе', kz: 'Ақтөбе' }, Almaty: { ru: 'Алматы', kz: 'Алматы' }, Astana: { ru: 'Астана', kz: 'Астана' }, Atyrau: { ru: 'Атырау', kz: 'Атырау' },
  Jezkazgan: { ru: 'Жезказган', kz: 'Жезқазған' }, Karaganda: { ru: 'Караганда', kz: 'Қарағанды' }, Kokshetau: { ru: 'Кокшетау', kz: 'Көкшетау' }, Konaev: { ru: 'Конаев', kz: 'Қонаев' }, Kostanay: { ru: 'Костанай', kz: 'Қостанай' },
  Kyzylorda: { ru: 'Кызылорда', kz: 'Қызылорда' }, Oral: { ru: 'Уральск', kz: 'Орал' }, Oskemen: { ru: 'Усть-Каменогорск', kz: 'Өскемен' }, Pavlodar: { ru: 'Павлодар', kz: 'Павлодар' }, Petropavl: { ru: 'Петропавловск', kz: 'Петропавл' },
  Semey: { ru: 'Семей', kz: 'Семей' }, Shymkent: { ru: 'Шымкент', kz: 'Шымкент' }, Taldykorgan: { ru: 'Талдыкорган', kz: 'Талдықорған' }, Taraz: { ru: 'Тараз', kz: 'Тараз' }, Turkestan: { ru: 'Туркестан', kz: 'Түркістан' },
};
export const centreName = (centre, lang) => CENTRES[centre]?.[lang] ?? centre;

/** Metric definitions shared by the choropleth, the table and the trend chart. */
export const METRICS = [
  { key: 'infant_mortality', source: 'ashyq', kind: 'mortality', label: { ru: 'Младенческая смертность', kz: 'Нәресте өлімі', en: 'Infant mortality' }, unit: '‰', digits: 2, origin: 'official', note: 'БНС РК 2025 · per 1 000 live births', notes: { en: 'BNS RK 2025 · per 1,000 live births', ru: 'БНС РК 2025 · на 1 000 живорождённых', kz: 'ҚР ҰСБ 2025 · 1 000 тірі туғанға шаққанда' } },
  { key: 'neonatal_mortality', source: 'ashyq', kind: 'mortality', label: { ru: 'Неонатальная смертность', kz: 'Неонаталдық өлім', en: 'Neonatal mortality' }, unit: '‰', digits: 2, origin: 'official', note: 'БНС РК 2025 · per 1 000 live births', notes: { en: 'BNS RK 2025 · per 1,000 live births', ru: 'БНС РК 2025 · на 1 000 живорождённых', kz: 'ҚР ҰСБ 2025 · 1 000 тірі туғанға шаққанда' } },
  { key: 'hospital_beds', source: 'ashyq', kind: 'capacity', label: { ru: 'Больничные койки', kz: 'Аурухана төсектері', en: 'Hospital beds' }, unit: '', digits: 0, origin: 'official', note: 'БНС РК 2025 · all profiles', notes: { en: 'BNS RK 2025 · all specialties', ru: 'БНС РК 2025 · все профили', kz: 'ҚР ҰСБ 2025 · барлық бейін' } },
  { key: 'nursing_staff', source: 'ashyq', kind: 'capacity', label: { ru: 'Средний медперсонал', kz: 'Орта медперсонал', en: 'Nursing staff' }, unit: '', digits: 0, origin: 'official', note: 'БНС РК 2025', notes: { en: 'BNS RK 2025', ru: 'БНС РК 2025', kz: 'ҚР ҰСБ 2025' } },
  { key: 'nmr', source: 'mics', kind: 'mortality', label: { ru: 'НС · MICS 2024 (бюллетень)', kz: 'НӨ · MICS 2024', en: 'NMR · MICS 2024 brief' }, unit: '‰', digits: 0, origin: 'official', note: 'MICS 2024 · 5 years before survey · suppressed regions blank', notes: { en: 'MICS 2024 · 5 years before the survey · suppressed regions left blank', ru: 'MICS 2024 · 5 лет до опроса · скрытые регионы не закрашены', kz: 'MICS 2024 · сауалнамаға дейінгі 5 жыл · жасырылған өңірлер боялмаған' } },
  { key: 'pregnancies', source: 'worldpop', kind: 'capacity', label: { ru: 'Беременности 2015 (WorldPop)', kz: 'Жүктілік 2015 (WorldPop)', en: 'Pregnancies 2015 (WorldPop)' }, unit: '', digits: 0, origin: 'official', note: 'WorldPop 1 km raster summed per region · DOI 10.5258/SOTON/WP00612', notes: { en: 'WorldPop 1 km raster summed per region · DOI 10.5258/SOTON/WP00612', ru: 'Растр WorldPop 1 км, суммирован по регионам · DOI 10.5258/SOTON/WP00612', kz: 'WorldPop 1 км растры өңірлер бойынша қосындыланған · DOI 10.5258/SOTON/WP00612' } },
];

/** Metric source note in the viewer's language. */
export const metricNote = (m, lang) => m?.notes?.[lang] || m?.note || '';

/** Locale for dates and numbers. */
export const LOCALE = { en: 'en-GB', ru: 'ru-RU', kz: 'kk-KZ' };
export const dateLocale = (lang) => LOCALE[lang] || 'ru-RU';

/** Hospital name: the API sends an English `name` and a Kazakh `name_kz`; Russian comes from the TEXT dictionary via tx(). */
export const hospitalName = (h, lang, tx) => (!h ? '' : lang === 'kz' ? (h.name_kz || h.name) : (tx ? tx(h.name) : h.name));

export const isCapacityMetric = (key) => METRICS.find((m) => m.key === key)?.kind === 'capacity';

/** Value of a metric for a region row from /api/analytics/regions (works for offline rows too). */
export function metricValue(region, key) {
  const off = region.official || offlineOverlay(region.id);
  if (key === 'nmr') return region.nmr ?? null;
  if (key === 'pregnancies') return off?.worldpop_pregnancies_2015 ?? null;
  return off?.ashyq?.[key] ?? null;
}

export function offlineOverlay(id) {
  const a = ASHYQ.regions[id];
  const m = OVERLAY.mics_micro[id];
  return {
    ashyq: a ? { ...a, year: 2025, source_id: 'ashyq' } : null,
    ashyq_trend: ASHYQ.trends[id] || [],
    mics_micro: m ? { ...m, source_id: 'mics_micro' } : null,
    worldpop_pregnancies_2015: OVERLAY.worldpop[id] ?? null,
  };
}

export function formatMetric(value, key, lang = 'ru') {
  if (value == null) return '—';
  const m = METRICS.find((x) => x.key === key);
  const n = Number(value).toLocaleString(lang === 'en' ? 'en-US' : 'ru-RU', { minimumFractionDigits: m?.digits ?? 0, maximumFractionDigits: m?.digits ?? 2 });
  return m?.unit ? `${n} ${m.unit}` : n;
}

/** Sequential palettes (5 steps) — warm for mortality, cool for capacity. */
export const MORTALITY_COLORS = ['#DCFCE7', '#A7F3D0', '#E8D28F', '#D9A05C', '#E5484D'];
export const CAPACITY_COLORS = ['#DDF5F4', '#C9D6EE', '#9DB3D9', '#2F80ED', '#0E9F9B'];

export function colorScale(values, key) {
  const vs = values.filter((v) => v != null);
  const min = Math.min(...vs), max = Math.max(...vs);
  const palette = isCapacityMetric(key) ? CAPACITY_COLORS : MORTALITY_COLORS;
  return { min, max, palette, color: (v) => { if (v == null) return '#D9E8EC'; const r = max === min ? 0.5 : (v - min) / (max - min); return palette[Math.min(4, Math.floor(r * 5))]; } };
}
