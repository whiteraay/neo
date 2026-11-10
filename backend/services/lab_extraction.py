"""Read lab reports: text extraction (PDF text layer / OCR), parsing, unit normalisation, rules.

Pipeline (docs/maternal_labs.md):
  file -> text (pypdf text layer, else Tesseract OCR when installed) -> lines -> (test, value, unit, range)
       -> canonical code + canonical unit (converted only when the dimension matches) -> confidence.
Nothing here is a diagnosis. The rules at the bottom are fixed thresholds that produce "discuss with your doctor"
prompts; they are a draft for review by obstetricians.
"""
from __future__ import annotations

import io
import re
import shutil
from dataclasses import asdict, dataclass, field
from datetime import date

# ----------------------------------------------------------------------------------------------- catalogue
# code: group, names, canonical unit (display), unit conversions {unit key: factor to canonical}, plausible range,
#       kind, synonyms [(text, sections or None)]. Sections: 'blood' | 'urine' | 'us' (ultrasound).
CATALOG: dict[str, dict] = {
    "hb": dict(group="cbc", names=dict(en="Haemoglobin (Hb)", ru="Гемоглобин (Hb)", kz="Гемоглобин (Hb)"), unit="g/L", conv={"g/l": 1, "g/dl": 10},
               plaus=(40, 220), units=["g/L", "г/л", "g/dL", "г/дл"], syn=["гемоглобин", "hgb", "hb"]),
    "rbc": dict(group="cbc", names=dict(en="Red blood cells (RBC)", ru="Эритроциты (RBC)", kz="Эритроциттер (RBC)"), unit="10^12/L", conv={"tera/l": 1},
                plaus=(1, 8), units=["10^12/L", "10¹²/л", "млн/мкл"], syn=["эритроцит", "rbc"]),
    "wbc": dict(group="cbc", names=dict(en="White blood cells (WBC)", ru="Лейкоциты (WBC)", kz="Лейкоциттер (WBC)"), unit="10^9/L", conv={"giga/l": 1},
                plaus=(0.5, 60), units=["10^9/L", "10⁹/л", "тыс/мкл"], syn=["лейкоцит", "wbc"]),
    "plt": dict(group="cbc", names=dict(en="Platelets (PLT)", ru="Тромбоциты (PLT)", kz="Тромбоциттер (PLT)"), unit="10^9/L", conv={"giga/l": 1},
                plaus=(5, 1500), units=["10^9/L", "10⁹/л", "тыс/мкл"], syn=["тромбоцит", "plt"]),
    "hct": dict(group="cbc", names=dict(en="Haematocrit (HCT)", ru="Гематокрит (HCT)", kz="Гематокрит (HCT)"), unit="%", conv={"%": 1, "l/l": 100},
                plaus=(10, 70), units=["%", "L/L", "л/л"], syn=["гематокрит", "hct"]),
    "mcv": dict(group="cbc", names=dict(en="Mean cell volume (MCV)", ru="Средний объём эритроцита (MCV)", kz="Эритроциттің орташа көлемі (MCV)"), unit="fL", conv={"fl": 1},
                plaus=(50, 130), units=["fL", "фл"], syn=["mcv", "средний объем эритроцит", "ср. объем эритроцит"]),
    "rdw": dict(group="cbc", names=dict(en="Red cell distribution width (RDW)", ru="Ширина распределения эритроцитов (RDW)", kz="Эритроциттердің көлемі бойынша таралу ені (RDW)"), unit="%",
                conv={"%": 1}, plaus=(8, 30), units=["%"], syn=["rdw-cv", "rdw cv", "rdw", "ширина распределения эритроцит"]),
    "glucose": dict(group="biochem", names=dict(en="Glucose", ru="Глюкоза", kz="Глюкоза"), unit="mmol/L", conv={"mmol/l": 1, "mg/dl": 0.0555},
                    plaus=(1, 35), units=["mmol/L", "ммоль/л", "mg/dL", "мг/дл"], syn=["глюкоза", "glucose", "glu", "сахар крови"]),
    "creatinine": dict(group="biochem", names=dict(en="Creatinine", ru="Креатинин", kz="Креатинин"), unit="µmol/L", conv={"umol/l": 1, "mg/dl": 88.4},
                       plaus=(10, 1000), units=["µmol/L", "мкмоль/л", "mg/dL", "мг/дл"], syn=["креатинин", "creatinine", "crea"]),
    "alt": dict(group="biochem", names=dict(en="ALT", ru="АЛТ", kz="АЛТ"), unit="U/L", conv={"u/l": 1}, plaus=(1, 2000), units=["U/L", "Ед/л"],
                syn=["аланинаминотрансфераза", "аланиновая аминотрансфераза", "алат", "алт", "alat", "alt", "alanine aminotransferase"]),
    "ast": dict(group="biochem", names=dict(en="AST", ru="АСТ", kz="АСТ"), unit="U/L", conv={"u/l": 1}, plaus=(1, 2000), units=["U/L", "Ед/л"],
                syn=["аспартатаминотрансфераза", "аспарагиновая аминотрансфераза", "асат", "аст", "asat", "ast", "aspartate aminotransferase"]),
    "ferritin": dict(group="biochem", names=dict(en="Ferritin", ru="Ферритин", kz="Ферритин"), unit="µg/L", conv={"ug/l": 1}, plaus=(0.5, 2000),
                     units=["µg/L", "мкг/л", "ng/mL", "нг/мл"], syn=["ферритин", "ferritin"]),
    "urea": dict(group="biochem", names=dict(en="Urea", ru="Мочевина", kz="Мочевина"), unit="mmol/L", conv={"mmol/l": 1}, plaus=(0.5, 60),
                 units=["mmol/L", "ммоль/л"], syn=["мочевина", "urea"]),  # mg/dL is ambiguous (urea vs BUN): not converted
    "uric_acid": dict(group="biochem", names=dict(en="Uric acid", ru="Мочевая кислота", kz="Несеп қышқылы"), unit="µmol/L", conv={"umol/l": 1, "mg/dl": 59.48},
                      plaus=(30, 1500), units=["µmol/L", "мкмоль/л", "mg/dL", "мг/дл"], syn=["мочевая кислота", "uric acid"]),
    "hba1c": dict(group="biochem", names=dict(en="Glycated haemoglobin (HbA1c)", ru="Гликированный гемоглобин (HbA1c)", kz="Гликирленген гемоглобин (HbA1c)"), unit="%",
                  conv={"%": 1}, plaus=(3, 20), units=["%"], syn=["гликозилированный гемоглобин", "гликолизированный гемоглобин", "гликированный гемоглобин", "hba1c"]),
    "total_protein": dict(group="biochem", names=dict(en="Total protein", ru="Общий белок", kz="Жалпы ақуыз"), unit="g/L", conv={"g/l": 1, "g/dl": 10}, plaus=(30, 120),
                          units=["g/L", "г/л"], syn=["общий белок", "белок общий", "total protein"]),
    "cholesterol": dict(group="biochem", names=dict(en="Total cholesterol", ru="Общий холестерин", kz="Жалпы холестерин"), unit="mmol/L", conv={"mmol/l": 1, "mg/dl": 0.02586},
                        plaus=(1, 20), units=["mmol/L", "ммоль/л", "mg/dL", "мг/дл"], syn=["общий холестерин", "холестерин общий", "холестерин", "общий хс", "cholesterol"]),
    "hdl": dict(group="biochem", names=dict(en="HDL cholesterol", ru="ЛПВП", kz="ЖТЛП (ЛПВП)"), unit="mmol/L", conv={"mmol/l": 1, "mg/dl": 0.02586}, plaus=(0.2, 5),
                units=["mmol/L", "ммоль/л", "mg/dL", "мг/дл"], syn=["холестерин лпвп", "лпвп", "hdl"]),
    "ldl": dict(group="biochem", names=dict(en="LDL cholesterol", ru="ЛПНП", kz="ТТЛП (ЛПНП)"), unit="mmol/L", conv={"mmol/l": 1, "mg/dl": 0.02586}, plaus=(0.2, 15),
                units=["mmol/L", "ммоль/л", "mg/dL", "мг/дл"], syn=["холестерин лпнп", "лпнп", "ldl"]),
    "triglycerides": dict(group="biochem", names=dict(en="Triglycerides", ru="Триглицериды", kz="Триглицеридтер"), unit="mmol/L", conv={"mmol/l": 1, "mg/dl": 0.01129},
                          plaus=(0.1, 30), units=["mmol/L", "ммоль/л", "mg/dL", "мг/дл"], syn=["триглицерид", "тг", "tg"]),
    "apoa1": dict(group="biochem", names=dict(en="Apolipoprotein A1", ru="Аполипопротеин A1", kz="Аполипопротеин A1"), unit="g/L", conv={"g/l": 1}, plaus=(0.3, 4),
                  units=["g/L", "г/л"], syn=["аполипопротеин а1", "аполипопротеин а-1", "апо а1", "apoa1", "apo a1"]),
    "apob": dict(group="biochem", names=dict(en="Apolipoprotein B", ru="Аполипопротеин B", kz="Аполипопротеин B"), unit="g/L", conv={"g/l": 1}, plaus=(0.1, 4),
                 units=["g/L", "г/л"], syn=["аполипопротеин в", "апо в", "apob", "apo b"]),
    "folate": dict(group="biochem", names=dict(en="Folate (folic acid)", ru="Фолиевая кислота", kz="Фолий қышқылы"), unit="ng/mL", conv={"ug/l": 1, "nmol/l": 0.4413},
                   plaus=(0.5, 100), units=["ng/mL", "нг/мл", "nmol/L", "нмоль/л"], syn=["фолиевая кислота", "фолат", "folate", "folic acid"]),
    "tsh": dict(group="thyroid", names=dict(en="TSH", ru="ТТГ", kz="ТТГ (тиреотропты гормон)"), unit="mIU/L", conv={"miu/l": 1}, plaus=(0.001, 100),
                units=["mIU/L", "мМЕ/л", "мкМЕ/мл"], syn=["тиреотропный гормон", "ттг", "tsh"]),
    "ft4": dict(group="thyroid", names=dict(en="Free T4", ru="Т4 свободный", kz="Бос Т4"), unit="pmol/L", conv={"pmol/l": 1, "ng/dl": 12.87}, plaus=(1, 100),
                units=["pmol/L", "пмоль/л", "ng/dL", "нг/дл"], syn=["тироксин свободный", "свободный тироксин", "т4 свободный", "свободный т4", "т4 св", "free t4", "ft4"]),
    "urine_protein": dict(group="urine", names=dict(en="Urine protein", ru="Белок в моче", kz="Зәрдегі ақуыз"), unit="g/L", conv={"g/l": 1, "mg/dl": 0.01, "mg/l": 0.001},
                          plaus=(0, 20), qual=True, units=["g/L", "г/л", "mg/dL", "мг/дл"], syn=["белок в моче", "протеинурия", ("белок", {"urine"}), ("protein", {"urine"}), ("pro", {"urine"})]),
    "urine_wbc": dict(group="urine", names=dict(en="Urine white cells", ru="Лейкоциты в моче", kz="Зәрдегі лейкоциттер"), unit="/hpf", conv={"hpf": 1}, plaus=(0, 200), qual=True,
                      units=["/hpf", "в п/зр"], syn=["лейкоциты в моче", ("лейкоцит", {"urine"}), ("leu", {"urine"})]),
    "urine_rbc": dict(group="urine", names=dict(en="Urine red cells", ru="Эритроциты в моче", kz="Зәрдегі эритроциттер"), unit="/hpf", conv={"hpf": 1}, plaus=(0, 200), qual=True,
                      units=["/hpf", "в п/зр"], syn=["эритроциты в моче", ("эритроцит", {"urine"}), ("кровь", {"urine"}), ("bld", {"urine"}), ("ery", {"urine"})]),
    "urine_nitrite": dict(group="urine", names=dict(en="Urine nitrites", ru="Нитриты в моче", kz="Зәрдегі нитриттер"), unit="", conv={"": 1}, plaus=(0, 1), kind="qualitative", qual=True,
                          units=[""], syn=["нитрит", "nitrite", ("nit", {"urine"})]),
    "urine_sg": dict(group="urine", names=dict(en="Urine specific gravity", ru="Относительная плотность мочи", kz="Зәрдің салыстырмалы тығыздығы"), unit="", conv={"": 1},
                     plaus=(1.0, 1.06), units=[""], syn=["относительная плотность", "удельный вес", "specific gravity", ("плотность", {"urine"}), ("sg", {"urine"})]),
    "ogtt_0": dict(group="ogtt", names=dict(en="OGTT: fasting glucose", ru="ПГТТ: глюкоза натощак", kz="ГТТ: аш қарынға глюкоза"), unit="mmol/L", conv={"mmol/l": 1, "mg/dl": 0.0555},
                   plaus=(1, 35), units=["mmol/L", "ммоль/л", "mg/dL", "мг/дл"], syn=[]),
    "ogtt_1h": dict(group="ogtt", names=dict(en="OGTT: glucose at 1 h", ru="ПГТТ: глюкоза через 1 час", kz="ГТТ: 1 сағаттан кейінгі глюкоза"), unit="mmol/L", conv={"mmol/l": 1, "mg/dl": 0.0555},
                    plaus=(1, 35), units=["mmol/L", "ммоль/л", "mg/dL", "мг/дл"], syn=[]),
    "ogtt_2h": dict(group="ogtt", names=dict(en="OGTT: glucose at 2 h", ru="ПГТТ: глюкоза через 2 часа", kz="ГТТ: 2 сағаттан кейінгі глюкоза"), unit="mmol/L", conv={"mmol/l": 1, "mg/dl": 0.0555},
                    plaus=(1, 35), units=["mmol/L", "ммоль/л", "mg/dL", "мг/дл"], syn=[]),
    "bp_sys": dict(group="exam", names=dict(en="Blood pressure, systolic", ru="Систолическое давление", kz="Систолалық қысым"), unit="mmHg", conv={"mmhg": 1}, plaus=(60, 260),
                   units=["mmHg", "мм рт. ст."], syn=["систолическое", "сад", "sbp"]),
    "bp_dia": dict(group="exam", names=dict(en="Blood pressure, diastolic", ru="Диастолическое давление", kz="Диастолалық қысым"), unit="mmHg", conv={"mmhg": 1}, plaus=(30, 160),
                   units=["mmHg", "мм рт. ст."], syn=["диастолическое", "дад", "dbp"]),
    "weight": dict(group="exam", names=dict(en="Body weight", ru="Масса тела", kz="Дене салмағы"), unit="kg", conv={"kg": 1}, plaus=(30, 200), units=["kg", "кг"],
                   syn=["масса тела", "вес тела", ("вес", None), "weight"]),
    "efw": dict(group="ultrasound", names=dict(en="Estimated fetal weight (EFW)", ru="Предполагаемая масса плода", kz="Ұрықтың болжамды салмағы"), unit="g", conv={"g": 1, "kg": 1000},
                plaus=(50, 6000), units=["g", "г"], syn=["предполагаемая масса плода", "масса плода", "пмп", "efw"]),
    "crl": dict(group="ultrasound", names=dict(en="Crown–rump length (CRL)", ru="КТР", kz="Төбе-құйымшақ өлшемі (КТР)"), unit="mm", conv={"mm": 1, "cm": 10}, plaus=(1, 90),
                units=["mm", "мм"], syn=["копчико-теменной размер", "ктр", "crl"]),
    "nt": dict(group="ultrasound", names=dict(en="Nuchal translucency (NT)", ru="ТВП", kz="Мойын кеңістігінің қалыңдығы (ТВП)"), unit="mm", conv={"mm": 1}, plaus=(0.5, 10),
               units=["mm", "мм"], syn=["толщина воротникового пространства", "твп", ("nt", {"us"})]),
    "bpd": dict(group="ultrasound", names=dict(en="Biparietal diameter (BPD)", ru="БПР", kz="Бипариеталды өлшем (БПР)"), unit="mm", conv={"mm": 1, "cm": 10}, plaus=(10, 110),
                units=["mm", "мм"], syn=["бипариетальный размер", "бпр", "bpd"]),
    "hc": dict(group="ultrasound", names=dict(en="Head circumference (HC)", ru="Окружность головы", kz="Бас шеңбері"), unit="mm", conv={"mm": 1, "cm": 10}, plaus=(50, 400),
               units=["mm", "мм"], syn=["окружность головы", ("ог", {"us"}), ("hc", {"us"})]),
    "ac": dict(group="ultrasound", names=dict(en="Abdominal circumference (AC)", ru="Окружность живота", kz="Іш шеңбері"), unit="mm", conv={"mm": 1, "cm": 10}, plaus=(40, 450),
               units=["mm", "мм"], syn=["окружность живота", ("ож", {"us"}), ("ac", {"us"})]),
    "fl": dict(group="ultrasound", names=dict(en="Femur length (FL)", ru="Длина бедренной кости", kz="Ортан жілік сүйегінің ұзындығы"), unit="mm", conv={"mm": 1, "cm": 10}, plaus=(5, 90),
               units=["mm", "мм"], syn=["длина бедренной кости", "дбк", ("fl", {"us"})]),
    "afi": dict(group="ultrasound", names=dict(en="Amniotic fluid index (AFI)", ru="Индекс амниотической жидкости", kz="Қағанақ суының индексі"), unit="cm", conv={"cm": 1, "mm": 0.1}, plaus=(0, 40),
                units=["cm", "см"], syn=["индекс амниотической жидкости", "иаж", "afi"]),
}
# Pelvic (gynaecological) ultrasound. Reports print no reference intervals, so none are inferred here.
_PELVIS = [
    ("uterus_length", "Uterus length (longitudinal)", "Матка: длина (продольный размер)", "Жатыр: ұзындығы", (15, 150), ["длина матки", "продольный размер матки"]),
    ("uterus_ap", "Uterus anteroposterior size", "Матка: передне-задний размер", "Жатыр: алдыңғы-артқы өлшемі", (10, 120), ["передне-задний размер матки", "переднезадний размер матки"]),
    ("uterus_width", "Uterus width (transverse)", "Матка: ширина (поперечный размер)", "Жатыр: ені", (10, 150), ["ширина матки", "поперечный размер матки"]),
    ("endometrium", "Endometrial thickness (M-echo)", "Эндометрий (М-эхо)", "Эндометрий (М-эхо)", (0.5, 40), ["толщина эндометрия", "м-эхо", "эндометрий"]),
    ("cervix_length", "Cervix length", "Шейка матки: длина", "Жатыр мойны: ұзындығы", (5, 80), ["длина шейки матки"]),
    ("cervix_width", "Cervix width", "Шейка матки: ширина", "Жатыр мойны: ені", (5, 80), ["ширина шейки матки"]),
    ("ovary_r_length", "Right ovary length", "Правый яичник: длина", "Оң аналық без: ұзындығы", (5, 100), ["длина правого яичника"]),
    ("ovary_r_width", "Right ovary width", "Правый яичник: ширина", "Оң аналық без: ені", (5, 100), ["ширина правого яичника"]),
    ("ovary_l_length", "Left ovary length", "Левый яичник: длина", "Сол аналық без: ұзындығы", (5, 100), ["длина левого яичника"]),
    ("ovary_l_width", "Left ovary width", "Левый яичник: ширина", "Сол аналық без: ені", (5, 100), ["ширина левого яичника"]),
    ("follicle_r_mm", "Right ovary: follicle size", "Правый яичник: размер фолликулов", "Оң аналық без: фолликул өлшемі", (1, 60), ["размер фолликулов правого яичника"]),
    ("follicle_l_mm", "Left ovary: follicle size", "Левый яичник: размер фолликулов", "Сол аналық без: фолликул өлшемі", (1, 60), ["размер фолликулов левого яичника"]),
]
for _code, _en, _ru, _kz, _pl, _syn in _PELVIS:
    CATALOG[_code] = dict(group="pelvis", names=dict(en=_en, ru=_ru, kz=_kz), unit="mm", conv={"mm": 1, "cm": 10}, plaus=_pl, units=["mm", "мм", "cm", "см"], syn=_syn)
