/* common area strings. STR: key -> { en, ru, kz }. TEXT: exact English text coming from the server or seed data -> { ru, kz }. */
export const STR = {
  // shared sources and units
  'src.bns': { en: 'BNS RK', ru: 'БНС РК', kz: 'ҚР ҰСБ' },
  'unit.g': { en: 'g', ru: 'г', kz: 'г' },
  'unit.wk': { en: 'wk', ru: 'нед.', kz: 'апта' },
  'unit.h24': { en: '24 h', ru: '24 ч', kz: '24 сағ' },
  'origin.simulated': { en: 'simulated', ru: 'симуляция', kz: 'симуляция' },

  // landing
  'land.whereBorn': { en: 'Where babies are born', ru: 'Где рождаются дети', kz: 'Нәрестелер қайда туады' },
  'land.cvSim': { en: 'CV · simulated', ru: 'Компьютерное зрение · симуляция', kz: 'Компьютерлік көру · симуляция' },
  'land.nmr2024': { en: 'NMR 2024', ru: 'НС 2024', kz: 'НӨ 2024' },
  'land.nmrMics': { en: 'NMR · MICS', ru: 'НС · MICS', kz: 'НӨ · MICS' },
  'land.skinT': { en: 'Skin T', ru: 'T кожи', kz: 'Тері T' },
  'land.pilotSites': { en: 'Astana NRC · Almaty PC1 · Shymkent RPC · Karaganda RPC', ru: 'ННЦ Астана · ПЦ №1 Алматы · РПЦ Шымкент · РПЦ Караганда', kz: 'Астана ҰҒО · Алматы №1 ПО · Шымкент ӨПО · Қарағанды ӨПО' },
  'land.version': { en: 'v2.1 · KZ pilot', ru: 'v2.1 · пилот в РК', kz: 'v2.1 · ҚР пилоты' },

  // auth modal
  'auth.his': { en: 'HIS', ru: 'МИС', kz: 'МАЖ' },

  // shell
  'shell.menu': { en: 'Menu', ru: 'Меню', kz: 'Мәзір' },
  'shell.sections': { en: 'Sections', ru: 'Разделы', kz: 'Бөлімдер' },

  // provenance pills and data flow
  'origin.modelLoading': { en: 'model · loading', ru: 'модель · загрузка', kz: 'модель · жүктелуде' },
  'origin.activeModel': { en: 'Active model {v}', ru: 'Активная модель {v}', kz: 'Белсенді модель {v}' },
  'origin.trainedOn': { en: 'trained on {src}', ru: 'обучена на {src}', kz: 'оқытылған деректер: {src}' },
  'origin.trainedSynthetic': { en: 'trained on {n} PICDB-shaped synthetic admissions', ru: 'обучена на {n} синтетических госпитализациях в формате PICDB', kz: 'PICDB пішініндегі {n} синтетикалық емдеуге жатқызу дерегінде оқытылған' },
  'origin.localDatasets': { en: '+ local datasets: {n}', ru: '+ местные наборы: {n}', kz: '+ жергілікті деректер жиыны: {n}' },
  'origin.neonates': { en: '{src} ({n} neonates, NICU)', ru: '{src} ({n} новорождённых, ОРИТН)', kz: '{src} ({n} нәресте, ЖРИТБ)' },
  'origin.synthBaseline': { en: 'PICDB-shaped synthetic baseline ({n} admissions)', ru: 'синтетическая базовая выборка в формате PICDB ({n} госпитализаций)', kz: 'PICDB пішініндегі синтетикалық базалық іріктеме ({n} емдеуге жатқызу)' },
  'flow.export': { en: 'Damumed / CSV export', ru: 'Выгрузка Damumed / CSV', kz: 'Damumed / CSV экспорты' },
  'flow.export.sub': { en: 'Russian column headers', ru: 'заголовки столбцов на русском', kz: 'баған атаулары орыс тілінде' },
  'flow.mapper': { en: 'Schema mapper', ru: 'Сопоставление схемы', kz: 'Схеманы сәйкестендіру' },
  'flow.mapper.sub': { en: '→ 31 core EHR features', ru: '→ 31 базовый признак МИС', kz: '→ МАЖ-тың 31 негізгі белгісі' },
  'flow.baseline': { en: 'Baseline + local data', ru: 'Базовая модель + местные данные', kz: 'Базалық модель + жергілікті деректер' },
  'flow.local': { en: 'Local cohort', ru: 'Местная когорта', kz: 'Жергілікті когорта' },
  'flow.baseline.sub': { en: 'PICDB-shaped baseline', ru: 'базовая выборка в формате PICDB', kz: 'PICDB пішініндегі базалық іріктеме' },
  'flow.model.sub': { en: 'calibrated 24h risk', ru: 'калиброванный риск за 24 ч', kz: 'калибрленген 24 сағаттық қауіп' },
  'flow.shap': { en: 'SHAP waterfall', ru: 'Водопад SHAP', kz: 'SHAP сарқырамасы' },
  'flow.shap.sub': { en: 'feature attribution', ru: 'вклад признаков', kz: 'белгілердің үлесі' },
  'flow.signoff': { en: 'Doctor sign-off', ru: 'Подпись врача', kz: 'Дәрігердің қолы' },
  'flow.signoff.sub': { en: 'human-in-the-loop', ru: 'решение за человеком', kz: 'шешім адамда' },
  'flow.retrain': { en: 'Retrain', ru: 'Переобучение', kz: 'Қайта оқыту' },
  'flow.retrain.sub': { en: 'feedback + new datasets', ru: 'отзывы врачей + новые наборы', kz: 'кері байланыс + жаңа деректер' },

  // mother portal
  'mom.fields': { en: '{n} fields', ru: '{n} полей', kz: '{n} өріс' },
  'mom.vaginal': { en: 'Vaginal', ru: 'Естественные', kz: 'Табиғи босану' },
  'mom.cesarean': { en: 'Caesarean', ru: 'Кесарево сечение', kz: 'Кесар тілігі' },
  'mom.atBirth': { en: 'at birth', ru: 'при рождении', kz: 'туғанда' },

  // regional analytics
  'reg.growthTag': { en: 'growth', ru: 'рост', kz: 'өсу' },
  'reg.kzShort': { en: 'Kazakhstan', ru: 'РК', kz: 'ҚР' },
  'reg.micsBrief': { en: 'MICS 2024 (brief)', ru: 'MICS 2024 (бюллетень)', kz: 'MICS 2024 (бюллетень)' },
  'reg.micsMicro': { en: 'MICS microdata · n={n}', ru: 'Микроданные MICS · n={n}', kz: 'MICS микродеректері · n={n}' },
  'reg.osm': { en: '© OpenStreetMap contributors (ODbL)', ru: '© участники OpenStreetMap (ODbL)', kz: '© OpenStreetMap қатысушылары (ODbL)' },
  'reg.perKm2': { en: 'per km²', ru: 'на км²', kz: 'км²-ге' },
  'reg.fc.imr': { en: 'IMR', ru: 'Младенч. смертность', kz: 'Нәресте өлімі' },
  'reg.fc.failed': { en: 'Request failed', ru: 'Не удалось загрузить данные', kz: 'Деректерді жүктеу мүмкін болмады' },
};

