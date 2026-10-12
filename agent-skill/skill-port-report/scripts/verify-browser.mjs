import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
const { chromium } = await import(pathToFileURL(resolve(process.argv[2])).href);
const html = readFileSync(resolve(process.argv[3]));
const server = createServer((req, res) => { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(html); });
await new Promise((r) => server.listen(0, '127.0.0.1', r));
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = []; const external = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('request', (r) => { if (!r.url().startsWith('http://127.0.0.1:')) external.push(r.url()); });
  await page.goto('http://127.0.0.1:' + server.address().port);
  const data = await page.evaluate(() => window.SKILL_PORT_DATA);
  const rows = page.locator('tr[data-skill]');
  assert.equal(await rows.count(), data.skills.length);
  for (const skill of data.skills) {
    const row = page.locator(`tr[data-skill="${skill.name}"]`);
    assert.equal(await row.count(), 1);
    const text = await row.innerText();
    assert.ok(text.includes(skill.name));
    assert.ok(text.includes(skill.description.slice(0, 12)));
    assert.ok(text.includes(skill.installedAt.slice(0, 10)));
  }
  assert.equal(await page.locator('#skillCount').innerText(), String(data.skills.length));
  assert.equal(await page.locator('#enabledCount').innerText(), String(data.skills.filter((s) => s.enablementCount > 0).length));
  assert.equal(await page.locator('#enablementCount').innerText(), String(data.skills.reduce((n, s) => n + s.enablementCount, 0)));
  assert.equal(await page.locator('thead th').count(), 3);
  const usedCats = data.categories
    .filter((c) => data.skills.some((s) => s.category === c.key))
    .map((c) => c.key);
  assert.equal(await page.locator('tbody.grp').count(), usedCats.length);
  assert.equal(await page.locator('#catnav .chip').count(), usedCats.length);
  assert.equal(await page.locator('.grp-head:visible').count(), usedCats.length);
  assert.equal(await page.locator('#category option').count(), usedCats.length + 1);
  await page.fill('#q', 'NO_SUCH_SKILL_123');
  assert.equal(await page.locator('tr[data-skill]:visible').count(), 0);
  assert.equal(await page.locator('#empty').isVisible(), true);
  assert.equal(await page.locator('.grp-head:visible').count(), 0);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('tr[data-skill]:visible').count(), data.skills.length);
  assert.equal(await page.locator('#empty').isVisible(), false);
  if (data.skills.length) {
    await page.fill('#q', data.skills[0].name);
    const visible = page.locator('tr[data-skill]:visible');
    assert.ok(await visible.count() > 0);
    assert.equal(await visible.first().getAttribute('data-skill'), data.skills[0].name);
    const cat = await visible.first().getAttribute('data-category');
    assert.equal(await page.locator('#category').inputValue(), '');
    assert.equal(await page.locator('#catnav .chip[aria-pressed="true"]').count(), 0);
    const chip = page.locator(`#catnav .chip[data-cat="${cat}"]`);
    await chip.click();
    assert.equal(await page.locator('#category').inputValue(), cat);
    assert.equal(await page.locator('.grp-head:visible').count(), 1);
    assert.equal(await page.locator(`.grp-head[data-cat="${cat}"]`).isVisible(), true);
    assert.ok(await page.locator('tr[data-skill]:visible').count() > 0);
    await page.fill('#q', '');
    assert.equal(await page.locator('.grp-head:visible').count(), 1);
    await chip.click();
    assert.equal(await page.locator('#category').inputValue(), '');
    assert.equal(await page.locator('.grp-head:visible').count(), usedCats.length);
    assert.equal(await page.locator('tr[data-skill]:visible').count(), data.skills.length);
  }
  await page.click('#reset');
  assert.equal(await page.locator('tr[data-skill]:visible').count(), data.skills.length);
  const sticky = await page.evaluate(() => document.documentElement.style.getPropertyValue('--thead-h'));
  assert.match(sticky, /^\d+(\.\d+)?px$/);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  assert.equal(await page.locator('tr[data-skill]:visible').count(), data.skills.length);
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  console.log(JSON.stringify({
    skills: data.skills.map((skill) => skill.name),
    enablementCount: data.skills.reduce((n, skill) => n + skill.enablementCount, 0),
    checks: ['skill rows', 'descriptions', 'dates', 'stats', 'columns', 'category groups', 'chips', 'empty state', 'search', 'escape', 'reset', 'sticky header', 'mobile', 'no external requests', 'no JS errors']
  }, null, 2));
} finally {
  if (browser) await browser.close();
  await new Promise((r) => server.close(r));
}
