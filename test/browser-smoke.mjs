/**
 * Real-browser smoke test: boots the built game in headless Chromium,
 * plays for a while, pokes the UI, and screams about any console error.
 *
 * Usage: node test/browser-smoke.mjs [url]   (default http://localhost:4823)
 */
import { chromium } from 'playwright';

const url = process.argv[2] ?? 'http://localhost:4823';
const errors = [];
const fails = [];
const ok = (name, cond) => {
  if (cond) console.log(`  ✓ ${name}`);
  else { console.log(`  ✗ ${name}`); fails.push(name); }
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(msg.text());
});
page.on('pageerror', (err) => errors.push(String(err)));

console.log(`Loading ${url} …`);
await page.goto(url, { waitUntil: 'networkidle' });

// intro modal appears on fresh boot
await page.waitForTimeout(800);
ok('intro modal shown on first boot', await page.locator('.modal').count() === 1);
await page.click('[data-act="modal-close"]');

// the game summons a vessel and starts logging
await page.waitForTimeout(4000);
const logLines = await page.locator('.log-line').count();
ok('combat log has entries', logLines > 0);
ok('a vessel was summoned', (await page.locator('#hud-name').textContent()) !== '— no vessel —');

// canvas is actually being painted (not a black void)
const px = await page.evaluate(() => {
  const c = document.getElementById('dungeon');
  const ctx = c.getContext('2d');
  const data = ctx.getImageData(0, 0, c.width, c.height).data;
  let lit = 0;
  for (let i = 0; i < data.length; i += 40) if (data[i] + data[i + 1] + data[i + 2] > 30) lit++;
  return lit;
});
ok('canvas has visible content', px > 50);

// tabs all render
for (const tab of ['necro', 'crypt', 'reap', 'feats', 'settings', 'vessel']) {
  await page.click(`[data-act="tab"][data-id="${tab}"]`);
  await page.waitForTimeout(120);
  const text = (await page.locator('#panel').textContent()) ?? '';
  ok(`tab "${tab}" renders content`, text.trim().length > 40);
}

// game state is progressing
const stats = await page.evaluate(() => ({
  kills: window.GW.state.totalKills,
  turn: window.GW.state.run ? window.GW.state.run.turn : -1,
  bones: window.GW.state.bones,
}));
await page.waitForTimeout(3000);
const stats2 = await page.evaluate(() => ({
  kills: window.GW.state.totalKills,
  turn: window.GW.state.run ? window.GW.state.run.turn : -1,
  bones: window.GW.state.bones,
}));
ok('simulation advances (turns/kills move)',
  stats2.turn !== stats.turn || stats2.kills > stats.kills);

// manual control: keyboard pauses auto
await page.keyboard.press('a');
const auto = await page.evaluate(() => window.GW.state.auto);
ok('keyboard takes manual control', auto === false);
await page.keyboard.press('p');
ok('P resumes autopilot', await page.evaluate(() => window.GW.state.auto));

// buy something if affordable, via the Crypt tab
await page.evaluate(() => { window.GW.state.bones += 1000; });
await page.click('[data-act="tab"][data-id="crypt"]');
await page.waitForTimeout(1200);
const lvlBefore = await page.evaluate(() => window.GW.state.upgrades['vigor'] ?? 0);
await page.locator('[data-act="buy"][data-id="vigor"]').first().click();
const lvlAfter = await page.evaluate(() => window.GW.state.upgrades['vigor'] ?? 0);
ok('buying an upgrade works through the UI', lvlAfter === lvlBefore + 1);

// save round-trip through localStorage
await page.evaluate(() => window.GW.state.souls += 777);
await page.waitForTimeout(100);
const saved = await page.evaluate(() => {
  // force a save via the settings button path
  document.querySelector('[data-act="tab"][data-id="settings"]').click();
  return true;
});
await page.waitForTimeout(300);
await page.click('[data-act="save-now"]');
const blob = await page.evaluate(() => localStorage.getItem('gravewright-save-v1'));
ok('autosave writes to localStorage', !!blob && blob.length > 100);

// reload: state survives
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
const souls = await page.evaluate(() => window.GW.state.souls);
ok('state survives a reload', souls >= 777);
ok('no intro modal after reload (returning player)',
  await page.locator('.modal').count() === 0 ||
  (await page.locator('.modal h2').textContent() ?? '').includes('While You Were Gone'));

await page.screenshot({ path: 'test/screenshot.png', fullPage: false });
console.log('Screenshot saved to test/screenshot.png');

await browser.close();

console.log('');
if (errors.length) {
  console.log('CONSOLE ERRORS:');
  for (const e of errors.slice(0, 12)) console.log('  •', e);
}
if (fails.length || errors.length) {
  console.log(`\nSMOKE TEST FAILED (${fails.length} assertion(s), ${errors.length} console error(s))`);
  process.exit(1);
}
console.log('SMOKE TEST PASSED — game boots, plays, buys, saves, reloads. ☠');
