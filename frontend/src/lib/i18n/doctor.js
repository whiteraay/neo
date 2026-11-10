/* doctor area strings. STR: key -> { en, ru, kz }. TEXT: exact text coming from the server or seed data -> translations.
 * TEXT keys are usually English (-> { ru, kz }); Russian-only server text (intake card, admission model) is keyed by the Russian text (-> { en, kz }). */

const tri = (rows) => Object.fromEntries(Object.entries(rows).map(([k, [en, ru, kz]]) => [k, { en, ru, kz }]));

/* full feature labels of the 24 h model (backend ml_engine.LABELS keys) */
const FEAT = tri({
  'feat.gestational_age_wk': ['Gestational age (wk)', 'Срок гестации (нед)', 'Гестациялық жас (апта)'],
  'feat.birth_weight_g': ['Birth weight (g)', 'Масса при рождении (г)', 'Туған кездегі салмақ (г)'],
  'feat.apgar_1': ['APGAR 1 min', 'Апгар, 1 мин', 'Апгар, 1 мин'],
  'feat.apgar_5': ['APGAR 5 min', 'Апгар, 5 мин', 'Апгар, 5 мин'],
  'feat.age_hours': ['Postnatal age (h)', 'Постнатальный возраст (ч)', 'Постнаталдық жас (сағ)'],
  'feat.heart_rate': ['Heart rate (bpm)', 'ЧСС (уд/мин)', 'ЖСЖ (соқ/мин)'],
  'feat.resp_rate': ['Respiratory rate', 'Частота дыхания', 'Тыныс алу жиілігі'],
  'feat.spo2': ['SpO2 (%)', 'SpO2 (%)', 'SpO2 (%)'],
  'feat.fio2': ['FiO2 (%)', 'FiO2 (%)', 'FiO2 (%)'],
  'feat.sf_ratio': ['SpO2/FiO2 ratio', 'Отношение SpO2/FiO2', 'SpO2/FiO2 қатынасы'],
  'feat.map_mmhg': ['Mean arterial pressure', 'Среднее АД', 'Орташа артериялық қысым'],
  'feat.temperature': ['Temperature (°C)', 'Температура (°C)', 'Дене қызуы (°C)'],
  'feat.ph': ['pH', 'pH', 'pH'], 'feat.pco2': ['pCO2', 'pCO2', 'pCO2'], 'feat.po2': ['pO2', 'pO2', 'pO2'], 'feat.hco3': ['HCO3', 'HCO3', 'HCO3'],
  'feat.base_excess': ['Base excess (mmol/L)', 'Избыток оснований, BE (ммоль/л)', 'Негіздер артықшылығы, BE (ммоль/л)'],
  'feat.lactate': ['Lactate (mmol/L)', 'Лактат (ммоль/л)', 'Лактат (ммоль/л)'],
  'feat.glucose': ['Glucose', 'Глюкоза', 'Глюкоза'],
  'feat.hemoglobin': ['Haemoglobin', 'Гемоглобин', 'Гемоглобин'],
  'feat.wbc': ['WBC', 'Лейкоциты', 'Лейкоциттер'],
  'feat.platelets': ['Platelets', 'Тромбоциты', 'Тромбоциттер'],
  'feat.crp': ['CRP', 'СРБ', 'СРБ'],
  'feat.sodium': ['Sodium', 'Натрий', 'Натрий'], 'feat.potassium': ['Potassium', 'Калий', 'Калий'],
  'feat.creatinine': ['Creatinine', 'Креатинин', 'Креатинин'], 'feat.bilirubin': ['Bilirubin', 'Билирубин', 'Билирубин'],
  'feat.urine_output': ['Urine output (mL/kg/h)', 'Диурез (мл/кг/ч)', 'Диурез (мл/кг/сағ)'],
  'feat.sex': ['Sex', 'Пол', 'Жынысы'], 'feat.delivery_mode': ['Delivery mode', 'Способ родоразрешения', 'Босану тәсілі'],
  'feat.vent_mode': ['Ventilation mode', 'Режим вентиляции', 'Желдету режимі'],
  'feat.other': ['{n} other features', 'Другие признаки: {n}', 'Басқа белгілер: {n}'],
});

