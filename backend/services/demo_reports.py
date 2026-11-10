"""Realistic demo documents in the layout of real Kazakhstan reports, with fictional data and a fictional lab/clinic.

* lab report — layout of a KDL-type blank (bilingual header grid, results table with reference interval and comment);
* pelvic / fetal ultrasound — layout of a typical ultrasound protocol (printed labels, hand-filled values);
* cardiology conclusion (.docx) — the «Медицинское заключение» template that CardioAI was trained on.
Every call takes a random generator, so each example has its own plausible values. No real laboratory, clinic, doctor or
patient appears: lab «NeoLab», clinic «ДемоКлиника», patient «ДЕМО ПАЦИЕНТ», and every page is marked «ПРИМЕР».
"""
from __future__ import annotations

import io
import random
import zipfile
from datetime import date, datetime, timedelta
from xml.sax.saxutils import escape

SERIF = "/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf"
SERIF_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf"


def _fonts():
    from pathlib import Path

    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont

    from services.patient_card import register_pdf_fonts
    sans, sans_bold = register_pdf_fonts()
    serif, serif_bold = sans, sans_bold
    if Path(SERIF).exists() and Path(SERIF_BOLD).exists():
        if "NeoSerif" not in pdfmetrics.getRegisteredFontNames():
            pdfmetrics.registerFont(TTFont("NeoSerif", SERIF))
            pdfmetrics.registerFont(TTFont("NeoSerifBold", SERIF_BOLD))
        serif, serif_bold = "NeoSerif", "NeoSerifBold"
    return sans, sans_bold, serif, serif_bold


def ru(d: date) -> str:
    return d.strftime("%d.%m.%Y")


def num(v: float, nd: int) -> str:
    return f"{v:.{nd}f}".replace(".", ",")


def _watermark(c, w, h):
    c.saveState()
    c.setFillColorRGB(0.88, 0.9, 0.92)
    c.setFont("Helvetica-Bold", 72)
    c.translate(w / 2, h / 2)
    c.rotate(35)
    c.drawCentredString(0, 0, "DEMO")
    c.restoreState()


# ----------------------------------------------------------------------------------------------- lab reports
# (name as printed, unit, reference text, low, high, decimals, generator(rng) -> value)
LAB_PANELS = {
    "cbc": ("ЖАЛПЫ ҚАН ТАЛДАУЫ / ОБЩИЙ АНАЛИЗ КРОВИ", "Цельная кровь (ЭДТА)", [
        ("Гемоглобин (HGB)", "г/л", "110 - 150", 110, 150, 0, lambda r: r.gauss(117, 9)),
        ("Эритроциты (RBC)", "10^12/л", "3,50 - 5,00", 3.5, 5.0, 2, lambda r: r.gauss(3.95, 0.25)),
        ("Лейкоциты (WBC)", "10^9/л", "4,00 - 11,00", 4.0, 11.0, 2, lambda r: r.gauss(9.0, 1.9)),
        ("Тромбоциты (PLT)", "10^9/л", "150 - 400", 150, 400, 0, lambda r: r.gauss(235, 45)),
        ("Гематокрит (HCT)", "%", "33,0 - 45,0", 33, 45, 1, lambda r: r.gauss(35.2, 2.6)),
        ("Средний объем эритроцита (MCV)", "фл", "80,0 - 100,0", 80, 100, 1, lambda r: r.gauss(89, 4)),
    ]),
    "biochem": ("БИОХИМИЯЛЫҚ ҚАН ТАЛДАУЫ / БИОХИМИЧЕСКИЙ АНАЛИЗ КРОВИ", "Сыворотка", [
        ("Мочевина", "ммоль/л", "2,80 - 7,20", 2.8, 7.2, 2, lambda r: r.gauss(3.7, 0.8)),
        ("Креатинин", "мкмоль/л", "45,00 - 84,00", 45, 84, 2, lambda r: r.gauss(60, 10)),
        ("Мочевая кислота", "мкмоль/л", "154,7 - 357,0", 154.7, 357, 1, lambda r: r.gauss(245, 50)),
        ("Глюкоза", "ммоль/л", "4,10 - 5,90", 4.1, 5.9, 2, lambda r: r.gauss(4.6, 0.45)),
        ("Аланинаминотрансфераза (АЛТ)", "Ед/л", "< 35,00", None, 35, 2, lambda r: abs(r.gauss(14, 7)) + 4),
        ("Аспартатаминотрансфераза (АСТ)", "Ед/л", "< 35", None, 35, 2, lambda r: abs(r.gauss(19, 6)) + 6),
        ("Гликозилированный гемоглобин", "%", "4,80 - 5,90", 4.8, 5.9, 2, lambda r: r.gauss(5.3, 0.22)),
        ("Аполипопротеин А1", "г/л", "1,08 - 2,25", 1.08, 2.25, 2, lambda r: r.gauss(1.85, 0.25)),
        ("Аполипопротеин В", "г/л", "0,60 - 1,17", 0.6, 1.17, 2, lambda r: r.gauss(0.86, 0.17)),
        ("Фолиевая кислота", "нг/мл", "3,10 - 20,50", 3.1, 20.5, 2, lambda r: r.gauss(11, 4.5)),
        ("Ферритин", "нг/мл", "10,00 - 120,00", 10, 120, 2, lambda r: r.lognormvariate(2.9, 0.45)),
    ]),
    "ogtt": ("ГЛЮКОЗАҒА ТӨЗІМДІЛІК ТЕСТІ / ПЕРОРАЛЬНЫЙ ГЛЮКОЗОТОЛЕРАНТНЫЙ ТЕСТ (ПГТТ), 75 г", "Плазма (фторид натрия)", [
        ("Глюкоза натощак", "ммоль/л", "< 5,10", None, 5.1, 2, lambda r: r.gauss(4.65, 0.4)),
        ("Глюкоза через 1 час", "ммоль/л", "< 10,00", None, 10.0, 2, lambda r: r.gauss(8.3, 1.4)),
        ("Глюкоза через 2 часа", "ммоль/л", "< 8,50", None, 8.5, 2, lambda r: r.gauss(6.9, 1.1)),
    ]),
    "thyroid": ("ҚАЛҚАНША БЕЗ ГОРМОНДАРЫ / ГОРМОНЫ ЩИТОВИДНОЙ ЖЕЛЕЗЫ", "Сыворотка", [
        ("ТТГ", "мМЕ/л", "0,40 - 4,00", 0.4, 4.0, 2, lambda r: abs(r.gauss(2.0, 0.7)) + 0.2),
        ("Т4 свободный", "пмоль/л", "10,00 - 22,00", 10, 22, 2, lambda r: r.gauss(13.6, 1.9)),
    ]),
}


