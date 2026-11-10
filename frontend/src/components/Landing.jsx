import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Stethoscope, BarChart3, HeartHandshake, History, ShieldCheck, Calculator, Map, Activity, Flag, Cpu, Building2, Database } from 'lucide-react';
import { useT, LangSwitch } from '../lib/i18n.jsx';
import { api } from '../services/api.js';
import KazakhstanChoropleth from './regional/KazakhstanChoropleth.jsx';
import Logo from './Logo.jsx';
import SoundToggle from './SoundToggle.jsx';
import { GlassCard, Metric, IncubatorHUD } from './SpatialCardHUD.jsx';
import { REGIONS as MOCK_RAW } from '../lib/mock.js';
import { offlineOverlay, centreName, dateLocale } from '../lib/official.js';
const MOCK_REGIONS = { ...MOCK_RAW, regions: MOCK_RAW.regions.map((r) => ({ ...r, official: offlineOverlay(r.id) })) };
import { OriginPill, useProvenance, trainedOnLabel } from './DataOrigin.jsx';

const L = (ru, en, kz) => ({ ru, en, kz: kz || ru });
const FEATURES = [
  { Icon: Activity, color: '#0E9F9B', title: L('Риск 24 ч + SHAP', '24h risk + SHAP', '24 сағ қауіп + SHAP'), body: L('XGBoost анализирует 31 клинический показатель. SHAP показывает вклад каждого фактора. Предусмотрены импорт PIC v1.1.0 и дообучение на местных данных; базовая выборка в репозитории — синтетическая.', 'XGBoost analyses 31 clinical features; SHAP explains their contributions. PIC v1.1.0 import and local retraining are supported; the bundled baseline is synthetic.', 'XGBoost 31 клиникалық белгіні талдайды, SHAP олардың әсерін түсіндіреді. PIC v1.1.0 импорттау және жергілікті деректермен қайта оқыту қарастырылған; репозиторийдегі базалық деректер синтетикалық.'), portal: 'neonatologist', tag: L('Врачи', 'Doctors', 'Дәрігерлер') },
  { Icon: Stethoscope, color: '#0E9F9B', title: L('Оценка при поступлении', 'Admission-time assessment', 'Қабылдау кезіндегі бағалау'), body: L('15 признаков матери и новорождённого → риск госпитальной летальности. Обучено на 1 105 обезличенных госпитализациях КазНМУ им. Асфендиярова, проверено на 2024–2025.', '15 maternal and birth features → in-hospital mortality risk. Trained on 1,105 de-identified KazNMU Asfendiyarov admissions, tested on 2024–2025.', 'Ана мен нәрестенің 15 белгісі → ауруханадағы өлім қаупі. С.Ж. Асфендияров атындағы ҚазҰМУ-дың иесіздендірілген 1 105 емдеуге жатқызу дерегінде оқытылып, 2024–2025 жылдарда тексерілген.'), portal: 'neonatologist', tag: L('Врачи', 'Doctors', 'Дәрігерлер') },
  { Icon: History, color: '#2F80ED', title: L('Машина времени', 'Time machine', 'Уақыт машинасы'), body: L('Повтор по часам: когда сработал сигнал, когда наступило ухудшение и сколько часов между ними.', 'Hour-by-hour replay: when the alert fired, when deterioration was observed, and the lead time between them.', 'Сағат сайынғы шолу: сигнал қашан іске қосылды, нашарлау қашан байқалды және олардың арасында қанша сағат өтті.'), portal: 'neonatologist', tag: L('Врачи', 'Doctors', 'Дәрігерлер') },
  { Icon: ShieldCheck, color: '#2F80ED', title: L('Обязательная подпись врача', 'Mandatory sign-off', 'Дәрігердің міндетті қолы'), body: L('Каждый прогноз получает решение и запись врача: окончательный выбор остаётся за человеком (ст. 17 Закона № 230-VIII).', 'Every prediction gets a doctor decision and note: the final choice stays with a person (Art. 17, Law No. 230-VIII).', 'Әрбір болжамға дәрігердің шешімі мен жазбасы тіркеледі: соңғы таңдау адамда қалады (№ 230-VIII Заңының 17-бабы).'), portal: 'neonatologist', tag: L('Врачи', 'Doctors', 'Дәрігерлер') },
  { Icon: Map, color: '#7C6CF6', title: L('Карта детского здоровья', 'Child-health map', 'Бала денсаулығы картасы'), body: L('20 регионов: БНС РК 2025 (младенческая и неонатальная смертность, койки, персонал), MICS 2024, WorldPop, маршруты переводов в центры III уровня.', '20 regions: БНС РК 2025 (infant & neonatal mortality, beds, staff), MICS 2024, WorldPop, transfer routes to Level III hubs.', '20 өңір: БНС РК 2025 (нәресте және неонаталдық өлім, төсектер, персонал), MICS 2024, WorldPop, III деңгейлі орталықтарға ауыстыру бағыттары.'), portal: 'analyst', tag: L('Аналитики', 'Analysts', 'Талдаушылар') },
  { Icon: Cpu, color: '#0E9F9B', title: L('Самообучающаяся модель', 'Self-retraining model', 'Өзін-өзі оқытатын модель'), body: L('Новые местные наборы и подписи врачей переобучают XGBoost в фоне, версионируют и подменяют модель без остановки.', 'New local datasets and clinician sign-offs retrain XGBoost in the background, version it, and hot-swap it live.', 'Жаңа жергілікті деректер мен дәрігерлердің қолдары XGBoost моделін фондық режимде қайта оқытады, нұсқасын сақтайды және жұмысты тоқтатпай ауыстырады.'), portal: 'analyst', tag: L('Аналитики', 'Analysts', 'Талдаушылар') },
  { Icon: HeartHandshake, color: '#F59E0B', title: L('Мамы и семьи', 'Mothers & families', 'Аналар мен отбасылар'), body: L('Карта беременности из 18 полей с понятным скринингом риска и спокойный дневник после рождения.', 'An 18-field pregnancy record with a plain-language risk screen, and a calm daily log after birth.', '18 өрістен тұратын жүктілік картасы, түсінікті қауіп скринингі және босанғаннан кейінгі тыныш күнделік.'), portal: 'mother', tag: L('Мамы', 'Mothers', 'Аналар') },
  { Icon: BarChart3, color: '#16A34A', title: L('Экономика в тенге', 'Economics in tenge', 'Теңгедегі экономика'), body: L('Калькулятор койко-дней ОРИТН и переводов по тарифам ОСМС, журнал аудита и карточка модели с источниками.', 'NICU bed-day and transfer calculator at OSMS tariffs, audit log and a model card with sources.', 'ЖРИТБ төсек-күндері мен ауыстыруларды МӘМС тарифтері бойынша есептейтін калькулятор, аудит журналы және дереккөздері көрсетілген модель картасы.'), portal: 'analyst', tag: L('Аналитики', 'Analysts', 'Талдаушылар') },
];