export const TEXT = {
  // hospitals (the API sends English names plus name_kz)
  'National Research Center for Maternal and Child Health': { ru: 'Национальный научный центр материнства и детства', kz: 'Ана мен бала денсаулығын сақтау ұлттық ғылыми орталығы' },
  'Almaty Perinatal Center #1': { ru: 'Перинатальный центр №1 г. Алматы', kz: 'Алматы перинаталдық орталығы №1' },
  'Shymkent Regional Perinatal Center': { ru: 'Шымкентский региональный перинатальный центр', kz: 'Шымкент өңірлік перинаталдық орталығы' },
  'Karaganda Regional Perinatal Center': { ru: 'Карагандинский региональный перинатальный центр', kz: 'Қарағанды облыстық перинаталдық орталығы' },

  // baby log seed (backend/services/seed.py and lib/mock.js)
  'Admitted to NICU, surfactant given': { ru: 'Поступил в ОРИТН, введён сурфактант', kz: 'ЖРИТБ-ға түсті, сурфактант енгізілді' },
  'Extubated to CPAP': { ru: 'Экстубирован, переведён на CPAP', kz: 'Экстубацияланып, CPAP-қа ауыстырылды' },
  'First skin-to-skin contact': { ru: 'Первый контакт кожа к коже', kz: 'Тері мен терінің алғашқы жанасуы' },
  'Your baby is breathing with help from a ventilator. The team gave surfactant to help the lungs open.': { ru: 'Малыш дышит с помощью аппарата ИВЛ. Команда ввела сурфактант, чтобы помочь лёгким раскрыться.', kz: 'Сәбиіңіз ЖВЛ аппаратының көмегімен тыныс алуда. Өкпесі ашылуы үшін команда сурфактант енгізді.' },
  'Small feeds through a tube started. Weight loss in the first days is expected.': { ru: 'Начали кормить небольшими порциями через зонд. Потеря веса в первые дни — это нормально.', kz: 'Зонд арқылы аз мөлшерде тамақтандыру басталды. Алғашқы күндері салмақтың азаюы қалыпты жағдай.' },
  'Off the ventilator today — breathing with gentle pressure support.': { ru: 'Сегодня отключили от аппарата ИВЛ — дышит с мягкой поддержкой давлением.', kz: 'Бүгін ЖВЛ аппаратынан ажыратылды — жұмсақ қысыммен қолдау арқылы тыныс алады.' },
  'Kangaroo care for 40 minutes. Weight is climbing again.': { ru: '40 минут кенгуру-ухода. Вес снова растёт.', kz: '40 минут кенгуру күтімі. Салмақ қайтадан қосылып келеді.' },

  // regional forecast bundle (backend/data/regional_bundle.json)
  'next-year infant mortality rate per oblast (per 1,000 live births)': { ru: 'младенческая смертность на следующий год по областям (на 1 000 живорождённых)', kz: 'облыстар бойынша келесі жылғы нәресте өлімі (1 000 тірі туғанға шаққанда)' },
  'stat.gov.kz publishes infant (<1 year) mortality by oblast; neonatal (<28 days) mortality is not published at oblast level.': { ru: 'stat.gov.kz публикует младенческую (<1 года) смертность по областям; неонатальная (<28 дней) смертность на уровне областей не публикуется.', kz: 'stat.gov.kz облыстар бойынша нәресте (<1 жас) өлімін жариялайды; неонаталдық (<28 күн) өлім облыс деңгейінде жарияланбайды.' },
  '2025 figures may be preliminary; the latest year was the hardest backtest year for the model.': { ru: 'Данные за 2025 год могут быть предварительными; последний год оказался самым трудным в бэктесте модели.', kz: '2025 жылғы деректер алдын ала болуы мүмкін; соңғы жыл модельдің бэктестіндегі ең қиын жыл болды.' },
  'Year-to-year oblast IMR is dominated by random variation in small oblasts (about +/-1 per 1,000).': { ru: 'Колебания младенческой смертности от года к году в небольших областях в основном случайны (около ±1 на 1 000).', kz: 'Шағын облыстарда нәресте өлімінің жылдан жылға өзгеруі негізінен кездейсоқ (шамамен 1 000-ға ±1).' },
  'Hospital beds and doctors are all-specialty totals, not NICU beds or neonatologists.': { ru: 'Койки и врачи — суммарно по всем профилям, а не койки ОРИТН и неонатологи.', kz: 'Төсектер мен дәрігерлер — барлық бейін бойынша жиынтық, ЖРИТБ төсектері мен неонатологтар емес.' },
  'Bureau of National Statistics (ASPIR)': { ru: 'Бюро национальной статистики (АСПР)', kz: 'Ұлттық статистика бюросы (СЖРА)' },
  'WorldPop pregnancies (via HDX)': { ru: 'Беременности WorldPop (через HDX)', kz: 'WorldPop жүктілік деректері (HDX арқылы)' },
  'UNICEF MICS 2015 (World Bank Microdata)': { ru: 'UNICEF MICS 2015 (микроданные Всемирного банка)', kz: 'UNICEF MICS 2015 (Дүниежүзілік банк микродеректері)' },
  'IHME Global Burden of Disease': { ru: 'IHME: Глобальное бремя болезней', kz: 'IHME: Аурулардың жаһандық ауыртпалығы' },

  // dataset catalogue names (regions payload, backend/services/official_data.py)
  'Регионы 2025 · из первой версии проекта': { en: 'Regions 2025 · from the first project version', ru: 'Регионы 2025 · из первой версии проекта', kz: 'Өңірлер 2025 · жобаның алғашқы нұсқасынан' },
  'MICS Kazakhstan 2024 · microdata (bh.sav)': { ru: 'MICS Казахстан 2024 · микроданные (bh.sav)', kz: 'MICS Қазақстан 2024 · микродеректер (bh.sav)' },
  'WorldPop · pregnancies 2015 (1 km)': { ru: 'WorldPop · беременности 2015 (1 км)', kz: 'WorldPop · жүктілік 2015 (1 км)' },
  'IHME GBD 2023 · neonatal preterm birth (Global)': { ru: 'IHME GBD 2023 · недоношенность новорождённых (мир)', kz: 'IHME GBD 2023 · нәрестелердің шала туылуы (әлем)' },
  'Open Data Watch · ODIN 2015 Kazakhstan': { ru: 'Open Data Watch · ODIN 2015 Казахстан', kz: 'Open Data Watch · ODIN 2015 Қазақстан' },
  'БНС АСПР РК · Естественное движение населения, 2023': { en: 'BNS ASPIR RK · Natural population movement, 2023', ru: 'БНС АСПР РК · Естественное движение населения, 2023', kz: 'ҚР СЖРА ҰСБ · Халықтың табиғи қозғалысы, 2023' },
  'БНС АСПР РК · infant mortality by region, 2008– + forecast': { en: 'BNS ASPIR RK · infant mortality by region, 2008– + forecast', ru: 'БНС АСПР РК · младенческая смертность по регионам, 2008– + прогноз', kz: 'ҚР СЖРА ҰСБ · өңірлер бойынша нәресте өлімі, 2008– + болжам' },
  'KazNMU n.a. S.D. Asfendiyarov · de-identified NICU extract': { ru: 'КазНМУ им. С.Д. Асфендиярова · обезличенная выгрузка ОРИТН', kz: 'С.Ж. Асфендияров атындағы ҚазҰМУ · иесіздендірілген ЖРИТБ үзіндісі' },
};