def _urine_rows(r: random.Random) -> list[tuple]:
    protein = r.choices(["не обнаружен", "следы"], [0.85, 0.15])[0]
    sg = r.randint(1012, 1026)
    w = r.choice(["0-1", "1-2", "2-3", "3-4", "4-6"])
    e = r.choice(["0-1", "0-1", "0-2", "1-2"])
    return [("Относительная плотность", str(sg), "", "1010 - 1025", "повышено" if sg > 1025 else ""),
            ("Белок", protein, "", "не обнаружен", "" if protein == "не обнаружен" else "обнаружены следы"),
            ("Лейкоциты", w, "в п/зр", "0 - 5", "повышено" if int(w.split("-")[1]) > 5 else ""),
            ("Эритроциты", e, "в п/зр", "0 - 2", "")]


def lab_rows(kind: str, r: random.Random) -> tuple[str, str, list[tuple]]:
    """-> (title, biomaterial, rows of (name, value text, unit, reference text, comment))."""
    if kind == "urine":
        return "ЖАЛПЫ ЗӘР ТАЛДАУЫ / ОБЩИЙ АНАЛИЗ МОЧИ", "Моча (утренняя порция)", _urine_rows(r)
    title, material, tests = LAB_PANELS[kind]
    rows = []
    for name, unit, ref, lo, hi, nd, gen in tests:
        v = round(max(gen(r), 0.01), nd)
        comment = "понижено" if lo is not None and v < lo else "повышено" if hi is not None and v > hi else ""
        rows.append((name, num(v, nd) if nd else str(int(v)), unit, ref, comment))
    return title, material, rows