const STEPS = [
  { Icon: Stethoscope, portal: 'neonatologist', n: L('Шаг 1', 'Step 1', '1-қадам'), title: L('Врач', 'Doctor', 'Дәрігер'), body: L('Приём, риск 24 ч с объяснением, оценка при поступлении, подпись врача.', 'Intake, 24 h risk with explanations, admission-time score, sign-off.', 'Қабылдау, 24 сағ қауіп, қабылдаудағы баға, дәрігер қолы.') },
  { Icon: BarChart3, portal: 'analyst', n: L('Шаг 2', 'Step 2', '2-қадам'), title: L('Аналитик', 'Analyst', 'Талдаушы'), body: L('Карта регионов, аудит, качество модели, экономика в тенге.', 'Regional map, audit log, model quality, economics in tenge.', 'Өңірлер картасы, аудит, модель сапасы, экономика.') },
  { Icon: HeartHandshake, portal: 'mother', n: L('Шаг 3', 'Step 3', '3-қадам'), title: L('Мама', 'Mother', 'Ана'), body: L('Карта беременности, понятный скрининг риска, дневник малыша.', 'Pregnancy record, plain-language risk screen, baby diary.', 'Жүктілік картасы, түсінікті скрининг, сәби күнделігі.') },
  { Icon: Building2, portal: 'admin', n: L('Шаг 4', 'Step 4', '4-қадам'), title: L('Администратор больницы', 'Hospital administrator', 'Аурухана әкімшісі'), body: L('Готовность больницы к пилоту, интеграция МИС, аудит и управление моделями.', 'Hospital pilot readiness, EHR integration, audit and model operations.', 'Аурухананың пилотқа дайындығы, МАЖ интеграциясы, аудит және модельдерді басқару.') },
];
const HERO = {
  title: L('Раннее предупреждение для каждого новорождённого в реанимации.', 'Early warning for every newborn in intensive care.', 'Реанимациядағы әр нәресте үшін ерте ескерту.'),
  sub: L('NeoOutcome AI показывает риск ухудшения за 24 часа, объясняет его и оставляет решение за врачом. Кабинеты для врачей, аналитиков, мам и администраторов больниц.', 'NeoOutcome AI shows the 24-hour deterioration risk, explains it and leaves the decision with the doctor. Portals for doctors, analysts, mothers and hospital administrators.', 'NeoOutcome AI 24 сағаттық нашарлау қаупін көрсетіп, түсіндіреді, шешімді дәрігерге қалдырады. Дәрігерлерге, талдаушыларға, аналарға және аурухана әкімшілеріне арналған кабинеттер.'),
  how: L('Как это работает', 'How it works', 'Қалай жұмыс істейді'),
  map: L('20 регионов на одной карте', '20 regions on one map', 'Бір картадағы 20 өңір'),
  mapSub: L('Перинатальные центры по уровням, маршруты переводов и регионы роста смертности. Наведите на центр.', 'Perinatal centres by level, transfer routes and growth regions. Hover a centre.', 'Деңгей бойынша перинаталдық орталықтар, ауыстыру бағыттары. Орталыққа меңзеңіз.'),
  features: L('Что внутри', 'What is inside', 'Ішінде не бар'),
  featuresSub: L('Врачи решают. Аналитики видят всю страну. Мамы понимают.', 'Doctors decide. Analysts see the whole country. Mothers understand.', 'Дәрігерлер шешеді. Талдаушылар бүкіл елді көреді. Аналар түсінеді.'),
  telemetry: L('Телеметрия у кувеза', 'Bedside telemetry', 'Кувез жанындағы телеметрия'),
};
const MAP = {
  rasterNote: L('Беременности на км² (растр WorldPop) · границы © OpenStreetMap', 'Pregnancies per km² (WorldPop raster) · boundaries © OpenStreetMap', 'Шаршы шақырымдағы жүктілік (WorldPop растры) · шекаралар © OpenStreetMap'),
  features: L('признак', 'features', 'белгі'),
  neonatal: L('Неонатальная смертность', 'Neonatal mortality', 'Неонаталдық өлім'), infant: L('Младенческая смертность', 'Infant mortality', 'Нәресте өлімі'),
  beds: L('Койки', 'Hospital beds', 'Төсектер'), pregnancies2015: L('Беременности 2015', 'Pregnancies 2015', 'Жүктілік 2015'),
  region: L('Регион', 'Region', 'Өңір'), neonatalShort: L('Неонат. ‰', 'Neonatal ‰', 'Неонат. ‰'), infantShort: L('Млад. ‰', 'Infant ‰', 'Нәресте ‰'),
  suppressed: L('скрыто', 'suppressed', 'жасырылған'), pregnancies: L('Беременности', 'Pregnancies', 'Жүктілік'),
  transfers: L('Переводы в', 'Transfers to', 'Ауыстыру бағыты'), hub: L('центр III уровня', 'Level III hub', 'III деңгейлі орталық'),
  frames: L('Кадры синтезируются: видеоконвейер ожидает клинической валидации и показан как следующий этап.', 'Frames are synthesised: the camera pipeline is pending clinical validation and is shown as a next stage.', 'Кадрлар синтезделеді: бейне конвейері клиникалық валидацияны күтуде және келесі кезең ретінде көрсетілген.'),
  pilot: L('Пилотная программа', 'Pilot programme', 'Пилоттық бағдарлама'),
  pilotBody: L('Теневой режим с I квартала 2027. Данные остаются в периметре больницы; каждое чтение ПДн — в аудите.', 'Shadow-mode go-live Q1 2027. On-premise data residency; every PHI read audited.', 'Көлеңкелі режим 2027 жылдың I тоқсанынан басталады. Деректер аурухана ішінде қалады; дербес деректердің әрбір оқылуы аудитте тіркеледі.'),
};