/* short labels for the intake grid and chart axes */
const FLD = tri({
  'fld.gestational_age_wk': ['GA (wk)', 'Срок (нед)', 'Мерзім (апта)'],
  'fld.birth_weight_g': ['Weight (g)', 'Масса (г)', 'Салмақ (г)'],
  'fld.apgar_1': ['APGAR 1', 'Апгар 1', 'Апгар 1'], 'fld.apgar_5': ['APGAR 5', 'Апгар 5', 'Апгар 5'],
  'fld.age_hours': ['Age (h)', 'Возраст (ч)', 'Жасы (сағ)'],
  'fld.heart_rate': ['HR', 'ЧСС', 'ЖСЖ'], 'fld.resp_rate': ['RR', 'ЧД', 'ТАЖ'],
  'fld.spo2': ['SpO2 %', 'SpO2 %', 'SpO2 %'], 'fld.fio2': ['FiO2 %', 'FiO2 %', 'FiO2 %'], 'fld.sf_ratio': ['S/F', 'S/F', 'S/F'],
  'fld.map_mmhg': ['MAP', 'Ср. АД', 'Орт. АҚ'], 'fld.temperature': ['T °C', 'T °C', 'T °C'],
  'fld.ph': ['pH', 'pH', 'pH'], 'fld.pco2': ['pCO2', 'pCO2', 'pCO2'], 'fld.po2': ['pO2', 'pO2', 'pO2'], 'fld.hco3': ['HCO3', 'HCO3', 'HCO3'],
  'fld.base_excess': ['BE', 'BE', 'BE'], 'fld.lactate': ['Lactate', 'Лактат', 'Лактат'],
  'fld.glucose': ['Glucose', 'Глюкоза', 'Глюкоза'], 'fld.hemoglobin': ['Hb', 'Hb', 'Hb'], 'fld.wbc': ['WBC', 'Лейк.', 'Лейк.'],
  'fld.platelets': ['Plt', 'Тромб.', 'Тромб.'], 'fld.crp': ['CRP', 'СРБ', 'СРБ'], 'fld.sodium': ['Na', 'Na', 'Na'], 'fld.potassium': ['K', 'K', 'K'],
  'fld.creatinine': ['Creat', 'Креат.', 'Креат.'], 'fld.bilirubin': ['Bili', 'Билир.', 'Билир.'],
  'fld.urine_output': ['UO ml/kg/h', 'Диурез мл/кг/ч', 'Диурез мл/кг/сағ'],
  'fld.sex': ['Sex', 'Пол', 'Жынысы'], 'fld.delivery_mode': ['Delivery', 'Роды', 'Босану'], 'fld.vent_mode': ['Ventilation', 'Вентиляция', 'Желдету'],
});

/* 12-h aggregate features of the intake bundle */
const BF = tri({
  'bf.gender': ['Sex (M=1, F=0)', 'Пол (M=1, F=0)', 'Жынысы (M=1, F=0)'],
  'bf.age_days_at_admission': ['Age at admission, days', 'Возраст при поступлении, дней', 'Түскен кездегі жасы, күн'],
  'bf.hr_mean': ['HR, mean', 'ЧСС, среднее', 'ЖСЖ, орташа'], 'bf.hr_min': ['HR, min', 'ЧСС, минимум', 'ЖСЖ, ең төмен'], 'bf.hr_max': ['HR, max', 'ЧСС, максимум', 'ЖСЖ, ең жоғары'],
  'bf.rr_mean': ['RR, mean', 'ЧДД, среднее', 'ТАЖ, орташа'], 'bf.rr_min': ['RR, min', 'ЧДД, минимум', 'ТАЖ, ең төмен'], 'bf.rr_max': ['RR, max', 'ЧДД, максимум', 'ТАЖ, ең жоғары'],
  'bf.temp_mean': ['Temperature, mean', 'Температура, средняя', 'Дене қызуы, орташа'], 'bf.temp_max': ['Temperature, max', 'Температура, максимум', 'Дене қызуы, ең жоғары'],
  'bf.sbp_mean': ['Systolic BP, mean', 'Систолическое АД, среднее', 'Систолалық АҚ, орташа'],
  'bf.vitals_count_12h': ['Vital-sign measurements', 'Измерений витальных', 'Өмірлік көрсеткіш өлшемдері'],
  'bf.ph_mean': ['pH, mean', 'pH, среднее', 'pH, орташа'], 'bf.ph_min': ['pH, min', 'pH, минимум', 'pH, ең төмен'],
  'bf.lactate_mean': ['Lactate, mean', 'Лактат, среднее', 'Лактат, орташа'], 'bf.lactate_max': ['Lactate, max', 'Лактат, максимум', 'Лактат, ең жоғары'],
  'bf.po2_mean': ['pO2, mean', 'pO2, среднее', 'pO2, орташа'], 'bf.po2_min': ['pO2, min', 'pO2, минимум', 'pO2, ең төмен'],
  'bf.pco2_mean': ['pCO2, mean', 'pCO2, среднее', 'pCO2, орташа'],
  'bf.base_excess_mean': ['BE, mean', 'BE, среднее', 'BE, орташа'], 'bf.base_excess_min': ['BE, min', 'BE, минимум', 'BE, ең төмен'],
  'bf.glucose_mean': ['Glucose, mean', 'Глюкоза, средняя', 'Глюкоза, орташа'], 'bf.glucose_min': ['Glucose, min', 'Глюкоза, минимум', 'Глюкоза, ең төмен'], 'bf.glucose_max': ['Glucose, max', 'Глюкоза, максимум', 'Глюкоза, ең жоғары'],
  'bf.hemoglobin_mean': ['Haemoglobin', 'Гемоглобин', 'Гемоглобин'], 'bf.platelets_min': ['Platelets, min', 'Тромбоциты, минимум', 'Тромбоциттер, ең төмен'],
  'bf.wbc_mean': ['WBC, mean', 'Лейкоциты, среднее', 'Лейкоциттер, орташа'], 'bf.wbc_max': ['WBC, max', 'Лейкоциты, максимум', 'Лейкоциттер, ең жоғары'],
  'bf.sodium_mean': ['Sodium', 'Натрий', 'Натрий'], 'bf.potassium_mean': ['Potassium', 'Калий', 'Калий'],
  'bf.labs_count_12h': ['Lab measurements', 'Лабораторных измерений', 'Зертханалық өлшемдер'],
});

