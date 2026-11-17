// Tells the workflow whether the hourly refresh window is still open (pages.config.json "activeUntil").
// Prints active=true|false to $GITHUB_OUTPUT. A missing or invalid date means "closed": no API calls.
const fs = require('fs');
const path = require('path');

const config = JSON.parse(fs.readFileSync(process.env.PAGES_CONFIG || path.join(__dirname, '..', 'pages.config.json'), 'utf8')); // PAGES_CONFIG: tests only
const until = config.activeUntil ? Date.parse(config.activeUntil) : NaN;
const active = Number.isFinite(until) && Date.now() < until;
const left = Number.isFinite(until) ? Math.round((until - Date.now()) / 36e5 * 10) / 10 : null;
console.log(active ? `Refresh window open: ${left} h left (until ${config.activeUntil}).` : `Refresh window closed (activeUntil: ${config.activeUntil ?? 'not set'}).`);
if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `active=${active}\n`);