for _code, _en, _ru, _kz, _syn in (("follicles_r", "Right ovary: follicles per section", "Правый яичник: фолликулов в срезе", "Оң аналық без: кесіндідегі фолликулдар", ["фолликулы правого яичника"]),
                                   ("follicles_l", "Left ovary: follicles per section", "Левый яичник: фолликулов в срезе", "Сол аналық без: кесіндідегі фолликулдар", ["фолликулы левого яичника"])):
    CATALOG[_code] = dict(group="pelvis", names=dict(en=_en, ru=_ru, kz=_kz), unit="", conv={"": 1}, plaus=(0, 60), units=[""], syn=_syn)
RANGE_IS_VALUE = {"urine_wbc", "urine_rbc", "follicles_r", "follicles_l"}  # "2-3 в п/зр", "до 9-10 фолликулов": the upper bound is the value
# Pseudo-test: "АД 120/80" yields bp_sys + bp_dia.
BP_SYNONYMS = ["артериальное давление", "давление", "ад", "bp", "blood pressure"]

# Unit aliases (spaces removed, lower case) -> unit key used in CATALOG[...]["conv"].
UNIT_ALIASES = {
    "g/l": ["g/l", "г/л", "гр/л"], "g/dl": ["g/dl", "г/дл"], "mg/dl": ["mg/dl", "мг/дл", "мг%"], "mg/l": ["mg/l", "мг/л"],
    "mmol/l": ["mmol/l", "ммоль/л", "ммол/л"], "umol/l": ["umol/l", "µmol/l", "μmol/l", "мкмоль/л", "мкм/л", "µмоль/л"],
    "pmol/l": ["pmol/l", "пмоль/л"], "nmol/l": ["nmol/l", "нмоль/л"], "ng/dl": ["ng/dl", "нг/дл"], "u/l": ["u/l", "iu/l", "ui/l", "ед/л", "ме/л", "е/л"],
    "ug/l": ["ug/l", "µg/l", "μg/l", "мкг/л", "ng/ml", "нг/мл"], "miu/l": ["miu/l", "мме/л", "мед/л", "µiu/ml", "μiu/ml", "uiu/ml", "мкме/мл", "мкед/мл"],
    "giga/l": ["giga/l", "тыс/мкл", "тыс./мкл", "10^3/µl", "10^3/мкл", "г/л*"], "tera/l": ["tera/l", "т/л", "t/l", "млн/мкл", "млн./мкл", "10^6/µl", "10^6/мкл"],
    "%": ["%"], "l/l": ["l/l", "л/л"], "fl": ["fl", "фл", "мкм3", "µm3", "мкм^3"], "mmhg": ["mmhg", "ммрт.ст", "ммрт.ст.", "ммртст", "ммрт.ст.."],
    "kg": ["kg", "кг"], "g": ["g", "г", "гр"], "mm": ["mm", "мм"], "cm": ["cm", "см"],
    "hpf": ["/hpf", "hpf", "вп/зр", "вп/зр.", "вп/з", "вп.з.", "вп.зр.", "вполезрения", "п/зр", "п/зр.", "/п.з.", "в/пз"],
}
_UNIT_LOOKUP = {a: k for k, al in UNIT_ALIASES.items() for a in al}