const UI = tri({
  // units
  'u.g': ['g', 'г', 'г'], 'u.h': ['h', 'ч', 'сағ'], 'u.bpm': ['bpm', 'уд/мин', 'соқ/мин'], 'u.mmol': ['mmol/L', 'ммоль/л', 'ммоль/л'], 'u.pp': ['pp', 'п.п.', 'п.т.'],
  'u.minN': ['{n} min', '{n} мин', '{n} мин'], 'u.hN': ['{n} h', '{n} ч', '{n} сағ'],
  // categorical options (values stay in English for the API)
  'opt.sex.F': ['F', 'Ж', 'Қ'], 'opt.sex.M': ['M', 'М', 'Ұ'],
  'opt.vaginal': ['Vaginal', 'Естественные', 'Табиғи'], 'opt.cesarean': ['Caesarean', 'Кесарево сечение', 'Кесар тілігі'],
  // patients view
  'doc.livePreview': ['live preview', 'предварительная оценка', 'алдын ала баға'],
  'doc.preview': ['preview', 'предварительно', 'алдын ала'], 'doc.committed': ['committed', 'зафиксировано', 'тіркелді'],
  'doc.prior': ['prior {n}%', 'исходно {n}%', 'бастапқы {n}%'],
  'doc.shap.sub': ['Percentage points from base rate to this patient', 'Процентные пункты от базового риска до риска этого пациента', 'Базалық қауіптен осы науқастың қаупіне дейінгі пайыздық тармақтар'],
  'doc.shap.empty': ['Run the assessment to see contributions', 'Запустите оценку, чтобы увидеть вклад признаков', 'Белгілердің үлесін көру үшін бағалауды іске қосыңыз'],
  'doc.base': ['Base', 'База', 'Базалық'], 'doc.riskShort': ['Risk', 'Риск', 'Қауіп'],
  'doc.prediction': ['prediction {id}', 'прогноз {id}', 'болжам {id}'], 'doc.runFirst': ['run first', 'сначала оценка', 'алдымен бағалау'],
  'doc.recorded': ['Recorded in the audit log · human-in-the-loop', 'Записано в журнал аудита · решение за врачом', 'Аудит журналына жазылды · шешімді дәрігер қабылдайды'],
  // time machine
  'tm.replay': ['Replay position', 'Позиция воспроизведения', 'Ойнату орны'],
  'tm.drivers': ['Top drivers', 'Главные факторы', 'Негізгі факторлар'],
  // sign-off queue
  'doc.queue.pending': ['{n} awaiting sign-off', 'Ожидают подписи: {n}', 'Қол қоюды күтуде: {n}'],
  'doc.queue.empty': ['No predictions yet. Run an assessment on the Patients tab.', 'Прогнозов пока нет. Запустите оценку на вкладке «Пациенты».', 'Әзірге болжам жоқ. «Науқастар» қойындысында бағалауды іске қосыңыз.'],
  'review.approved': ['Approved', 'Одобрено', 'Мақұлданды'], 'review.flagged': ['Disagreement', 'Есть возражение', 'Қарсылық бар'],
  // shift tasks
  'doc.task.ph': ['e.g. Repeat blood gas', 'напр., повторить КЩС', 'мысалы, қан газдарын қайталау'],
  'doc.task.delete': ['Delete', 'Удалить', 'Жою'],
  'doc.task.aiRisk': ['{n}% 24h risk', 'риск {n}% за 24 ч', '24 сағ қаупі {n}%'],
  'doc.imaging.sub': ['Chest X-ray · cranial ultrasound · bedside telemetry', 'Рентген грудной клетки · нейросонография · прикроватная телеметрия', 'Кеуде рентгені · нейросонография · төсек жанындағы телеметрия'],
  // admission card / intake page
  'adm.grade': ['grade {n}', '{n} степень', '{n} дәреже'], 'adm.code': ['Code {n}', 'Код {n}', 'Код {n}'],
  'adm.warn.missing': ['{f}: no value, median imputed', '{f}: нет значения, подставлена медиана', '{f}: мәні жоқ, медиана қойылды'],
  'adm.warn.range': ['{f}: {v} is outside the training range ({r})', '{f}: {v} вне диапазона обучающих данных ({r})', '{f}: {v} оқыту деректерінің ауқымынан тыс ({r})'],
  // computer vision
  'cv.live': ['Live incubator stream · Bed {bed} · {id}', 'Видеопоток из кувеза · Койка {bed} · {id}', 'Кювезден тікелей трансляция · Төсек {bed} · {id}'],
  'cv.liveSub': ['WebSocket telemetry ({status}) · NFCS landmarks, chest-wall motion, perfusion proxy, posture', 'Телеметрия WebSocket ({status}) · точки NFCS, движение грудной клетки, косвенная оценка перфузии, поза', 'WebSocket телеметриясы ({status}) · NFCS нүктелері, кеуде қабырғасының қозғалысы, перфузияның жанама бағасы, дене қалпы'],
  'cv.status.open': ['server · /api/cv/ws/telemetry', 'сервер · /api/cv/ws/telemetry', 'сервер · /api/cv/ws/telemetry'],
  'cv.status.local': ['local synthesiser', 'локальный синтезатор', 'жергілікті синтезатор'],
  'cv.status.connecting': ['connecting', 'подключение', 'қосылуда'], 'cv.status.closed': ['reconnecting', 'переподключение', 'қайта қосылуда'],
  'cv.simulated': ['simulated · pending validation', 'симуляция · ожидает валидации', 'симуляция · валидацияны күтуде'],
  'cv.tracking': ['Tracking', 'Трекинг', 'Бақылау'], 'cv.thermal': ['Thermal', 'Тепловизор', 'Жылу бейнесі'], 'cv.frame': ['frame', 'кадр', 'кадр'],
  'cv.perfusion': ['Perfusion', 'Перфузия', 'Перфузия'], 'cv.cyanotic': ['cyanotic', 'цианоз', 'цианоз'], 'cv.pink': ['pink', 'розовый', 'қызғылт'],
  'cv.corePeriphShort': ['Core-periph Δ', 'Центр–периф. Δ', 'Орталық–шет. Δ'],
  'cv.c.resp': ['RESP ROI  RR {rr}  amp {a}%', 'ДЫХАНИЕ  ЧД {rr}  амп {a}%', 'ТЫНЫС  ТАЖ {rr}  амп {a}%'],
  'cv.c.posture': ['POSTURE  {p}', 'ПОЗА  {p}', 'ҚАЛЫП  {p}'],
  'cv.c.face': ['FACE  NFCS {n}/8', 'ЛИЦО  NFCS {n}/8', 'БЕТ  NFCS {n}/8'],
  'cv.c.perf': ['PERFUSION {v}', 'ПЕРФУЗИЯ {v}', 'ПЕРФУЗИЯ {v}'], 'cv.c.cyan': ['cyanosis {n}%', 'цианоз {n}%', 'цианоз {n}%'],
  'cv.c.ap': ['AP · supine · synthetic', 'ПЗ · лёжа на спине · синтетика', 'АА · шалқасынан · синтетика'],
  'cv.c.us': ['CORONAL · anterior fontanelle · 8 MHz · synthetic', 'КОРОНАРНО · передний родничок · 8 МГц · синтетика', 'КОРОНАЛЬДЫ · алдыңғы еңбек · 8 МГц · синтетика'],
  'cv.pain': ['Pain · NFCS', 'Боль · NFCS', 'Ауырсыну · NFCS'],
  'cv.painSub': ['Neonatal Facial Coding System, 0–8', 'Шкала мимики новорождённого (NFCS), 0–8', 'Жаңа туған нәрестенің бет-әлпеті шкаласы (NFCS), 0–8'],
  'cv.nfcs.0': ['Brow bulge', 'Выпячивание бровей', 'Қастың томпаюы'], 'cv.nfcs.1': ['Eye squeeze', 'Зажмуривание глаз', 'Көзді қысу'],
  'cv.nfcs.2': ['Nasolabial furrow', 'Углубление носогубной складки', 'Мұрын-ерін қатпарының тереңдеуі'], 'cv.nfcs.3': ['Open lips', 'Раскрытие губ', 'Еріннің ашылуы'],
  'cv.nfcs.4': ['Vertical mouth stretch', 'Вертикальное растяжение рта', 'Ауыздың тігінен созылуы'], 'cv.nfcs.5': ['Taut tongue', 'Напряжённый язык', 'Тілдің кернелуі'],
  'cv.nfcs.6': ['Chin quiver', 'Дрожание подбородка', 'Иектің дірілі'], 'cv.nfcs.7': ['Lip purse', 'Губы трубочкой', 'Ерінді түтікше жұму'],
  'cv.painHigh': ['Score ≥ 4 suggests procedural pain; review analgesia and handling.', 'Балл ≥ 4 указывает на процедурную боль: пересмотрите обезболивание и манипуляции.', '≥ 4 балл процедуралық ауырсынуды көрсетеді: жансыздандыру мен манипуляцияларды қайта қараңыз.'],
  'cv.painLow': ['Below treatment threshold.', 'Ниже порога для лечения.', 'Емдеу шегінен төмен.'],
  'cv.temp': ['Surface temperature', 'Температура поверхности тела', 'Дене бетінің температурасы'],
  'cv.tempSubOn': ['LWIR emissivity 0.98 · ±0.3 °C', 'ИК LWIR, излучательная способность 0,98 · ±0,3 °C', 'ИҚ LWIR, сәуле шығару қабілеті 0,98 · ±0,3 °C'],
  'cv.tempSubOff': ['Switch to Thermal for the live map', 'Включите тепловизор, чтобы увидеть карту', 'Картаны көру үшін жылу бейнесін қосыңыз'],
  'cv.part.forehead': ['Forehead', 'Лоб', 'Маңдай'], 'cv.part.chest': ['Chest', 'Грудь', 'Кеуде'], 'cv.part.abdomen': ['Abdomen', 'Живот', 'Іш'],
  'cv.part.hand': ['Hand', 'Кисть', 'Қол басы'], 'cv.part.foot': ['Foot', 'Стопа', 'Табан'],
  'cv.gradient': ['Core-peripheral gradient', 'Градиент центр–периферия', 'Орталық–шеткері градиент'],
  'cv.xr': ['Chest X-ray · Grad-CAM', 'Рентген грудной клетки · Grad-CAM', 'Кеуде рентгені · Grad-CAM'],
  'cv.serverInf': ['Server inference · {b}', 'Анализ на сервере · {b}', 'Серверде талдау · {b}'],
  'cv.xrSub': ['Synthetic study · upload a film for server inference', 'Синтетический снимок · загрузите снимок для анализа на сервере', 'Синтетикалық сурет · серверде талдау үшін суретті жүктеңіз'],
  'cv.uploadedFilm': ['uploaded film', 'загруженный снимок', 'жүктелген сурет'], 'cv.uploadedScan': ['uploaded scan', 'загруженное исследование', 'жүктелген зерттеу'],
  'cv.synthStudy': ['synthetic study', 'синтетическое исследование', 'синтетикалық зерттеу'],
  'cv.focus': ['focus', 'в фокусе', 'назарда'], 'cv.view': ['view', 'показать', 'көрсету'],
  'cv.opacity': ['Overlay opacity', 'Интенсивность наложения', 'Қабаттың қанықтығы'],
  'cv.us': ['Cranial ultrasound · IVH', 'Нейросонография · ВЖК', 'Нейросонография · ҚІҚҚ'],
  'cv.usSub': ['Coronal view · Papile grading · synthetic', 'Коронарная проекция · классификация Papile · синтетика', 'Корональды проекция · Papile жіктемесі · синтетика'],
  'cv.clear': ['clear', 'норма', 'қалыпты'], 'cv.ivhGrade': ['IVH grade {g}', 'ВЖК {g} степени', 'ҚІҚҚ {g} дәреже'],
  'cv.simFinding': ['Simulated finding', 'Смоделированная находка', 'Модельденген көрініс'],
  'cv.ivh.0': ['No haemorrhage', 'Кровоизлияния нет', 'Қан құйылу жоқ'],
  'cv.ivh.1': ['Grade I · germinal matrix', 'I степень · герминативный матрикс', 'I дәреже · герминативтік матрикс'],
  'cv.ivh.2': ['Grade II · intraventricular, no dilation', 'II степень · внутрижелудочковое, без расширения', 'II дәреже · қарынша ішілік, кеңеюсіз'],
  'cv.ivh.3': ['Grade III · with ventricular dilation', 'III степень · с расширением желудочков', 'III дәреже · қарыншалардың кеңеюімен'],
  'cv.ivh.4': ['Grade IV · parenchymal extension', 'IV степень · с переходом на паренхиму', 'IV дәреже · паренхимаға таралумен'],
  'cv.conf': ['Model confidence', 'Уверенность модели', 'Модельдің сенімділігі'], 'cv.recommended': ['Recommended', 'Рекомендация', 'Ұсыныс'],
  'cv.rec.0': ['Routine screen day 7', 'Плановый скрининг на 7-е сутки', '7-тәулікте жоспарлы скрининг'],
  'cv.rec.1': ['Repeat scan 48 h', 'Повторить УЗИ через 48 ч', 'УДЗ-ны 48 сағаттан кейін қайталау'],
  'cv.rec.2': ['Repeat scan 48 h · neuro consult', 'Повторить УЗИ через 48 ч · консультация невролога', 'УДЗ-ны 48 сағ кейін қайталау · невролог кеңесі'],
  'cv.rec.3': ['Serial OFC · neurosurgery alert', 'Контроль окружности головы · предупредить нейрохирурга', 'Бас шеңберін бақылау · нейрохирургқа хабарлау'],
  'cv.rec.4': ['Urgent neurosurgery review', 'Срочная консультация нейрохирурга', 'Нейрохирургтың шұғыл кеңесі'],
  'cv.analysing': ['Analysing…', 'Анализ…', 'Талдау…'],
  'cv.uploadXr': ['Upload X-ray (PNG/JPEG)', 'Загрузить рентген (PNG/JPEG)', 'Рентгенді жүктеу (PNG/JPEG)'],
  'cv.uploadUs': ['Upload ultrasound (PNG/JPEG)', 'Загрузить УЗИ (PNG/JPEG)', 'УДЗ жүктеу (PNG/JPEG)'],
  'cv.needServer': ['Server Grad-CAM needs the backend running; showing the synthetic study.', 'Для Grad-CAM на сервере нужен запущенный бэкенд; показано синтетическое исследование.', 'Серверлік Grad-CAM үшін бэкенд іске қосулы болуы керек; синтетикалық зерттеу көрсетілді.'],
  'cv.aria.live': ['Live NICU video stream simulation', 'Симуляция видеопотока ОРИТН', 'ЖРИТБ бейне ағынының симуляциясы'],
  'cv.aria.xr': ['Chest X-ray with Grad-CAM overlay', 'Рентген грудной клетки с картой Grad-CAM', 'Grad-CAM картасы бар кеуде рентгені'],
  'cv.aria.us': ['Cranial ultrasound with IVH heatmap', 'Нейросонография с тепловой картой ВЖК', 'ҚІҚҚ жылу картасы бар нейросонография'],
  'cv.aria.overlay': ['Grad-CAM overlay', 'Наложение Grad-CAM', 'Grad-CAM қабаты'],
  // incubator HUD (landing)
  'hud.lungs': ['LUNGS · RDS', 'ЛЁГКИЕ · РДС', 'ӨКПЕ · РДС'],
  'hud.gut': ['GUT · NEC watch', 'КИШЕЧНИК · контроль НЭК', 'ІШЕК · НЭК бақылауы'], 'hud.gutSub': ['feeds on hold', 'кормление приостановлено', 'тамақтандыру тоқтатылды'],
  'hud.brain': ['BRAIN · IVH', 'МОЗГ · ВЖК', 'МИ · ҚІҚҚ'], 'hud.brainSub': ['grade 0 · low risk', 'степень 0 · низкий риск', '0 дәреже · төмен қауіп'],
  'hud.face': ['FACE · NFCS 2/8', 'ЛИЦО · NFCS 2/8', 'БЕТ · NFCS 2/8'],
  'hud.chest': ['CHEST · RR 58 · amp {a}%', 'ГРУДЬ · ЧД 58 · амп {a}%', 'КЕУДЕ · ТАЖ 58 · амп {a}%'],
  'hud.ecg': ['ECG II · 148 bpm', 'ЭКГ II · 148 уд/мин', 'ЭКГ II · 148 соқ/мин'],
  'hud.anatomyTag': ['ANATOMY · synthetic', 'АНАТОМИЯ · синтетика', 'АНАТОМИЯ · синтетика'],
  'hud.risk': ['24H RISK', 'РИСК 24 Ч', '24 САҒ ҚАУПІ'],
  'hud.anatomy': ['Anatomy', 'Анатомия', 'Анатомия'],
  'hud.aria': ['Incubator telemetry HUD', 'Телеметрия кувеза', 'Кювез телеметриясы'],
});

