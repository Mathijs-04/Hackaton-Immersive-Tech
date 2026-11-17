// Optional: downloads the garden data into data/ ahead of time (the server also does this on demand).
//   npm run fetch      needs BIOTO_TOKEN and GARDEN_UUID in .env
const path = require('path');
try { process.loadEnvFile(path.join(__dirname, '..', '.env')); } catch { /* no .env: the next line explains */ }
const { getGarden, getLayout, getPlantingPlans } = require('../lib/bioto');

(async () => {
  await getGarden(); console.log('garden.json ok');
  await getLayout(); console.log('layout.json ok');
  await getPlantingPlans(); console.log('planting.json ok');
})().catch((e) => { console.error(e.message); process.exit(1); });