LABS = [(r"демо-лаборатория neooutcome", "Демо-лаборатория NeoOutcome"), (r"neolab", "КДЛ NeoLab (демо)"), (r"демоклиника", "ДемоКлиника (демо)"), (r"олимп|olymp", "Олимп"), (r"инвитро|invitro", "Инвитро"), (r"инвиво|invivo", "Инвиво"), (r"\bkdl\b|\bкдл\b", "KDL"), (r"гемотест|gemotest", "Гемотест"),
        (r"сункар|sunkar", "Сункар"), (r"эмирмед|emirmed", "Эмирмед"), (r"хеликс|helix", "Хеликс"), (r"медлаб|medlab", "Медлаб"), (r"\bsynevo\b|синэво", "Synevo")]

QUAL_PATTERNS = [(r"не\s*обн\w*|отр\w*|negative|\bneg\b|abs\w*|нет\b|\(-\)|^-$", "negative"), (r"след\w*|trace", "trace"),
                 (r"полож\w*|обнаруж\w*|positive|\bpos\b|\+{1,4}", "positive")]

# ----------------------------------------------------------------------------------------------- helpers
_CONFUSABLE = {"а": "a", "е": "e", "о": "o", "р": "p", "с": "c", "х": "x", "у": "y", "к": "k", "м": "m", "т": "t", "н": "h", "в": "b", "і": "i"}
_CONFUSABLE.update({v: k for k, v in list(_CONFUSABLE.items())})