export const STR = { ...FEAT, ...FLD, ...BF, ...UI, 'doc.predictionQueue': { en: 'Model predictions for review', ru: 'Прогнозы модели на подтверждение', kz: 'Растауға арналған модель болжамдары' } };

const en = (rows) => Object.fromEntries(Object.entries(rows).map(([k, [ru, kz]]) => [k, { ru, kz }]));
const ruKey = (rows) => Object.fromEntries(Object.entries(rows).map(([k, [enT, kz]]) => [k, { en: enT, kz }]));

export const TEXT = {
  ...en({
    // 24 h model recommendations (backend ml_engine.RECOMMENDATIONS and the offline surrogate in lib/risk.js)
    'Routine monitoring': ['Плановое наблюдение', 'Жоспарлы бақылау'],
    'Reassess vitals in 4 h': ['Повторно оценить витальные показатели через 4 ч', 'Өмірлік көрсеткіштерді 4 сағаттан кейін қайта бағалау'],
    'Repeat blood gas in 2 h': ['Повторить КЩС через 2 ч', 'Қан газдарын 2 сағаттан кейін қайталау'],
    'Notify attending neonatologist': ['Сообщить лечащему неонатологу', 'Емдеуші неонатологқа хабарлау'],
    'Senior review within 30 min': ['Осмотр старшим врачом в течение 30 мин', '30 мин ішінде аға дәрігердің қарауы'],
    'Prepare escalation of respiratory support': ['Подготовить усиление респираторной поддержки', 'Тыныс алуды қолдауды күшейтуге дайындалу'],
    'Prepare respiratory escalation': ['Подготовить усиление респираторной поддержки', 'Тыныс алуды қолдауды күшейтуге дайындалу'],
    'Immediate bedside review': ['Немедленный осмотр у кувеза', 'Кювез жанында дереу қарау'],
    'Sepsis bundle; consider intubation': ['Комплекс мер при сепсисе; рассмотреть интубацию', 'Сепсис кезіндегі шаралар кешені; интубацияны қарастыру'],
    'Sepsis bundle · consider intubation': ['Комплекс мер при сепсисе · рассмотреть интубацию', 'Сепсис кезіндегі шаралар кешені · интубацияны қарастыру'],
    // seed timeline events
    'Escalated to HFOV, suspected sepsis': ['Переведён на HFOV, подозрение на сепсис', 'HFOV-ға ауыстырылды, сепсиске күдік'],
    'Intubated; inotropes started': ['Интубирован; начаты инотропы', 'Интубацияланды; инотроптар басталды'],
    // CV telemetry and imaging
    'supine · symmetric · tone normal': ['на спине · симметрично · тонус в норме', 'шалқасынан · симметриялы · тонус қалыпты'],
    'Neonatal RDS': ['РДС новорождённого', 'Нәрестенің РДС'],
    'Pneumothorax risk': ['Риск пневмоторакса', 'Пневмоторакс қаупі'],
    'ETT placement': ['Положение интубационной трубки', 'Интубациялық түтіктің орны'],
    'Bilateral ground-glass, air bronchograms, low lung volumes': ['Двустороннее «матовое стекло», воздушные бронхограммы, малый объём лёгких', 'Екі жақты «күңгірт әйнек», ауа бронхограммалары, өкпе көлемінің азаюы'],
    'Right apical lucency; monitor after surfactant': ['Просветление верхушки справа; наблюдение после сурфактанта', 'Оң жақ өкпе ұшының ағаруы; сурфактанттан кейін бақылау'],
    'Apical lucency; monitor after surfactant': ['Просветление в области верхушки; наблюдение после сурфактанта', 'Өкпе ұшының ағаруы; сурфактанттан кейін бақылау'],
    'Tip 0.6 cm above carina (T2) — within range': ['Кончик на 0,6 см выше карины (T2) — в пределах нормы', 'Ұшы каринадан 0,6 см жоғары (T2) — қалыпты шекте'],
    'Tip position relative to carina': ['Положение кончика относительно карины', 'Ұшының каринаға қатысты орны'],
    'NeoOutcome Demonstration NICU': ['Демонстрационное ОРИТН NeoOutcome', 'NeoOutcome демонстрациялық ЖРИТБ'],
  }),
  ...ruKey({
    // admission model (backend admission_engine.ADMISSION_LABELS, units, notice)
    'Возраст матери': ['Maternal age', 'Ана жасы'],
    'Отягощённый акушерский анамнез': ['Adverse obstetric history', 'Ауыр акушерлік анамнез'],
    'Преэклампсия': ['Pre-eclampsia', 'Преэклампсия'],
    'Хориоамнионит': ['Chorioamnionitis', 'Хориоамнионит'],
    'Внутриутробная инфекция': ['Intrauterine infection', 'Жатырішілік инфекция'],
    'Способ родоразрешения (код)': ['Mode of delivery (code)', 'Босану тәсілі (код)'],
    'Пол (код)': ['Sex (code)', 'Жынысы (код)'],
    'Масса при рождении': ['Birth weight', 'Туған кездегі салмақ'],
    'Апгар': ['Apgar', 'Апгар'],
    'Срок гестации': ['Gestational age', 'Гестациялық жас'],
    'Дыхательная недостаточность, степень': ['Respiratory failure grade', 'Тыныс жеткіліксіздігі, дәрежесі'],
    'ЧСС при поступлении': ['Heart rate at admission', 'Түскен кездегі ЖСЖ'],
    'SpO₂ при поступлении': ['SpO₂ at admission', 'Түскен кездегі SpO₂'],
    'Группа крови (код)': ['Blood group (code)', 'Қан тобы (код)'],
    'Резус (код)': ['Rhesus (code)', 'Резус (код)'],
    'нед': ['wk', 'апта'], 'г': ['g', 'г'], 'балл': ['pts', 'балл'], 'лет': ['yrs', 'жас'], 'уд/мин': ['bpm', 'соқ/мин'],
    'Модель обучена на обезличенных данных КазНМУ им. Асфендиярова (2021–2023), проверена на 2024–2025. Исследовательский прототип, не является диагнозом или медицинской рекомендацией.': [
      'The model was trained on de-identified data from Asfendiyarov KazNMU (2021–2023) and tested on 2024–2025. Research prototype; not a diagnosis or medical advice.',
      'Модель С.Ж. Асфендияров атындағы ҚазҰМУ-дың иесіздендірілген деректерінде (2021–2023) оқытылып, 2024–2025 жылдары тексерілді. Зерттеу прототипі, диагноз немесе медициналық ұсыныс емес.'],
    // intake bundle (backend patient_card.py and lib/intakeMock.js)
    'Синтетические данные. Исследовательский прототип. Не является диагнозом или медицинской рекомендацией.': ['Synthetic data. Research prototype. Not a diagnosis or medical advice.', 'Синтетикалық деректер. Зерттеу прототипі. Диагноз немесе медициналық ұсыныс емес.'],
    'Поддержка принятия решений. Окончательное решение принимает врач (система низкой автономности, ст. 17 Закона РК № 230-VIII). Не является диагнозом или медицинской рекомендацией.': [
      'Decision support. The final decision is made by the doctor (low-autonomy system, Art. 17 of Law of RK No. 230-VIII). Not a diagnosis or medical advice.',
      'Шешім қабылдауды қолдау. Соңғы шешімді дәрігер қабылдайды (төмен дербестік жүйесі, ҚР № 230-VIII Заңының 17-бабы). Диагноз немесе медициналық ұсыныс емес.'],
    'Синтетические данные. Исследовательский прототип.': ['Synthetic data. Research prototype.', 'Синтетикалық деректер. Зерттеу прототипі.'],
    'Поддержка решений. Окончательное решение принимает врач.': ['Decision support. The final decision is made by the doctor.', 'Шешім қабылдауды қолдау. Соңғы шешімді дәрігер қабылдайды.'],
    '12-часовой контракт не содержит SpO₂/FiO₂, режима вентиляции и Апгар — подставлены медианы когорты (комнатный воздух), поэтому оценка может быть занижена для детей на респираторной поддержке.': [
      'The 12-hour contract has no SpO₂/FiO₂, ventilation mode or Apgar; cohort medians (room air) are imputed, so the score may be too low for infants on respiratory support.',
      '12 сағаттық келісімшартта SpO₂/FiO₂, желдету режимі және Апгар жоқ — когорта медианалары (бөлме ауасы) қойылды, сондықтан тыныс алуды қолдаудағы нәрестелер үшін баға төмендетілуі мүмкін.'],
    '12-часовой контракт не содержит SpO₂/FiO₂, режима вентиляции и Апгар — подставлены медианы когорты.': [
      'The 12-hour contract has no SpO₂/FiO₂, ventilation mode or Apgar; cohort medians are imputed.',
      '12 сағаттық келісімшартта SpO₂/FiO₂, желдету режимі және Апгар жоқ — когорта медианалары қойылды.'],
    'Сверить загруженные значения с первичной медицинской документацией.': ['Check the imported values against the primary medical record.', 'Жүктелген мәндерді бастапқы медициналық құжаттамамен салыстыру.'],
    'Передать оценку старшему врачу для приоритетного клинического осмотра по локальному протоколу.': ['Pass the assessment to a senior doctor for a priority clinical review under the local protocol.', 'Жергілікті хаттама бойынша басым клиникалық қарау үшін бағаны аға дәрігерге беру.'],
    'Продолжить непрерывный мониторинг и задокументировать повторную оценку состояния.': ['Continue continuous monitoring and document the reassessment.', 'Үздіксіз мониторингті жалғастырып, жағдайды қайта бағалауды құжаттау.'],
    'Запланировать повторный врачебный осмотр и обновить оценку после новых измерений.': ['Schedule a repeat medical review and update the score after new measurements.', 'Дәрігердің қайта қарауын жоспарлап, жаңа өлшемдерден кейін бағаны жаңарту.'],
    'Продолжить плановое наблюдение по протоколу отделения.': ['Continue routine observation under the unit protocol.', 'Бөлімше хаттамасы бойынша жоспарлы бақылауды жалғастыру.'],
    'Повторно проверить газовый состав крови и кислотно-основное состояние.': ['Recheck blood gases and acid–base status.', 'Қан газдарын және қышқыл-негіз жағдайын қайта тексеру.'],
    'Проверить динамику лактата и сопоставить её с клиническими признаками перфузии.': ['Review the lactate trend against clinical signs of perfusion.', 'Лактат динамикасын тексеріп, перфузияның клиникалық белгілерімен салыстыру.'],
    'Повторно измерить глюкозу и оценить динамику по локальному протоколу.': ['Remeasure glucose and review the trend under the local protocol.', 'Глюкозаны қайта өлшеп, динамикасын жергілікті хаттама бойынша бағалау.'],
    'Проверить эпизоды тахикардии по исходной записи мониторинга.': ['Check tachycardia episodes in the original monitor record.', 'Тахикардия эпизодтарын мониторингтің бастапқы жазбасы бойынша тексеру.'],
    'Демо-пациент N-0001': ['Demo patient N-0001', 'Демо-науқас N-0001'],
    'Демо-врач А. Каримова': ['Demo doctor A. Karimova', 'Демо-дәрігер А. Каримова'],
    '32 недели 4 дня': ['32 weeks 4 days', '32 апта 4 күн'],
    'Отделение реанимации и интенсивной терапии новорождённых': ['Neonatal intensive care unit', 'Жаңа туған нәрестелердің реанимация және қарқынды терапия бөлімшесі'],
    'Респираторный дистресс, динамическое наблюдение': ['Respiratory distress, ongoing observation', 'Респираторлық дистресс, динамикалық бақылау'],
    'ОРИТН': ['NICU', 'ЖРИТБ'],
    'Импорт из CSV': ['Imported from CSV', 'CSV-ден импорт'], 'Импорт из JSON': ['Imported from JSON', 'JSON-нан импорт'],
  }),
};

