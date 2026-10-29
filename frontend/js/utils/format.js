export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-11-03" → { day: "03", mon: "Nov" } (pure string maths: no timezone surprises). */
export function dateParts(ymd) {
  const [, m, d] = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd) || [];
  return { day: d || '--', mon: MONTHS[Number(m) - 1] || '' };
}

/** "14:30" → "2:30 PM" */
export function timeLabel(hhmm) {
  const [h, m] = String(hhmm).split(':').map(Number);
  if (Number.isNaN(h)) return String(hhmm);
  const suffix = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${suffix}`;
}

/** Local calendar date as YYYY-MM-DD, offset by `days` (handles month ends correctly). */
export function localDate(days = 0) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