def _fuzzy(word: str) -> str:
    """Regex that accepts Latin/Cyrillic look-alike letters (common in OCR output)."""
    out = []
    for ch in word:
        twin = _CONFUSABLE.get(ch)
        if twin:
            out.append(f"[{re.escape(ch)}{re.escape(twin)}]")
        elif ch in "оo":
            out.append("[оo0]")
        elif ch == " ":
            out.append(r"[\s.]*")
        else:
            out.append(re.escape(ch))
    return "".join(out)


def _syn_pattern(text: str) -> re.Pattern:
    text = text.lower().replace("ё", "е")
    strict = len(text) <= 4 or text.isascii()  # abbreviations must stand alone; Russian stems may take endings
    body = _fuzzy(text)
    return re.compile(rf"(?<![\w]){body}" + (r"(?![\w])" if strict else r"\w*"))


_MATCHERS: list[tuple[str, re.Pattern, set | None, int]] = []
for _code, _t in CATALOG.items():
    for _s in _t["syn"]:
        _txt, _sec = (_s, None) if isinstance(_s, str) else _s
        _MATCHERS.append((_code, _syn_pattern(_txt), _sec, len(_txt)))
for _s in BP_SYNONYMS:
    _MATCHERS.append(("bp", _syn_pattern(_s), None, len(_s)))

