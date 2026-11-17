// Display helpers. Data is UTC; everything shown to people is Europe/Amsterdam.
const TZ = 'Europe/Amsterdam';
const fClock = new Intl.DateTimeFormat('nl-NL', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
const fShort = new Intl.DateTimeFormat('nl-NL', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const fTime = new Intl.DateTimeFormat('nl-NL', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
const fDate = new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' });

export const clock = (t) => fClock.format(t);
export const short = (t) => fShort.format(t);
export const time = (t) => fTime.format(t);
export const date = (iso) => (iso ? fDate.format(new Date(iso + 'T12:00:00Z')) : 'onbekend');

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const num = (v, d = 1) => (Number.isFinite(v) ? v.toFixed(d).replace('.', ',') : '–');
