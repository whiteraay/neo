// Visual screening markers, not diagnoses. Hb cutoffs: WHO 2024, Table 3:
// https://www.ncbi.nlm.nih.gov/books/NBK602183/table/fm-ch1.tab2/
// Other cutoffs reuse the project's draft maternal-lab rules.
export const POINT_COLORS = { normal: '#16866A', warning: '#B77908', critical: '#D34253', unknown: '#748599' };

export function hbCutoff(point) {
  const days = point.ga_days;
  if (!Number.isFinite(days) || days < 0 || days > 294) return null;
  return days >= 14 * 7 && days < 28 * 7 ? 105 : 110;
}

export function labPointStatus(code, point) {
  const value = point.value;
  const result = (level, reason) => ({ level, reason, color: POINT_COLORS[level] });
  if (!Number.isFinite(value)) return result('unknown', 'noRange');
  if (code === 'hb' && point.unit === 'g/L') {
    if (value < 70) return result('critical', 'hbSevere');
    const cutoff = hbCutoff(point);
    if (cutoff != null && value < cutoff) return result('warning', 'belowThreshold');
  }
  const severe = { bp_sys: ['mmHg', 160], bp_dia: ['mmHg', 110] }[code];
  if (severe && point.unit === severe[0] && value >= severe[1]) return result('critical', 'aboveThreshold');
  const high = { bp_sys: ['mmHg', 140], bp_dia: ['mmHg', 90], ogtt_0: ['mmol/L', 5.1], ogtt_1h: ['mmol/L', 10], ogtt_2h: ['mmol/L', 8.5], glucose: ['mmol/L', 7], urine_protein: ['g/L', 0.3] }[code];
  if (high && point.unit === high[0] && value >= high[1]) return result('warning', 'aboveThreshold');
  if (code === 'plt' && point.unit === '10^9/L' && value < 100) return result('warning', 'belowThreshold');
  const lo = Number.isFinite(point.ref_low) ? point.ref_low : null;
  const hi = Number.isFinite(point.ref_high) ? point.ref_high : null;
  if ((lo != null && value < lo) || (hi != null && value > hi)) return result('warning', 'outsideRange');
  if (lo != null && hi != null && lo <= hi) return result('normal', 'withinRange');
  // A one-sided limit PRINTED BY THE LAB (e.g. ALT "< 35") is a reference interval too (CLSI EP28, IFCC);
  // screening cutoffs above are a different thing and never imply normal.
  if (lo != null || hi != null) return result('normal', 'withinOneSided');
  return result('unknown', 'noRange');
}