_SECTION_KEYS = [("urine", re.compile(r"анализ\w* мочи|\bмоч[аиеу]\b|\bоам\b|urine|urinalysis|\bзәр")),
                 ("blood", re.compile(r"анализ\w* крови|\bоак\b|гемограмм|\bcbc\b|blood count|биохим|қан талда")),
                 ("us", re.compile(r"\bузи\b|ультразвук|фетометр|ultrasound|\bудз\b|эхограф"))]
_OGTT_DOC = re.compile(r"пгтт|\bгтт\b|толерантност\w* к глюкоз|ogtt|glucose tolerance")
_OGTT_STAGE = [(re.compile(r"через\s*2\s*ч\w*|120\s*мин\w*|\b2\s*(?:ч|час\w*|h|hr)\b|2-?й\s*час"), "ogtt_2h"),
               (re.compile(r"через\s*1\s*ч\w*|60\s*мин\w*|\b1\s*(?:ч|час\w*|h|hr)\b|1-?й\s*час"), "ogtt_1h"),
               (re.compile(r"натощак|fasting|\b0\s*(?:мин\w*|ч|h)\b|исходн\w*"), "ogtt_0")]

_EXP = [(re.compile(r"[x×х*]?\s*10\s*(?:\^|\*|e|е)?\s*(?:12|¹²)\s*/\s*[лl]"), " tera/l "),
        (re.compile(r"[x×х*]?\s*10\s*(?:\^|\*|e|е)?\s*(?:9|⁹)\s*/\s*[лl]"), " giga/l "),
        (re.compile(r"[x×х*]?\s*10\s*(?:\^|\*)?\s*3\s*/\s*(?:µl|мкл|ul)"), " giga/l "),
        (re.compile(r"[x×х*]?\s*10\s*(?:\^|\*)?\s*6\s*/\s*(?:µl|мкл|ul)"), " tera/l "),
        (re.compile(r"тыс\.?\s*/\s*мкл"), " giga/l "), (re.compile(r"млн\.?\s*/\s*мкл"), " tera/l "),
        (re.compile(r"мм\s*рт\.?\s*ст\.?"), " mmhg "), (re.compile(r"в\s*п\.?\s*/?\s*зр?\.?(?:ения)?|в\s*поле\s*зрения"), " hpf ")]
_NUM = r"\d+(?:[.,]\d+)?"
_VALUE = re.compile(rf"([<>≤≥]\s*)?({_NUM})")
_RANGE = re.compile(rf"(?:({_NUM})\s*[-–—]\s*({_NUM}))|(?:(<|≤|до|less than|<=)\s*({_NUM}))|(?:(>|≥|от|more than|>=)\s*({_NUM}))")
_DATE = re.compile(r"(?<!\d)(\d{1,2})[./-](\d{1,2})[./-](\d{4}|\d{2})(?!\d)|(?<!\d)(\d{4})-(\d{2})-(\d{2})(?!\d)")
_SPECIMEN_KEYS = re.compile(r"забор|взяти|биоматериал|сдачи|collect|sampl|дата исследования|дата обследования|дата осмотра|дата узи|өнім алын|алынған күн")
_REPORT_KEYS = re.compile(r"выдач|выполнен|результат|отчет|отчёт|печат|report|issued|printed|валидац|дата регистрации")
_BIRTH_KEYS = re.compile(r"рожд|д\.р|г\.р|birth|dob|туған")
# rows that mention a catalogue word but are a different test (MCH "…гемоглобина в эритроците", RDW-SD, differential, ESR …)
_NOT_A_TEST = re.compile(r"\bmchc?\b|средн\w* содержан|средн\w* концентрац|\bmpv\b|\bpdw\b|\bpct\b|тромбокрит|rdw[\s-]*sd|нейтроф|лимфоц|моноц|эозин|базоф|"
                         r"ретикулоцит|\bсоэ\b|\besr\b|ионизир|клиренс|индекс де ритиса|толерантн|т[оө]зімділік")  # OGTT title, not a result


def _f(s: str) -> float:
    return float(s.replace(",", "."))


def unit_key(raw: str, code: str | None = None) -> str | None:
    """Canonical unit key for a printed unit, or None when unknown. Empty string = no unit printed."""
    s = (raw or "").lower().replace("ё", "е")
    for pat, rep in _EXP:  # "×10^9/л", "10⁹/L", "тыс/мкл", "мм рт. ст." …
        s = pat.sub(rep, s)
    s = re.sub(r"\s+", "", s).strip(".,;:()[]")
    if not s:
        return ""
    key = _UNIT_LOOKUP.get(s) or _UNIT_LOOKUP.get(s.rstrip("."))
    if key == "g/l" and code in ("wbc", "plt"):  # Russian blanks write 10^9/L as "Г/л" (giga per litre)
        return "giga/l"
    return key


def convert(code: str, value: float, raw_unit: str) -> tuple[float, bool, bool]:
    """-> (canonical value, converted?, unit understood?). Converts only between units of the same dimension."""
    conv = CATALOG[code]["conv"]
    key = unit_key(raw_unit, code)
    if key is None or key not in conv:
        if key == "" and "" not in conv:
            return value, False, True  # no unit printed: assume the canonical one, flagged by lower confidence
        return value, False, False
    factor = conv[key]
    v = value * factor
    if code == "urine_sg" and v > 100:  # "1025" notation
        v = v / 1000
        return round(v, 3), True, True
    return (round(v, 3) if factor != 1 else value), factor != 1, True


def classify_qual(text: str) -> str | None:
    t = text.strip().lower()
    for pat, label in QUAL_PATTERNS:
        if re.match(pat, t):
            return label
    return None


def parse_date(text: str) -> date | None:
    m = _DATE.search(text)
    if not m:
        return None
    try:
        if m.group(4):
            return date(int(m.group(4)), int(m.group(5)), int(m.group(6)))
        d, mo, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
        if y < 100:
            y += 2000
        return date(y, mo, d)
    except ValueError:
        return None