/* ---------- helpers shared by the doctor components ---------- */
export const locale = (lang) => ({ kz: 'kk-KZ', en: 'en-GB' }[lang] || 'ru-RU');

/* offline surrogate keys (lib/risk.js) -> model feature keys */
const ALIAS = { FiO2: 'fio2', 'S/F': 'sf_ratio', Lactate: 'lactate', BE: 'base_excess', HR: 'heart_rate', GA: 'gestational_age_wk', Weight: 'birth_weight_g', APGAR: 'apgar_5', Temp: 'temperature' };
const has = (t, k) => t(k) !== k;
/** Full label of a model feature; falls back to the server label, then the key. */
export const featName = (t, key, label) => {
  if (key === 'other') return t('feat.other', { n: String(label || '').split(' ')[0] });
  const k = `feat.${ALIAS[key] || key}`; return has(t, k) ? t(k) : label || key;
};
/** Short label of a model feature for compact grids and chart axes. */
export const featShort = (t, key, label) => {
  if (key === 'other') return t('feat.other', { n: String(label || '').split(' ')[0] });
  const k = `fld.${ALIAS[key] || key}`; return has(t, k) ? t(k) : featName(t, key, label);
};
/** Ventilation mode for display: only "room air" is a word, the rest are universal abbreviations. */
export const ventName = (t, m) => (m === 'room air' ? t('home.roomAir') : m);
/** Shift-task title: AI tasks arrive as "<recommendation> — <patient> (<n>% 24h risk)". */
export const taskTitle = (t, tx, title) => {
  const m = /^(.*) — (\S+) \((\d+)% 24h risk\)$/.exec(title || '');
  return m ? `${tx(m[1])} — ${m[2]} (${t('doc.task.aiRisk', { n: m[3] })})` : tx(title);
};
/** Admission-model input warnings arrive in Russian from the server. */
export const admissionWarning = (t, tx, w) => {
  let m = /^(.+): нет значения, подставлена медиана$/.exec(w);
  if (m) return t('adm.warn.missing', { f: tx(m[1]) });
  m = /^(.+): (\S+) вне диапазона обучающих данных \((.+)\)$/.exec(w);
  if (m) return t('adm.warn.range', { f: tx(m[1]), v: m[2], r: m[3] });
  return w;
};
/** Option labels of the admission form ("2 степень", "Код 1"). */
export const admissionOption = (t, label) => {
  let m = /^(\d) степень$/.exec(label); if (m) return t('adm.grade', { n: m[1] });
  m = /^Код (\d)$/.exec(label); if (m) return t('adm.code', { n: m[1] });
  return label;
};