def render_lab_pdf(kind: str, specimen: date, r: random.Random, rows=None) -> bytes:
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.pdfgen import canvas
    from reportlab.platypus import Table, TableStyle

    sans, bold, serif, serif_bold = _fonts()
    title, material, gen_rows = lab_rows(kind, r) if rows is None else (rows[0], rows[1], rows[2])
    req = f"{r.randint(10_000_000, 99_999_999)}"
    taken = datetime.combine(specimen, datetime.min.time()) + timedelta(hours=8, minutes=r.randint(0, 50))
    registered = taken - timedelta(minutes=r.randint(1, 5))
    received = taken + timedelta(hours=3, minutes=r.randint(0, 50))
    done = received + timedelta(minutes=r.randint(15, 70))
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    c.setTitle(f"NeoLab DEMO {kind}")
    w, h = A4
    _watermark(c, w, h)
    teal = colors.HexColor("#0E6E73")
    # header: lab "logo" (fictional) + contacts
    c.setFillColor(teal)
    c.setFont(sans, 6.5)
    c.drawString(40, h - 42, "клиникалық-диагностикалық зертханалар")
    c.setFont(bold, 22)
    c.drawString(40, h - 64, "NeoLab")
    c.setFont(sans, 6.5)
    c.drawString(40, h - 74, "клинико-диагностические лаборатории")
    c.setFillColor(colors.black)
    c.setFont(sans, 7.5)
    c.drawRightString(w - 40, h - 44, "ТОО «КДЛ NeoLab» (вымышленная, ДЕМО), тел.: +7 (700) 000-00-00")
    c.setFont(bold, 9)
    c.drawRightString(w - 40, h - 60, "www.neolab.example")
    c.setFont(sans, 7)
    c.drawRightString(w - 40, h - 72, "e-mail: demo@neolab.example")
    c.setFont(bold, 8)
    c.setFillColor(colors.HexColor("#B42318"))
    c.drawString(40, h - 88, "ПРИМЕР · сгенерированный демонстрационный бланк · не является медицинским документом")
    c.setFillColor(colors.black)
    # patient / request grid (bilingual, as on real blanks)
    s = 7
    grid = [
        ["Тегі А.Ә.:\nФамилия И.О.:", "ДЕМО ПАЦИЕНТ", "ЖСН:\nИИН:", "— (демо)"],
        ["Жолдама №:\n№ заявки:", req, "Жынысы:\nПол:", "Ж"],
        ["Жолдаманың тіркелген:\nЗаявка зарегистрирована:", registered.strftime("%d.%m.%Y %H:%M"), "Биоматериалды алу орны:\nМесто забора биоматериала:", "МЦ «ДемоКлиника»"],
        ["Биоматериал:", material, "Зертханаға түскен:\nПоступление в лабораторию:", received.strftime("%d.%m.%Y %H:%M")],
    ]
    t = Table(grid, colWidths=[110, 140, 125, 140])
    t.setStyle(TableStyle([("FONT", (0, 0), (-1, -1), sans, s), ("FONT", (1, 0), (1, -1), bold, 8), ("FONT", (3, 0), (3, -1), bold, 8),
                           ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#9AA5B1")), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                           ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#F2F4F7")), ("BACKGROUND", (2, 0), (2, -1), colors.HexColor("#F2F4F7"))]))
    tw, th = t.wrapOn(c, w, h)
    y = h - 100 - th
    t.drawOn(c, 40, y)
    y -= 16
    c.setFont(sans, 8)
    c.drawString(40, y, f"Забор биоматериала / Биоматериалды алу: {taken.strftime('%d.%m.%Y %H:%M')}")
    y -= 18
    c.setFont(bold, 10)
    c.drawCentredString(w / 2, y, title)
    y -= 8
    # results table
    head = ["", "Компонент", "Нәтиже\nРезультат", "Комментарии", "Мөлшері\nРеф. интервал", "Выполнено"]
    body = [[str(i + 1), name, f"{val} {unit}".strip(), comment, ref, done.strftime("%d.%m.%Y %H:%M")] for i, (name, val, unit, ref, comment) in enumerate(gen_rows)]
    rt = Table([head] + body, colWidths=[16, 165, 85, 70, 85, 84])
    st = [("FONT", (0, 0), (-1, 0), bold, 7.5), ("FONT", (0, 1), (-1, -1), sans, 8), ("ALIGN", (2, 0), (-1, -1), "CENTER"),
          ("LINEBELOW", (0, 0), (-1, 0), 0.6, colors.HexColor("#667085")), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
          ("TOPPADDING", (0, 1), (-1, -1), 4), ("BOTTOMPADDING", (0, 1), (-1, -1), 4)]
    for i in range(1, len(body) + 1):
        if i % 2:
            st.append(("BACKGROUND", (0, i), (-1, i), colors.HexColor("#F2F4F7")))
        if body[i - 1][3]:
            st.append(("FONT", (2, i), (2, i), bold, 8))
    rt.setStyle(TableStyle(st))
    _, rh = rt.wrapOn(c, w, h)
    y -= rh
    rt.drawOn(c, 40, y)
    y -= 26
    c.setFont(sans, 7.5)
    c.drawString(40, y, "Қолы (подписи): ______________   ______________")
    c.drawRightString(w - 40, y, f"Отчет о результатах сформирован: {(done + timedelta(minutes=r.randint(5, 40))).strftime('%d.%m.%Y %H:%M')}")
    y -= 22
    c.setFont(sans, 6.5)
    left = ["Әртүрлі әдіс немесе жабдық қолданылып жүргізілген бірдей", "зерттеулердің нәтижелерінде айырмашылықтар болуы мүмкін.",
            "Зерттеу нәтижелері өз бетінен қандай да бір сырқаттың бар", "екенінің дәлелі болып табылмайды."]
    right = ["Результаты одних и тех же исследований, проведенных с применением", "разных методик или оборудования, могут различаться.",
             "Результаты исследований сами по себе не являются однозначным", "свидетельством наличия или отсутствия каких-либо заболеваний."]
    for i, (a, b) in enumerate(zip(left, right)):
        c.drawString(40, y - i * 9, a)
        c.drawString(w / 2 + 5, y - i * 9, b)
    c.setFont(sans, 7)
    c.drawRightString(w - 40, 40, f"Распечатано: {done.strftime('%d.%m.%Y %H:%M')} · стр. 1 из 1")
    c.showPage()
    c.save()
    return buf.getvalue()


# ----------------------------------------------------------------------------------------------- ultrasound protocols
def pelvic_values(r: random.Random) -> dict:
    fr, fl = r.randint(5, 12), r.randint(5, 12)
    multi = fr >= 10 and fl >= 9
    return {"ul": r.randint(44, 51) / 10, "uap": r.randint(32, 38) / 10, "uw": r.randint(36, 42) / 10, "endo": r.randint(40, 110) / 10,  # endometrium in mm
            "cl": r.randint(23, 29) / 10, "cw": r.randint(20, 25) / 10, "rl": r.randint(29, 37) / 10, "rw": r.randint(21, 29) / 10,
            "rn": f"{fr}", "rmm": r.randint(4, 10) / 10, "ll": r.randint(29, 37) / 10, "lw": r.randint(21, 29) / 10,
            "ln": f"{fl - 1}-{fl}" if r.random() < 0.3 else f"{fl}", "lmm": r.randint(4, 10) / 10, "lmp_days": r.randint(3, 14),
            "conclusion": "Мультифолликулярная структура яичников." if multi else "Эхографических признаков патологии органов малого таза не выявлено.",
            "recommendation": "консультация гинеколога" if multi else "плановое наблюдение"}


def _cm(v: float) -> str:
    s = f"{v:.2f}".rstrip("0").rstrip(".")
    return s.replace(".", ",") + "см"


def render_pelvic_pdf(day: date, v: dict) -> bytes:
    """Layout of a typical pelvic ultrasound protocol: printed labels (serif), hand-filled values (slanted)."""
    from reportlab.lib.pagesizes import A4
    from reportlab.pdfgen import canvas

    sans, bold, serif, serif_bold = _fonts()
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    c.setTitle("ДемоКлиника · УЗИ малого таза (ПРИМЕР)")
    w, h = A4
    _watermark(c, w, h)

    def label(x, y, text, size=11.5, b=False):
        c.setFont(serif_bold if b else serif, size)
        c.drawString(x, y, text)
        return x + c.stringWidth(text, serif_bold if b else serif, size) + 4

    def hand(x, y, text, size=11.5):
        c.saveState()
        c.translate(x, y)
        c.skew(0, 12)  # slanted like handwriting filled into the form
        c.setFillColorRGB(0.1, 0.12, 0.35)
        c.setFont(serif, size)
        c.drawString(0, 0, text)
        c.restoreState()
        return x + c.stringWidth(text, serif, size) + 6

    c.setFont(sans, 10)
    c.drawString(50, h - 40, "г. Демоград, ул. Примерная, 1 · «ДемоКлиника» (вымышленная)")
    c.drawRightString(w - 45, h - 40, "кабинет 000")
    c.setFillColorRGB(0.7, 0.14, 0.1)
    c.setFont(bold, 8)
    c.drawString(50, h - 54, "ПРИМЕР · сгенерированный протокол · не является медицинским документом")
    c.setFillColorRGB(0, 0, 0)
    c.setFont(serif_bold, 14.5)
    c.drawCentredString(w / 2, h - 80, "УЛЬТРАЗВУКОВОЕ  ИССЛЕДОВАНИЕ ОРГАНОВ  МАЛОГО ТАЗА")
    c.setFont(serif, 11.5)
    c.drawCentredString(w / 2 - 50, h - 96, "(аппарат УЗИ ,  к/в  3,5  МГц)")
    hand(w / 2 + 52, h - 96, "Трансабдоминально")
    y = h - 122
    x = label(50, y, "Дата:"); x = hand(x, y, ru(day)); x = label(x + 20, y, "ФИО:"); hand(x, y, "Демо пациент")
    x = label(400, y, "Год рождения:"); hand(x, y, "—")
    rows = [
        [("Матка:", "не увеличена"), ("Расположение:", "Anteflexio", 300)],
        [("Размеры: продольный", _cm(v["ul"])), ("передне-задний", _cm(v["uap"]), 270), ("поперечный", _cm(v["uw"]), 420)],
        [("Контуры:", "ровные, чёткие")],
        [("Миометрий:", "однородный")],
        None,
        [("М-ЭХО:  эндометрий", _cm(v["endo"] / 10)), ("Последняя менструация:", (day - timedelta(days=v["lmp_days"])).strftime("%d/%m/%Y"), 330)],
        [("Эхогенность:", "норма")],
        [("Полость матки:", "сомкнута")],
        [("Размеры  шейки:", f"{_cm(v['cl'])[:-2]}*{_cm(v['cw'])}"), ("кисты:", "нет", 300)],
        [("Цервикальный  канал:", "не расширен")],
        [("Правый  яичник: размеры", f"{_cm(v['rl'])[:-2]}*{_cm(v['rw'])}"), (", расположен", "обычно", 330)],
        [("Фолликулы: в одном срезе до", v["rn"]), (", размерами", _cm(v["rmm"]), 330)],
        [("Левый яичник: размеры", f"{_cm(v['ll'])[:-2]}*{_cm(v['lw'])}"), (", расположен", "обычно", 330)],
        [("Фолликулы: в одном срезе до", v["ln"]), (", размерами", _cm(v["lmm"]), 330)],
        [("Маточная труба:", "не расширена")],
        [("Параметрий: варикоз", "нет")],
        [("Лимфоузлы:", "не визуализируется")],
        [("Свободная жидкость в малом тазу", "нет")],
        [("ВМК:", "")],
        [("Дополнительно:", "")],
    ]
    y -= 20
    for row in rows:
        if row is None:
            y -= 22
            continue
        for item in row:
            text, val = item[0], item[1]
            x0 = item[2] if len(item) > 2 else 50
            x = label(x0, y, text, b=text.startswith(("Правый", "Левый")))
            if val:
                hand(x, y, val)
        y -= 19
    y -= 40
    x = label(50, y, "Заключение:", 13, b=True)
    words, line_, lines = v["conclusion"].split(), "", []
    for word in words:  # wrap the hand-written conclusion inside the page
        trial = (line_ + " " + word).strip()
        if c.stringWidth(trial, serif, 12) > w - x - 50 and line_:
            lines.append(line_); line_ = word
        else:
            line_ = trial
    lines.append(line_)
    for i, text in enumerate(lines):
        hand(x if i == 0 else 60, y - i * 18, text, 12)
    y -= 70 + 18 * (len(lines) - 1)
    x = label(45, y, "Рекомендации:"); hand(x, y, v["recommendation"])
    y -= 60
    x = label(300, y, "Врач:"); x = hand(x, y, "Демо В. В."); label(x + 15, y, "Подпись: ______________")
    c.setFont(serif, 8.5)
    c.drawCentredString(w / 2, 50, "данное заключение не является диагнозом, и должно быть интерпретировано лечащим врачом")
    c.showPage()
    c.save()
    return buf.getvalue()


def fetal_values(r: random.Random) -> dict:
    return {"bpd": r.randint(76, 82), "hc": r.randint(278, 296), "ac": r.randint(260, 282), "fl": r.randint(56, 62), "efw": r.randint(1540, 1820),
            "afi": round(r.uniform(9, 18), 1), "fhr": r.randint(132, 156), "placenta": r.choice(["по задней стенке", "по передней стенке", "в дне матки"])}


def render_fetal_pdf(day: date, v: dict) -> bytes:
    from reportlab.lib.pagesizes import A4
    from reportlab.pdfgen import canvas

    sans, bold, serif, serif_bold = _fonts()
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    c.setTitle("ДемоКлиника · УЗИ плода (ПРИМЕР)")
    w, h = A4
    _watermark(c, w, h)

    def line(y, lab, val, x=50):
        c.setFont(serif, 11.5)
        c.drawString(x, y, lab)
        xx = x + c.stringWidth(lab, serif, 11.5) + 5
        c.saveState(); c.translate(xx, y); c.skew(0, 12); c.setFillColorRGB(0.1, 0.12, 0.35); c.setFont(serif, 11.5); c.drawString(0, 0, val); c.restoreState()

    c.setFont(sans, 10)
    c.drawString(50, h - 40, "г. Демоград, ул. Примерная, 1 · «ДемоКлиника» (вымышленная)")
    c.drawRightString(w - 45, h - 40, "кабинет 000")
    c.setFillColorRGB(0.7, 0.14, 0.1); c.setFont(bold, 8); c.drawString(50, h - 54, "ПРИМЕР · сгенерированный протокол · не является медицинским документом"); c.setFillColorRGB(0, 0, 0)
    c.setFont(serif_bold, 14.5); c.drawCentredString(w / 2, h - 80, "УЛЬТРАЗВУКОВОЕ ИССЛЕДОВАНИЕ ПЛОДА (III триместр)")
    y = h - 112
    line(y, "Дата:", ru(day)); line(y, "ФИО:", "Демо пациент", 230)
    items = [("Плод:", "один, живой"), ("Предлежание:", "головное"), ("Сердцебиение плода:", f"ритмичное, {v['fhr']} уд/мин"),
             ("Бипариетальный размер (БПР):", f"{v['bpd']} мм"), ("Окружность головы:", f"{v['hc']} мм"), ("Окружность живота:", f"{v['ac']} мм"),
             ("Длина бедренной кости:", f"{v['fl']} мм"), ("Предполагаемая масса плода:", f"{v['efw']} г"),
             ("Плацента:", v["placenta"] + ", структура не изменена"), ("Индекс амниотической жидкости:", f"{num(v['afi'], 1)} см"),
             ("Шейка матки:", "длина достаточная, внутренний зев сомкнут")]
    y -= 30
    for lab, val in items:
        line(y, lab, val)
        y -= 22
    y -= 20
    c.setFont(serif_bold, 13); c.drawString(50, y, "Заключение:")
    line(y, "", "Беременность III триместра. Фетометрия соответствует сроку.", 140)
    y -= 50
    line(y, "Врач:", "Демо В. В.", 300); c.setFont(serif, 11.5); c.drawString(420, y, "Подпись: ________")
    c.setFont(serif, 8.5); c.drawCentredString(w / 2, 50, "данное заключение не является диагнозом, и должно быть интерпретировано лечащим врачом")
    c.showPage(); c.save()
    return buf.getvalue()


# ----------------------------------------------------------------------------------------------- cardiology conclusion (.docx)
PROFILES = {
    "normal": {"title": "без АГ", "sys": (104, 128), "dia": (64, 82), "bmi": (19.5, 25), "chol": (4.0, 5.2), "glu": (4.0, 5.2), "stage": 0},
    "ag1": {"title": "АГ 1 степени", "sys": (140, 158), "dia": (90, 99), "bmi": (24, 30), "chol": (4.8, 6.0), "glu": (4.6, 5.8), "stage": 1},
    "ag2": {"title": "АГ 2 степени", "sys": (160, 178), "dia": (100, 109), "bmi": (26, 33), "chol": (5.2, 6.6), "glu": (5.0, 6.4), "stage": 2},
    "ag3": {"title": "АГ 3 степени", "sys": (180, 198), "dia": (110, 120), "bmi": (28, 36), "chol": (5.6, 7.2), "glu": (5.4, 7.0), "stage": 3},
}


def conclusion_text(profile: str, r: random.Random, today: date | None = None) -> str:
    p = PROFILES[profile]
    today = today or date.today()
    age = r.randint(28, 64)
    female = r.random() < 0.6
    nat = r.choice(["казашка", "русская", "татарка"] if female else ["казах", "русский", "узбек"])
    h_cm = r.randint(155, 172) if female else r.randint(166, 185)
    bmi = round(r.uniform(*p["bmi"]), 1)
    wt = round(bmi * (h_cm / 100) ** 2)
    s, d = r.randint(*p["sys"]), r.randint(*p["dia"])
    s2, d2 = s - r.randint(0, 8), d - r.randint(0, 5)
    hr = r.randint(62, 88)
    v1 = today - timedelta(days=r.randint(70, 110))
    v2 = v1 + timedelta(days=r.randint(18, 30))
    v3 = v2 + timedelta(days=r.randint(40, 60))
    lab1 = v1 + timedelta(days=2)
    lab2 = v3 - timedelta(days=10)
    creat = round(r.uniform(62, 92) if female else r.uniform(74, 108), 1)
    creat2 = round(creat + r.uniform(-6, 9), 1)
    gfr = round(max(45, 125 - age * 0.7 - (creat - 70) * 0.6 + r.uniform(-5, 5)), 2)
    gfr2 = round(gfr - r.uniform(0, 8), 2)
    cg = round(gfr * r.uniform(0.85, 1.0), 2)
    alt, ast = round(r.uniform(9, 32), 1), round(r.uniform(14, 30), 2)
    chol = round(r.uniform(*p["chol"]), 2)
    hdl = round(r.uniform(0.9, 1.8), 2)
    tg = round(r.uniform(0.7, 2.3), 2)
    ldl = round(max(1.2, chol - hdl - tg / 2.2), 2)
    glu = round(r.uniform(*p["glu"]), 2)
    lvef = r.randint(56, 70)
    lpi_d, lpi_s = round(r.uniform(0.92, 1.18), 2), round(r.uniform(0.92, 1.18), 2)
    fmt = lambda x: f"{x}".replace(".", ",")  # noqa: E731
    yy = lambda x: x.strftime("%d.%m.%y")  # noqa: E731
    complaints = "жалоб активно не предъявляет" if p["stage"] == 0 else r.choice([
        "периодические головные боли в затылочной области, головокружение, шум в ушах при повышении АД",
        "головные боли, мелькание мушек перед глазами, сердцебиение при повышении АД, общая слабость"])
    if p["stage"]:
        prelim = f"Артериальная гипертензия {p['stage']} степени, риск {min(4, p['stage'] + 1)}. ХСН ФК {'I' if p['stage'] < 3 else 'II'}"
        final = prelim + ("" if p["stage"] < 2 else ". Гипертоническая болезнь II стадии")
        recs = "ограничение соли до 5 г/сут; контроль АД 2 раза в день с ведением дневника; гипотензивная терапия по назначению врача; повторная консультация через 1 месяц."
    else:
        prelim = "Органической патологии со стороны сердца в настоящий момент не выявлено. ХСН ФК0"
        final = "Органической патологии со стороны сердца не выявлено. ХСН ФК0"
        recs = "здоровое питание; ежедневная ходьба 5000–10000 шагов; контроль АД 1 раз в неделю; повторная консультация при появлении жалоб."
    lines = [
        "ПРИМЕР · сгенерированное заключение (вымышленный пациент) · не является медицинским документом",
        "Медициналық қорытынды",
        "Медицинское заключение",
        f"Туған күні (кк/аа/жж) (Дата рождения дд/мм/гг) — ({age} лет)",
        f"Ұлты (Национальность)  {nat}",
        "Мекенжайы (Адрес): —",
        f"Қабылдау күні (кк/аа/жж) {yy(v1)}, {yy(v2)}",
        "Дата приема (дд/мм/гг)",
        f"Қабылдаудың аяқталған күні (кк/аа/жж) {yy(v3)}",
        "Дата завершения приема (дд/мм/гг)",
        f"Шағым (Жалобы): {complaints}.",
        f"{yy(v2)} – самочувствие удовлетворительное.",
        f"Ауру анамнезі (Анамнез заболевания): {'АД повышается в течение ' + str(r.randint(1, 8)) + ' лет, максимально до ' + str(s + r.randint(5, 25)) + '/' + str(d + r.randint(3, 10)) + ' мм.рт.ст.' if p['stage'] else 'Повышения АД ранее не отмечала.'} На «Д» учет состоит у {'кардиолога' if p['stage'] else 'терапевта'}. Обратилась в плановом порядке.",
        f"Батсан откерген аурулар (Перенесенные заболевания): tbs, Болезнь Боткина отрицает. Гемотрансфузии – не было. Донорство крови – не было. Наследственность – {'по линии матери АГ, ИБС' if p['stage'] else 'не отягощена'}. Вредные привычки – {r.choice(['нет', 'нет', 'курение'])}.",
        "Аллергологиялық анамнез (Аллергологический анамнез): не отягощен.",
        f"Объективті статус (Объективный статус): на момент осмотра: Рост {h_cm} см. Вес {wt} кг. ИМТ {fmt(bmi)} кг/кв.м. Общее состояние удовлетворительное. Пульсация на лучевых артериях – симметрична, a.dorsalis pedis – симметрична с обеих сторон. Периферических отеков нет. Тыныс алу жүйесі/органы дыхания: дыхание везикулярное, хрипы не выслушиваются. ЧДД {r.randint(14, 18)} в мин. Қан айналым жүйесі/органы кровообращения: Тоны сердца {'ясные' if p['stage'] < 2 else 'приглушенные'}, ритмичные. ЧСС {hr} ударов в мин. Пульс {hr} ударов в мин. АДdex {s}|{d} мм.рт.ст. АДsin {s2}/{d2} мм.рт.ст. На ногах: АДdex {s + r.randint(5, 15)}|{d + r.randint(0, 6)} мм.рт.ст. АДsin {s2 + r.randint(5, 15)}/{d2 + r.randint(0, 6)} мм.рт.ст. ЛПИdex={fmt(lpi_d)}, ЛПИsin={fmt(lpi_s)}. Ас қорыту жүйесі/органы пищеварения: Живот мягкий, безболезненный. Стул регулярный, оформленный. Мочеиспускание свободное, б/б.",
        f"{yy(v2)} – Вес {wt} кг. ЧСС {hr + r.randint(-6, 8)} ударов в мин. Пульс {hr + r.randint(-6, 8)} ударов в мин. АДdex {s - r.randint(2, 12)}|{d - r.randint(0, 6)} мм.рт.ст. АДsin {s2 - r.randint(2, 12)}/{d2 - r.randint(0, 6)} мм.рт.ст.",
        f"{yy(v3)} – Вес {wt + r.randint(-2, 1)} кг. ЧСС {hr + r.randint(-8, 4)} ударов в мин. Пульс {hr + r.randint(-8, 4)} ударов в мин. АДdex {s - r.randint(6, 20)}|{d - r.randint(2, 10)} мм.рт.ст. АДsin {s2 - r.randint(6, 20)}/{d2 - r.randint(2, 10)} мм.рт.ст.",
        f"Өткізілген зерттеулердің түрлері (Виды проведенного исследования): ЭхоКГ ({yy(v1)}) - Аорта не изменена. Полости сердца не расширены. {'Гипертрофия миокарда ЛЖ.' if p['stage'] >= 2 else ''} Диастолическая и систолическая функции миокарда ЛЖ в покое не нарушены. ФВЛЖ {lvef}%.",
        f"ЭКГ ({yy(v1)}) – ритм синусовый, правильный, ЧСС {hr} ударов в мин.",
        f"Б\\х крови ({yy(lab1)}) – общий белок {r.randint(64, 80)} г/л, мочевина {fmt(round(r.uniform(3.2, 6.8), 1))} ммоль/л, креатинин {fmt(creat)} мкмоль/л, глюкоза {fmt(glu)} ммоль/л, АЛТ {fmt(alt)} Ед/л, АСТ {fmt(ast)} Ед/л, индекс де Ритиса {fmt(round(ast / alt, 1))}, общий ХС {fmt(chol)} ммоль/л, ЛПВП {fmt(hdl)} ммоль/л, ЛПНП {fmt(ldl)} ммоль/л, ТГ {fmt(tg)} ммоль/л, коагулограмма – МНО {fmt(round(r.uniform(0.9, 1.1), 2))}, ПТИ {r.randint(88, 104)}%.",
        f"рСКФ по CKD-EPI ≊ {gfr} мл/мин/1,73 м² ({lab1.strftime('%d.%m.%Y')} г.)",
        f"Клиренс креатинина [3] по формуле Кокрофта-Голта ≊ {cg} мл/мин",
        f"Б\\х крови ({yy(lab2)}) – мочевина {fmt(round(r.uniform(3.2, 6.8), 2))} ммоль/л, креатинин – {fmt(creat2)} мкмоль/л.",
        f"рСКФ по CKD-EPI ≊ {gfr2} мл/мин/1,73 м² ({v3.strftime('%d.%m.%Y')} г.)",
        f"Клиренс креатинина [3] по формуле Кокрофта-Голта ≊ {round(gfr2 * 0.93, 2)} мл/мин",
        f"Алдын ала диагнозы (Предварительный диагноз): {prelim}",
        f"Қорытынды диагноз (Заключительный диагноз): {final}",
        f"Ұсынымдар (Рекомендации): {recs}",
        "Дәрігердің қолы (Подпись врача): ____________________________",
    ]
    return "\n".join(lines)


def text_to_docx(text: str) -> bytes:
    """Minimal valid .docx; field labels (up to the first colon) are bold, like on the real conclusion."""
    paras = []
    for line in text.split("\n"):
        head, sep, rest = line.partition(":")
        if sep and len(head) < 90 and not head.startswith("ПРИМЕР"):
            runs = f'<w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">{escape(head + sep)}</w:t></w:r><w:r><w:t xml:space="preserve">{escape(rest)}</w:t></w:r>'
        else:
            bold = line.startswith(("Медициналық", "Медицинское"))
            runs = f'<w:r>{"<w:rPr><w:b/></w:rPr>" if bold else ""}<w:t xml:space="preserve">{escape(line)}</w:t></w:r>'
        center = ' <w:pPr><w:jc w:val="center"/></w:pPr>' if line.startswith(("Медициналық", "Медицинское")) else ""
        paras.append(f"<w:p>{center}{runs}</w:p>")
    doc = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'
           + "".join(paras) + "</w:body></w:document>")
    ct = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
          '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>'
          '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>')
    rels = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>')
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for name, data in (("[Content_Types].xml", ct), ("_rels/.rels", rels), ("word/document.xml", doc)):
            z.writestr(zipfile.ZipInfo(name, date_time=(2026, 1, 1, 0, 0, 0)), data)
    return buf.getvalue()