# ----------------------------------------------------------------------------------------------- parsing
def reference_bounds(text: str | None) -> tuple[float | None, float | None]:
    """Read an explicitly supplied interval; never infer a normal range."""
    if not text:
        return None, None
    text = str(text).strip().replace(",", ".").replace("\u00a0", " ")
    match = re.fullmatch(r"\s*(-?\d+(?:\.\d+)?)\s*[-–—]\s*(-?\d+(?:\.\d+)?)\s*", text)
    if not match:
        upper = re.fullmatch(r"\s*(?:<=?|≤|до)\s*(-?\d+(?:\.\d+)?)\s*", text, flags=re.I)
        lower = re.fullmatch(r"\s*(?:>=?|≥|от)\s*(-?\d+(?:\.\d+)?)\s*", text, flags=re.I)
        if upper:
            return None, float(upper.group(1))
        if lower:
            return float(lower.group(1)), None
        return None, None
    low, high = map(float, match.groups())
    return (low, high) if low <= high else (None, None)


@dataclass
class Extracted:
    code: str
    original_name: str
    value: float | None
    value_text: str | None
    unit: str
    original_value: str
    original_unit: str
    reference_range: str | None = None
    ref_low: float | None = None
    ref_high: float | None = None
    converted: bool = False
    confidence: float = 0.0
    source_line: str | None = None

    def dict(self) -> dict:
        return asdict(self)


@dataclass
class ParseResult:
    observations: list[Extracted] = field(default_factory=list)
    laboratory: str | None = None
    specimen_date: date | None = None
    report_date: date | None = None


def _normalise_line(line: str) -> str:
    s = line.lower().replace("ё", "е").replace(" ", " ")
    s = re.sub(r"[↑↓*!]", " ", s)
    for pat, rep in _EXP:
        s = pat.sub(rep, s)
    return re.sub(r"\s+", " ", s).strip()


def _find_test(s: str, section: str | None) -> tuple[str, int, int] | None:
    best = None
    for code, pat, sections, ln in _MATCHERS:
        if sections and section not in sections:
            continue
        m = pat.search(s)
        if not m:
            continue
        cand = (m.start(), -ln, 0 if sections else 1, code, m.end())  # section-specific wording wins ties ("лейкоциты" in a urine report)
        if best is None or cand < best:
            best = cand
    if not best:
        return None
    return best[3], best[0], best[4]


def _parse_tail(code: str, tail: str, base_conf: float, name: str, line: str) -> list[Extracted]:
    t = CATALOG[code]
    # value position: first number or qualitative word after the name (skip "(HGB)", ":", ", г/л" …)
    vm = _VALUE.search(tail)
    qual = None
    pre = tail[: vm.start()] if vm else tail
    if t.get("qual"):
        qm = re.search(r"(не\s*обн\w*|отр\w*|negative|\bneg\b|abs\w*|\bнет\b|след\w*|trace|полож\w*|обнаруж\w*|positive|\bpos\b|\+{1,4})", pre)
        if qm:
            qual = classify_qual(qm.group(1))
            pre, after = pre[: qm.start()], tail[qm.end():]
    if qual is None and not vm:
        return []
    if qual is not None:
        conf = base_conf
        return [Extracted(code=code, original_name=name, value=None, value_text=qual, unit=t["unit"], original_value=qual, original_unit="",
                          confidence=round(min(0.99, conf), 2), source_line=line[:300])]
    if t.get("kind") == "qualitative":
        return []
    prefix, num = vm.group(1) or "", vm.group(2)
    value = _f(num)
    rest = re.sub(r"^\s*(?:h|l|н|в|выше|ниже|high|low)(?![\w/])", " ", tail[vm.end():])  # high/low flags printed next to values
    original_value = f"{prefix.strip()}{num}"
    # urine cells "2-3 в п/зр": a range in the value position is the value
    rm0 = re.match(rf"\s*[-–]\s*({_NUM})", rest)
    if rm0 and code in RANGE_IS_VALUE:
        original_value = f"{num}-{rm0.group(1)}"
        value = _f(rm0.group(1))
        rest = rest[rm0.end():]
    unit_pre = re.sub(r"[(),:;]", " ", pre).strip()
    # unit right after the value (no digits), then the reference range
    um = re.match(r"\s*([^\d<>≤≥]*?)\s*(?=(?:[<>≤≥(]|до\s|от\s)?\s*\d|$)", rest)
    unit_raw = (um.group(1) if um else "").strip(" ,;:()")
    after_unit = rest[um.end():] if um else rest
    ref_low = ref_high = None
    ref_text = None
    rm = _RANGE.search(after_unit)
    if rm:
        if rm.group(1):
            ref_low, ref_high = _f(rm.group(1)), _f(rm.group(2))
        elif rm.group(4):
            ref_high = _f(rm.group(4))
        elif rm.group(6):
            ref_low = _f(rm.group(6))
        ref_text = rm.group(0).strip()
        trailing = after_unit[rm.end():].strip(" ,;:()")
        if not unit_raw and trailing and not re.search(r"\d", trailing):
            unit_raw = trailing
    if not unit_raw and unit_pre:
        for tok in [unit_pre] + unit_pre.split():
            if unit_key(tok, code) not in (None, ""):
                unit_raw = tok
                break
    # drop words that are clearly not a unit (comments) — keep the first token that is a known unit, if any
    if unit_raw and unit_key(unit_raw, code) is None:
        for tok in unit_raw.split():
            if unit_key(tok, code):
                unit_raw = tok
                break
    canon, converted, understood = convert(code, value, unit_raw)
    conf = base_conf
    if not understood:
        conf -= 0.3
    elif unit_key(unit_raw, code) == "":
        conf -= 0.15
    lo, hi = t["plaus"]
    if not (lo <= canon <= hi):
        conf -= 0.4
    if ref_text:
        conf += 0.05
    unit_out = t["unit"] if understood else unit_raw
    if converted and ref_low is not None:
        ref_low = convert(code, ref_low, unit_raw)[0]
    if converted and ref_high is not None:
        ref_high = convert(code, ref_high, unit_raw)[0]
    pretty = {"giga/l": "10^9/л", "tera/l": "10^12/л", "mmhg": "мм рт. ст.", "hpf": "в п/зр"}
    return [Extracted(code=code, original_name=name, value=canon, value_text=None, unit=unit_out, original_value=original_value, original_unit=pretty.get(unit_raw, unit_raw),
                      reference_range=ref_text, ref_low=ref_low, ref_high=ref_high, converted=converted, confidence=round(max(0.05, min(0.99, conf)), 2), source_line=line[:300])]


