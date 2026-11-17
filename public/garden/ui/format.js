// Display helpers. Data is UTC; everything shown to people is Europe/Amsterdam.
const TZ = 'Europe/Amsterdam';
const fClock = new Intl.DateTimeFormat('nl-NL', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
const fShort = new Intl.DateTimeFormat('nl-NL', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const fDay = new Intl.DateTimeFormat('nl-NL', { timeZone: TZ, weekday: 'short', day: 'numeric' });
const fTime = new Intl.DateTimeFormat('nl-NL', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
const fHour = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', hourCycle: 'h23' });
const fDate = new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' });

export const clock = (t) => fClock.format(t);
export const short = (t) => fShort.format(t);
export const dayLabel = (t) => fDay.format(t);
export const time = (t) => fTime.format(t);
export const localHour = (t) => Number(fHour.format(t));
export const date = (iso) => (iso ? fDate.format(new Date(iso + 'T12:00:00Z')) : 'onbekend');

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const num = (v, d = 1) => (Number.isFinite(v) ? v.toFixed(d).replace('.', ',') : '–');

/** Local midnights between two timestamps (for day ticks). */
export function midnights(start, end) {
  const out = [];
  for (let t = Math.ceil(start / 3600e3) * 3600e3; t <= end; t += 3600e3) if (localHour(t) === 0) out.push(t);
  return out;
}
