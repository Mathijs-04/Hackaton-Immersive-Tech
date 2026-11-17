// Tells the workflow whether the hourly refresh may run (pages.config.json "activeUntil").
//   activeUntil empty / null  -> no end: refresh every hour until the workflow is disabled
//   activeUntil = ISO date    -> optional end: refresh only until then, then the workflow disables itself
//   activeUntil unparsable    -> treated as "closed" (safe default: no API calls)
// Prints active=true|false to $GITHUB_OUTPUT.
const fs = require('fs');
const path = require('path');

const config = JSON.parse(fs.readFileSync(process.env.PAGES_CONFIG || path.join(__dirname, '..', 'pages.config.json'), 'utf8')); // PAGES_CONFIG: tests only
const limited = config.activeUntil !== null && config.activeUntil !== undefined && config.activeUntil !== '';
const until = limited ? Date.parse(config.activeUntil) : Infinity;
const active = Date.now() < until; // NaN (invalid date) compares false -> closed
if (!limited) console.log('Refresh runs every hour with no end date.');
else if (active) console.log(`Refresh window open: ${Math.round((until - Date.now()) / 36e5 * 10) / 10} h left (until ${config.activeUntil}).`);
else console.log(`Refresh window closed (activeUntil: ${config.activeUntil}).`);
if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `active=${active}\n`);