def parse_text(text: str, method: str = "text") -> ParseResult:
    """Turn report text into proposed observations. Every value still needs the mother's confirmation."""
    base_conf = {"pdf_text": 0.9, "text": 0.9, "ocr": 0.75, "client_ocr": 0.7}.get(method, 0.7)
    res = ParseResult()
    low_all = text.lower().replace("ё", "е")
    for pat, name in LABS:
        if re.search(pat, low_all):
            res.laboratory = name
            break
    ogtt_doc = bool(_OGTT_DOC.search(low_all))
    section = None
    unlabeled_dates: list[date] = []
    seen: set[str] = set()
    for raw in text.splitlines():
        line = raw.strip()
        if not line:
            continue
        s = _normalise_line(line)
        # dates
        dates = list(_DATE.finditer(s))
        if dates:
            labelled = False
            prev_end = 0
            for dm in dates:  # each date is classified by the words just before it ("Дата забора: … Дата выдачи: …")
                label = s[prev_end:dm.start()]
                prev_end = dm.end()
                d = parse_date(dm.group(0))
                if not d or _BIRTH_KEYS.search(label):
                    labelled = labelled or bool(_BIRTH_KEYS.search(label))
                    continue
                if _SPECIMEN_KEYS.search(label):
                    res.specimen_date = res.specimen_date or d
                    labelled = True
                elif _REPORT_KEYS.search(label):
                    res.report_date = res.report_date or d
                    labelled = True
                elif re.search(r"дата|date|күні", label):
                    unlabeled_dates.append(d)
            if labelled:
                continue
        for sec, pat in _SECTION_KEYS:
            if pat.search(s):
                section = sec
                break
        if _NOT_A_TEST.search(s):
            continue
        found = _find_test(s, section)
        if not found:
            continue
        code, start, end = found
        if code == "glucose" and (section == "urine" or re.search(r"\bмоч|urine|зәр", s)):
            continue
        name = s[start:end].strip()
        tail = s[end:]
        if code in ("glucose",) and ogtt_doc:
            for pat, stage in _OGTT_STAGE:
                if pat.search(tail) or pat.search(s[:start]):
                    code = stage
                    break
        for pat, _ in _OGTT_STAGE:  # time phrases are not values
            tail = pat.sub(" ", tail)
        if code == "bp":
            bm = re.search(r"(\d{2,3})\s*/\s*(\d{2,3})", tail)
            if not bm:
                continue
            for c, v in (("bp_sys", bm.group(1)), ("bp_dia", bm.group(2))):
                val = float(v)
                lo, hi = CATALOG[c]["plaus"]
                conf = base_conf - (0.4 if not lo <= val <= hi else 0)
                res.observations.append(Extracted(code=c, original_name=name, value=val, value_text=None, unit="mmHg", original_value=v, original_unit="mmhg",
                                                  confidence=round(max(0.05, conf), 2), source_line=line[:300]))
            continue
        for obs in _parse_tail(code, tail, base_conf, name, line):
            key = obs.code
            if key in seen:  # the same test twice in one report: keep the first, lower confidence of both is not needed
                continue
            seen.add(key)
            res.observations.append(obs)
    for obs in parse_pelvic_form(text, base_conf):  # protocol layout with several sizes per line
        if obs.code not in seen:
            seen.add(obs.code)
            res.observations.append(obs)
    if res.specimen_date is None and len(set(unlabeled_dates)) == 1:
        res.specimen_date = unlabeled_dates[0]  # a single unlabeled date is proposed; she confirms or corrects it
    return res


# ----------------------------------------------------------------------------------------------- pelvic ultrasound protocol
# The common Kazakhstan protocol puts several measurements on one line («Размеры: продольный 4,7см передне-задний 3,5см
# поперечный 3,8см», «Правый яичник: размеры 3,4*2,8см», «Фолликулы: в одном срезе до 9-10, размерами 0,8см»), which the
# line parser above cannot split. These patterns read that form; values are proposed for confirmation like any other.
_N = r"(\d+(?:[.,]\d+)?)"
_PELVIC = [
    (re.compile(rf"размеры:?\s*продольн\w*\s*{_N}\s*см\W*передне\W*задн\w*\s*{_N}\s*см\W*поперечн\w*\s*{_N}\s*см"), ("uterus_length", "uterus_ap", "uterus_width")),
    (re.compile(rf"размеры\s+шейки:?\s*{_N}\s*[*xх×]\s*{_N}\s*см"), ("cervix_length", "cervix_width")),
]
_OVARY = re.compile(rf"(правый|левый)\s+яичник\w*:?\s*размеры\s*{_N}\s*[*xх×]\s*{_N}\s*см")
_FOLL = re.compile(rf"фолликул\w*:?\s*в\s*одном\s*срезе\s*до\s*(\d+)(?:\s*[-–]\s*(\d+))?[^\n]{{0,60}}?размерами\s*{_N}\s*см")


def parse_pelvic_form(text: str, base_conf: float) -> list[Extracted]:
    t = text.lower().replace("ё", "е")
    if "малого таза" not in t and "малом тазу" not in t:
        return []
    out: list[Extracted] = []

    def add(code, raw, line, cm=True, original=None):
        v = _f(raw) * (10 if cm else 1)
        lo, hi = CATALOG[code]["plaus"]
        out.append(Extracted(code=code, original_name=line.split(":")[0].strip()[:60], value=round(v, 3), value_text=None, unit=CATALOG[code]["unit"],
                             original_value=original or raw, original_unit="см" if cm else "", converted=cm,
                             confidence=round(base_conf - (0 if lo <= v <= hi else 0.4), 2), source_line=line[:300]))

    for pat, codes in _PELVIC:
        m = pat.search(t)
        if m:
            for code, raw in zip(codes, m.groups()):
                add(code, raw, m.group(0))
    ovaries = list(_OVARY.finditer(t))
    for i, m in enumerate(ovaries):
        side = "r" if m.group(1).startswith("прав") else "l"
        add(f"ovary_{side}_length", m.group(2), m.group(0))
        add(f"ovary_{side}_width", m.group(3), m.group(0))
        segment = t[m.end(): ovaries[i + 1].start() if i + 1 < len(ovaries) else len(t)]
        f = _FOLL.search(segment)
        if f:
            add(f"follicles_{side}", f.group(2) or f.group(1), f.group(0), cm=False, original=f"{f.group(1)}-{f.group(2)}" if f.group(2) else f.group(1))
            add(f"follicle_{side}_mm", f.group(3), f.group(0))
    return out


# ----------------------------------------------------------------------------------------------- text extraction
SUPPORTED = {"application/pdf": "pdf", "image/jpeg": "image", "image/png": "image", "image/webp": "image", "text/plain": "text"}
EXT = {".pdf": "application/pdf", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".txt": "text/plain"}


