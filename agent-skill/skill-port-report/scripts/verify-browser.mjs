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
  assert.equal(await page.locator('tr[data-skill]').count(), data.skills.length);
  for (const skill of data.skills) {
    const row = page.locator('tr[data-skill]').filter({ hasText: skill.name });
    assert.equal(await row.count(), 1);
    assert.ok((await row.innerText()).includes(skill.description.slice(0, 12)));
    assert.ok((await row.innerText()).includes(skill.installedAt.slice(0, 10)));
  }
  assert.equal(await page.locator('#skillCount').innerText(), String(data.skills.length));
  await page.fill('#q', 'NO_SUCH_SKILL_123');
  assert.equal(await page.locator('tr[data-skill]:visible').count(), 0);
  assert.equal(await page.locator('#empty').isVisible(), true);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('tr[data-skill]:visible').count(), data.skills.length);
  if (data.skills.length) {
    await page.fill('#q', data.skills[0].name);
    assert.ok(await page.locator('tr[data-skill]:visible').count() > 0);
  }
  await page.click('#reset');
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  console.log(JSON.stringify({
    skills: data.skills.map((skill) => skill.name),
    enablementCount: data.skills.reduce((n, skill) => n + skill.enablementCount, 0),
    checks: ['skill rows', 'descriptions', 'dates', 'search', 'reset', 'mobile', 'no external requests', 'no JS errors']
  }, null, 2));
} finally {
  if (browser) await browser.close();
  await new Promise((r) => server.close(r));
}
