"""Parse stat.gov.kz open-data workbooks (wide, multi-row merged headers) into tidy long rows.

Every data sheet follows the same shape:
    title rows
    header rows   -> one of them holds years, others hold breakdowns (sex, urban/rural, ...)
    data rows     -> KATO code | [unit type] | region name | values...
    section rows  -> a label with no values (e.g. "urban population") that applies to rows below

Conventions used by the Bureau: "-" no case, "0.0" insignificant, "X" confidential.
"-" is kept as NaN with flag "dash" because the same symbol also marks regions that did
not exist yet (e.g. Abay before 2022); callers decide whether it means zero.
"""
import re
from pathlib import Path

import openpyxl
import pandas as pd

YEAR_RE = re.compile(r"^\s*((?:19|20)\d\d)(?:\d\)|\b)")  # "20081)" = 2008 + footnote 1
COUNTRY_NAMES = {"republic of kazakhstan", "rk", "kr"}
UNIT_WORDS = {"people", "peouple", "persons", "person", "units"}  # stray unit labels in header rows


def _grids(ws) -> tuple[list[list], list[list]]:
    """-> (raw grid, grid with merged cells spread over their whole span)"""
    raw = [list(r) for r in ws.iter_rows(values_only=True)]
    width = max((len(r) for r in raw), default=0)
    raw = [r + [None] * (width - len(r)) for r in raw]
    merged = [r[:] for r in raw]
    for rng in ws.merged_cells.ranges:
        v = raw[rng.min_row - 1][rng.min_col - 1]
        for r in range(rng.min_row - 1, min(rng.max_row, len(raw))):
            for c in range(rng.min_col - 1, min(rng.max_col, width)):
                merged[r][c] = v
    return raw, merged


def _text(v) -> str:
    return "" if v is None else re.sub(r"\s+", " ", str(v)).strip()


def _year(v):
    if isinstance(v, (int, float)) and 1900 <= v <= 2100:
        return int(v)
    m = YEAR_RE.match(_text(v))
    return int(m.group(1)) if m else None


def parse_value(v):
    """-> (float | None, flag | None)"""
    if v is None:
        return None, None
    if isinstance(v, (int, float)):
        return float(v), None
    s = _text(v).replace("\xa0", "").replace(" ", "")
    if s in {"-", "–", "—"}:
        return None, "dash"
    if s.upper() in {"X", "Х"}:  # latin or cyrillic
        return None, "confidential"
    s = s.replace(",", ".")
    try:
        return float(s), None
    except ValueError:
        return None, "unparsed"


def normalise_kato(code) -> str | None:
    """Return the code as a string; '0' for the country. Old 7-digit codes keep their form."""
    if code is None:
        return None
    s = _text(code)
    if isinstance(code, float):
        s = str(int(code))
    return s if s.isdigit() else None


def oblast_code(kato: str | None) -> str | None:
    """Two-digit oblast prefix shared by 9-digit KATO ('110000000') and old 7-digit codes ('0110000')."""
    if kato is None or set(kato) == {"0"}:
        return "00" if kato is not None else None
    if len(kato) == 9:
        return kato[:2]
    if len(kato) == 7:
        return kato[1:3]
    return None


def kato_level(kato: str | None) -> str | None:
    if kato is None:
        return None
    if set(kato) == {"0"}:
        return "country"
    rest = kato[2:] if len(kato) == 9 else kato[3:] if len(kato) == 7 else None
    if rest is None:
        return None
    return "oblast" if set(rest) == {"0"} else "district"