def sniff_type(data: bytes, declared: str | None, filename: str) -> str | None:
    """Content type from magic bytes (declared type and extension are only hints)."""
    if data.startswith(b"%PDF"):
        return "application/pdf"
    if data[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    if data.startswith(b"\x89PNG"):
        return "image/png"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    hint = (declared or "").split(";")[0].strip().lower()
    ext = "." + filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if hint == "text/plain" or EXT.get(ext) == "text/plain":
        try:
            data.decode("utf-8")
            return "text/plain"
        except UnicodeDecodeError:
            try:
                data.decode("cp1251")
                return "text/plain"
            except UnicodeDecodeError:
                return None
    return None


def ocr_available() -> bool:
    if not shutil.which("tesseract"):
        return False
    try:
        import pytesseract  # noqa: F401
        return True
    except ImportError:
        return False


def _ocr_image(img) -> str:
    import pytesseract
    from PIL import ImageOps
    img = ImageOps.exif_transpose(img).convert("L")
    if img.width < 1600:  # small phone crops read better upscaled
        k = 1600 / img.width
        img = img.resize((1600, int(img.height * k)))
    try:
        langs = set(pytesseract.get_languages(config=""))
    except Exception:
        langs = {"eng"}
    lang = "+".join(x for x in ("rus", "kaz", "eng") if x in langs) or "eng"
    return pytesseract.image_to_string(img, lang=lang, config="--psm 6")


def extract_text(data: bytes, content_type: str) -> tuple[str, str, str | None]:
    """-> (text, method, message). Never raises on unreadable content: returns message instead."""
    kind = SUPPORTED.get(content_type)
    if kind == "text":
        try:
            return data.decode("utf-8"), "text", None
        except UnicodeDecodeError:
            return data.decode("cp1251", errors="replace"), "text", None
    if kind == "pdf":
        from pypdf import PdfReader
        try:
            reader = PdfReader(io.BytesIO(data))
            pages = []
            for p in reader.pages:
                try:
                    pages.append(p.extract_text(extraction_mode="layout") or "")
                except Exception:
                    pages.append(p.extract_text() or "")
            text = "\n".join(pages)
        except Exception:
            return "", "none", "no_text"
        if len(re.sub(r"\s", "", text)) >= 20:
            return text, "pdf_text", None
        # scanned PDF: OCR the page images
        if not ocr_available():
            return "", "none", "ocr_unavailable"
        from PIL import Image
        chunks = []
        for p in reader.pages:
            for im in getattr(p, "images", []):
                try:
                    chunks.append(_ocr_image(Image.open(io.BytesIO(im.data))))
                except Exception:
                    continue
        text = "\n".join(chunks)
        return (text, "ocr", None) if text.strip() else ("", "none", "no_text")
    if kind == "image":
        if not ocr_available():
            return "", "none", "ocr_unavailable"
        from PIL import Image
        try:
            text = _ocr_image(Image.open(io.BytesIO(data)))
        except Exception:
            return "", "none", "no_text"
        return (text, "ocr", None) if text.strip() else ("", "none", "no_text")
    return "", "none", "no_text"


# ----------------------------------------------------------------------------------------------- rules
# Draft thresholds (docs/maternal_labs.md). Independent of any model; evaluated on the latest confirmed values.
def evaluate_rules(series: dict[str, list[dict]]) -> list[dict]:
    """series: code -> points sorted by date ascending, each {date, ga_days, value, value_text, unit, ref_low, ref_high}."""
    alerts: list[dict] = []
    flagged: set[str] = set()

    def last(code):
        pts = [p for p in series.get(code, []) if p.get("value") is not None or p.get("value_text")]
        return pts[-1] if pts else None

    def add(rule, test, level, p, **extra):
        alerts.append({"code": rule, "test": test, "level": level, "value": p.get("value") if p.get("value") is not None else p.get("value_text"),
                       "unit": p.get("unit", ""), "date": p.get("date"), "ga_days": p.get("ga_days"), **extra})
        flagged.add(test)

    sys_p, dia_p = last("bp_sys"), last("bp_dia")
    if sys_p or dia_p:
        latest = max([p["date"] for p in (sys_p, dia_p) if p])
        s = sys_p["value"] if sys_p and sys_p["date"] == latest else None
        d = dia_p["value"] if dia_p and dia_p["date"] == latest else None
        p = sys_p if s is not None else dia_p
        extra = {"systolic": s, "diastolic": d}
        if (s is not None and s >= 160) or (d is not None and d >= 110):
            add("bp_severe", "bp_sys", "urgent", p, **extra)
        elif (s is not None and s >= 140) or (d is not None and d >= 90):
            add("bp_high", "bp_sys", "discuss", p, **extra)
        if "bp_sys" in flagged:
            flagged.add("bp_dia")

    up = last("urine_protein")
    if up and ((up.get("value") is not None and up["value"] >= 0.3) or up.get("value_text") == "positive"):
        add("urine_protein", "urine_protein", "discuss", up)

    hb_pts = [p for p in series.get("hb", []) if p.get("value") is not None]
    if hb_pts:
        cur = hb_pts[-1]
        if cur["value"] < 110:
            add("hb_low", "hb", "discuss", cur)
        if len(hb_pts) >= 2 and hb_pts[-2]["value"] - cur["value"] >= 20:
            add("hb_drop", "hb", "discuss", cur, previous=hb_pts[-2]["value"], delta=round(cur["value"] - hb_pts[-2]["value"], 1))

    for code, rule, thr in (("ogtt_0", "glucose_fasting", 5.1), ("ogtt_1h", "ogtt_1h", 10.0), ("ogtt_2h", "ogtt_2h", 8.5), ("glucose", "glucose_high", 7.0)):
        p = last(code)
        if p and p.get("value") is not None and p["value"] >= thr:
            add(rule, code, "discuss", p)

    p = last("plt")
    if p and p.get("value") is not None and p["value"] < 100:
        add("plt_low", "plt", "discuss", p)

    for code in series:
        if code in flagged:
            continue
        p = last(code)
        if not p or p.get("value") is None:
            continue
        lo, hi = p.get("ref_low"), p.get("ref_high")
        if (lo is not None and p["value"] < lo) or (hi is not None and p["value"] > hi):
            add("out_of_range", code, "info", p, ref_low=lo, ref_high=hi)

    order = {"urgent": 0, "discuss": 1, "info": 2}
    alerts.sort(key=lambda a: order[a["level"]])
    return alerts


def catalog_public() -> list[dict]:
    return [{"code": c, "group": t["group"], "names": t["names"], "unit": t["unit"], "kind": t.get("kind", "numeric"), "units": t["units"],
             "qualitative": bool(t.get("qual"))} for c, t in CATALOG.items()]