export default function Landing({ onLaunch }) {
  const { t, lang } = useT();
  const [selectedPortal, setSelectedPortal] = useState('neonatologist');
  const openPortal = (role) => { setSelectedPortal(role); onLaunch(role); };
  const [regions, setRegions] = useState(MOCK_REGIONS);
  const [hovered, setHovered] = useState(null); const [sel, setSel] = useState('astana'); const [metric, setMetric] = useState('neonatal_mortality');
  const prov = useProvenance();
  useEffect(() => { api.regions().then(setRegions).catch(() => {}); }, []);
  const byId = useMemo(() => Object.fromEntries(regions.regions.map((r) => [r.id, r])), [regions]);
  const focus = byId[sel] || byId[hovered] || byId.astana;
  const name = (r) => r?.[lang] || r?.en;
  const T = (o) => o[lang] || o.ru;

  return (
    <div className="stellar min-h-full">
      <header className="sticky top-0 z-20 px-4 md:px-8 py-3 flex flex-wrap sm:flex-nowrap items-center gap-3" style={{ background: 'rgba(246,244,239,.86)', backdropFilter: 'blur(10px)', borderBottom: '1px solid #D9E8EC' }}>
        <Logo size={36} />
        <nav className="hidden xl:flex gap-1 ml-6 text-sm">{[['#how', T(HERO.how)], ['#map', T(HERO.map)], ['#features', T(HERO.features)], ['/api/docs', 'API']].map(([h, n]) => <a key={n} href={h} className="hud-link">{n}</a>)}</nav>
        <div className="ml-auto w-full sm:w-auto flex items-center justify-end gap-2"><LangSwitch /><SoundToggle /><button type="button" className="hud-cta py-2.5 px-4 text-sm" onClick={() => onLaunch()}>{t('auth.enter')} <ArrowRight size={16} /></button></div>
      </header>

      {/* ---- Hero ---- */}
      <section className="px-4 md:px-8 pt-12 md:pt-20 pb-10 max-w-6xl mx-auto grid lg:grid-cols-[1.05fr_1fr] gap-10 items-center">
        <div>
          <h1 className="text-[36px] md:text-[48px] leading-[1.12] max-w-[15em]">{T(HERO.title)}</h1>
          <p className="mt-5 text-[17px] max-w-xl" style={{ color: '#52708A' }}>{T(HERO.sub)}</p>
          <div id="portals" className="hero-portals mt-7 grid sm:grid-cols-2 gap-3">
            {[[ 'neonatologist', Stethoscope ], [ 'analyst', BarChart3 ], [ 'mother', HeartHandshake ], [ 'admin', Building2 ]].map(([role, Icon]) => (
              <button key={role} type="button" aria-pressed={selectedPortal === role} className={`hud-portal ${selectedPortal === role ? 'is-selected' : ''}`} onClick={() => openPortal(role)}><Icon size={18} />{t(`role.${role}`)}</button>
            ))}
          </div>
          <div className="mt-6 flex flex-wrap gap-1.5">
            <OriginPill kind={!prov ? 'model' : prov.tabular?.baseline?.is_synthetic ? 'synthetic' : 'real'}>{t('unit.h24')} · {trainedOnLabel(prov?.tabular?.trained_on, t) || T(L('источник модели уточняется', 'model source pending', 'модель дереккөзі нақтылануда'))}</OriginPill>
            <OriginPill kind="real">{t('src.asf')} · 1 105 · 2021–2025</OriginPill>
            <OriginPill kind="official">{t('src.bns')} 2025 · MICS 2024 · UN IGME</OriginPill>
            <OriginPill kind="simulated">{t('land.cvSim')}</OriginPill>
          </div>
        </div>
        <div className="card p-3 md:p-4">
          <div className="flex items-center justify-between gap-2 px-1 pb-2"><div className="hud-label">{t('land.whereBorn')}</div><OriginPill kind="official">WorldPop 2015 · 1 km</OriginPill></div>
          <KazakhstanChoropleth regions={regions.regions} metric={metric} selected={sel} onSelect={setSel} raster compact height="min-h-[300px]" />
          <div className="flex flex-wrap items-center justify-between gap-2 px-1 pt-2 text-xs muted"><span>{T(MAP.rasterNote)}</span><span className="font-semibold text-fg">{name(focus)}: {focus.official?.ashyq?.neonatal_mortality ?? '—'} ‰ · {t('src.bns')} 2025</span></div>
          <div className="mt-4 border-t border-line pt-4 px-1">
            <div className="hud-label flex items-center gap-2"><Database size={14} />{T(L('Данные, на которых строится проект', 'Data behind the project', 'Жобаның дереккөздері'))}</div>
            <dl className="mt-3 grid gap-3 text-sm">
              {[
                ['PIC v1.1.0', L('Предусмотрен импорт педиатрических данных ОРИТ. В репозитории — синтетическая базовая выборка: 804 записи.', 'Paediatric ICU cohort import is supported. The repository includes a synthetic baseline of 804 records.', 'Балалар реанимациясының деректерін импорттау қарастырылған. Репозиторийде 804 жазбадан тұратын синтетикалық базалық деректер бар.')],
                [T(L('КазНМУ им. Асфендиярова', 'Asfendiyarov KazNMU', 'С. Асфендияров атындағы ҚазҰМУ')), L('1 105 обезличенных госпитализаций, 2021–2025 — для модели оценки при поступлении.', '1,105 de-identified admissions, 2021–2025, for the admission-time model.', 'Қабылдау кезіндегі модель үшін 2021–2025 жылдардағы 1 105 иесіздендірілген госпитализация.')],
                ['MICS 2024 · WorldPop 2015 · UN IGME · БНС РК', L('Региональная аналитика, демография и карта беременностей. Для каждого набора указан источник и статус данных.', 'Regional analytics, demographics and pregnancy mapping. Each dataset has a source and data status.', 'Өңірлік талдау, демография және жүктілік картасы. Әрбір жиынтықтың дереккөзі мен мәртебесі көрсетілген.')],
              ].map(([name, description]) => <div key={name}><dt className="font-semibold">{name}</dt><dd className="muted mt-1 leading-relaxed">{T(description)}</dd></div>)}
            </dl>
          </div>
        </div>
      </section>

      {/* ---- Three steps (portals) ---- */}
      <section id="how" className="px-4 md:px-8 pb-14 max-w-6xl mx-auto">
        <div className="portal-steps grid md:grid-cols-2 xl:grid-cols-4 gap-6">
          {STEPS.map((s, i) => (
            <button type="button" key={s.portal} className="glass-dark step-card p-6 text-left hud-feature" onClick={() => onLaunch(s.portal)}>
              <div className="step-heading"><div className="ico"><s.Icon size={26} /></div><span className="step-number" aria-hidden="true">0{i + 1}</span></div>
              <div><div className="hud-label">{T(s.n)}</div><div className="display text-[22px] mt-1">{T(s.title)}</div></div>
              <p className="text-sm step-description">{T(s.body)}</p>
              {i < STEPS.length - 1 && <span className="arrow" aria-hidden="true"><ArrowRight size={16} /></span>}
            </button>
          ))}
        </div>
      </section>

      {/* ---- Regional constellation ---- */}
      <section id="map" className="px-4 md:px-8 pb-14 max-w-6xl mx-auto">
        <div className="glass-dark p-5 md:p-7">
          <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
            <div><h2 className="text-[26px]">{T(HERO.map)}</h2><p className="mt-1 text-sm" style={{ color: '#52708A' }}>{T(HERO.mapSub)}</p></div>
            <div className="flex gap-3 text-sm">{[[prov?.tabular?.metrics?.auroc ? prov.tabular.metrics.auroc.toFixed(2) : '—', 'AUROC'], ['31', T(MAP.features)], ['3.94‰', t('land.nmr2024')]].map(([v, l]) => <div key={l} className="text-right"><div className="hud-num text-2xl">{v}</div><div className="hud-sub">{l}</div></div>)}</div>
          </div>
          <div className="grid lg:grid-cols-[1fr_300px] gap-4">
            <div>
              <div className="flex flex-wrap gap-2 mb-3">{[['neonatal_mortality', T(MAP.neonatal)], ['infant_mortality', T(MAP.infant)], ['hospital_beds', T(MAP.beds)], ['pregnancies', T(MAP.pregnancies2015)]].map(([k, l]) => <button key={k} type="button" className={`btn py-1.5 ${metric === k ? 'btn-primary' : ''}`} onClick={() => setMetric(k)}>{l}</button>)}</div>
              <KazakhstanChoropleth regions={regions.regions} metric={metric} selected={sel} onSelect={setSel} height="min-h-[420px]" />
            </div>
            <div className="card p-5 self-start">
              <div className="hud-label">{T(MAP.region)}</div>
              <div className="display text-[22px] mt-1">{name(focus)}</div>
              <div className="muted text-sm">{centreName(focus.centre, lang)} · {t('an.level')} {['', 'I', 'II', 'III'][focus.level]}{focus.growth ? ` · ${t('an.growth')}` : ''}</div>
              <div className="grid grid-cols-2 gap-3 mt-4">
                <Metric label={T(MAP.neonatalShort)} value={focus.official?.ashyq?.neonatal_mortality ?? '—'} unit="" color="#E5484D" sub={T(L('источник уточняется', 'source being verified', 'дереккөз нақтылануда'))} />
                <Metric label={T(MAP.infantShort)} value={focus.official?.ashyq?.infant_mortality ?? '—'} unit="" color="#0B2239" sub={`${t('src.bns')} 2025`} />
                <Metric label={t('land.nmrMics')} value={focus.nmr ?? '—'} unit={focus.nmr != null ? '‰' : ''} color="#0E9F9B" sub={focus.nmr == null ? T(MAP.suppressed) : 'MICS 2024'} />
                <Metric label={T(MAP.pregnancies)} value={focus.official?.worldpop_pregnancies_2015?.toLocaleString(dateLocale(lang)) ?? '—'} unit="" color="#16A34A" sub="WorldPop 2015" />
              </div>
              <div className="muted text-xs mt-4">{T(MAP.transfers)}: <span className="font-semibold text-fg">{regions.transfer_routes.filter(([a]) => a === focus.id).map(([, b]) => centreName(byId[b]?.centre, lang)).join(', ') || T(MAP.hub)}</span></div>
            </div>
          </div>
        </div>
      </section>

      {/* ---- Bedside telemetry (simulated) ---- */}
      <section className="px-4 md:px-8 pb-14 max-w-6xl mx-auto grid lg:grid-cols-[1.2fr_1fr] gap-5 items-start">
        <IncubatorHUD risk={31} />
        <div className="grid gap-4">
          <GlassCard className="p-5" tilt={0}><div className="flex items-center justify-between gap-2"><div className="hud-label">{T(HERO.telemetry)} · {t('home.bed')} 07</div><OriginPill kind="simulated">{t('origin.simulated')}</OriginPill></div><div className="grid grid-cols-3 gap-4 mt-3"><Metric label="NFCS" value="2" unit="/8" /><Metric label={t('land.skinT')} value="36.4" unit="°C" /><Metric label="S/F" value="269" unit="" /></div><p className="hud-sub mt-3">{T(MAP.frames)}</p></GlassCard>
          <GlassCard className="p-5" tilt={0}><div className="hud-label">{T(MAP.pilot)}</div><div className="display text-lg mt-1">{t('land.pilotSites')}</div><div className="hud-sub mt-1">{T(MAP.pilotBody)}</div></GlassCard>
        </div>
      </section>

      {/* ---- Feature grid ---- */}
      <section id="features" className="px-4 md:px-8 pb-20 max-w-6xl mx-auto">
        <div className="hud-label mb-2">{T(HERO.features)}</div>
        <h2 className="text-[28px] md:text-[34px] max-w-2xl">{T(HERO.featuresSub)}</h2>
        <div className="feature-grid mt-8 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {FEATURES.map((f) => (
            <button type="button" key={f.title.en} className="glass-dark feature-card p-5 text-left hud-feature" onClick={() => onLaunch(f.portal)}>
              <div className="flex items-center justify-between"><div className="w-10 h-10 rounded-xl grid place-items-center" style={{ background: '#DDF5F4', color: '#0B2239' }}><f.Icon size={18} /></div><span className="hud-pill">{f.tag[lang] || f.tag.en}</span></div>
              <div className="display feature-title text-[19px]">{f.title[lang] || f.title.en}</div>
              <p className="text-sm feature-description" style={{ color: '#52708A' }}>{f.body[lang] || f.body.ru}</p>
            </button>
          ))}
        </div>
      </section>

      <footer className="px-4 md:px-8 py-6 border-t border-line flex flex-wrap items-center gap-4 text-xs muted max-w-6xl mx-auto">
        <span className="font-semibold text-fg">NeoOutcome AI</span><span>{t('disclaimer')}</span><span className="ml-auto">{t('land.version')}</span>
      </footer>
    </div>
  );
}
