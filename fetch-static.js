// One-off: downloads layout + planting plan to data/ (skipped if already there).
const { getLayout, getPlantingPlans, getGarden } = require('./lib/bioto');
(async () => {
  await getGarden(); console.log('garden.json ok');
  await getLayout(); console.log('layout.json ok');
  await getPlantingPlans(); console.log('planting.json ok');
})().catch((e) => { console.error(e.message); process.exit(1); });