def parse_sheet(ws) -> pd.DataFrame:
    raw, g = _grids(ws)
    # first data row: the country total
    start = next((i for i, r in enumerate(g)
                  if any(_text(c).lower() in COUNTRY_NAMES for c in r[:3])), None)
    if start is None:
        return pd.DataFrame()
    year_row = next((i for i in range(start) if any(_year(c) for c in g[i][2:])), None)
    if year_row is None:
        return pd.DataFrame()
    first_val = next(c for c in range(2, len(g[year_row])) if _year(g[year_row][c]))
    name_col = first_val - 1

    def is_section(i):  # judged on the raw grid: section labels are often merged across the row
        return bool(_text(raw[i][name_col])) and all(v is None for v in raw[i][first_val:])

    # header block = contiguous non-empty rows directly above the data (sections excluded)
    header_rows, i = [], start - 1
    while i >= 0 and (is_section(i) or any(v is not None for v in g[i][first_val:])):
        if not is_section(i):
            header_rows.insert(0, i)
        i -= 1
    section = next((_text(g[i][name_col]) for i in range(year_row, start) if is_section(i)), "")

    cols = []
    for c in range(first_val, len(g[0])):
        year, parts = None, []
        for i in header_rows:
            v = g[i][c]
            y = _year(v)
            if y and year is None:
                year = y
            elif _text(v) and _text(v) not in parts and _text(v).lower() not in UNIT_WORDS:
                parts.append(_text(v))
        cols.append((c, year, " | ".join(parts)))

    out = []
    for i in range(start, len(raw)):
        r = raw[i]
        if is_section(i):
            section = _text(r[name_col])
            continue
        name = _text(r[name_col])
        if not name:
            continue
        kato = normalise_kato(r[0])
        if kato is None and name.lower() in COUNTRY_NAMES:
            kato = "0"
        for c, year, breakdown in cols:
            if year is None or r[c] is None:
                continue
            val, flag = parse_value(r[c])
            out.append({
                "kato": kato, "oblast_code": oblast_code(kato), "level": kato_level(kato),
                "region": name, "section": section, "breakdown": breakdown,
                "year": year, "value": val, "flag": flag, "value_raw": _text(r[c]),
            })
    return pd.DataFrame(out)


def parse_workbook(path: Path, dataset: str) -> pd.DataFrame:
    wb = openpyxl.load_workbook(path, data_only=True)
    frames = []
    for ws in wb.worksheets:
        df = parse_sheet(ws)
        if not df.empty:
            df.insert(0, "sheet", ws.title)
            df.insert(0, "dataset", dataset)
            frames.append(df)
    return pd.concat(frames, ignore_index=True) if frames else pd.DataFrame()


AREA_TITLES = {"all population": "total", "urban population": "urban", "rural population": "rural",
               "urban area": "urban", "rural area": "rural"}


def parse_population_by_age(path: Path) -> pd.DataFrame:
    """population_detailed.xlsx: one sheet per region, rows = single-year age,
    column blocks = total / men / women, vertical blocks = all / urban / rural."""
    wb = openpyxl.load_workbook(path, data_only=True)
    out = []
    for ws in wb.worksheets:
        raw, g = _grids(ws)
        title = next((_text(r[0]) for r in raw[2:4] if _text(r[0])), "")
        if title == "RK":
            kato, region = "0", "Republic of Kazakhstan"
        else:
            m = re.match(r"CATO\s+(\d+)\s+(.*)", title)
            if not m:
                continue  # Metadata / Conventions
            kato, region = m.group(1), m.group(2)
        area, years, sexes = "total", {}, {}
        for i, r in enumerate(raw):
            label = _text(r[0])
            if label.lower() in AREA_TITLES and all(v is None for v in r[1:]):
                area = AREA_TITLES[label.lower()]
                continue
            if label.lower() == "age":
                years = {c: _year(v) for c, v in enumerate(r) if c > 0 and _year(v)}
                sexes = {c: {"men": "male", "women": "female"}.get(_text(g[i - 1][c]).lower(), "total")
                         for c in years}
                continue
            if not years or not label:
                continue
            for c, year in years.items():
                val, flag = parse_value(r[c])
                if val is None and flag is None:
                    continue
                age_int = int(r[0]) if isinstance(r[0], (int, float)) else None
                out.append({"kato": kato, "oblast_code": oblast_code(kato), "level": kato_level(kato),
                            "region": region, "area": area, "sex": sexes[c], "age": label,
                            "age_years": age_int, "year": year, "value": val, "flag": flag})
    return pd.DataFrame(out)
