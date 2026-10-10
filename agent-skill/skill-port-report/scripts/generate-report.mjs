import { DatabaseSync } from 'node:sqlite';
import { existsSync, realpathSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));

export function resolveHub(explicit, env = process.env, home = homedir()) {
  let hub = explicit ?? env.SKLP_HOME;
  if (!hub) {
    const locator = join(home, '.skill-port.json');
    if (existsSync(locator)) {
      let value;
      try { value = JSON.parse(readFileSync(locator, 'utf8')); }
      catch { throw new Error('Hub locator 格式无效。'); }
      if (typeof value.hubPath !== 'string' || !value.hubPath) throw new Error('Hub locator 缺少 hubPath。');
      hub = value.hubPath;
    }
  }
  return resolve(hub ?? join(home, '.skill-port'));
}

export function readProjects(hub) {
  const database = join(hub, 'state.db');
  if (!existsSync(database)) throw new Error('Hub state.db 不存在；不会初始化 Hub。');
  let db;
  try {
    db = new DatabaseSync(database, { readOnly: true });
    db.exec('BEGIN');
    const projects = db.prepare(
      "SELECT p.path, p.created_at AS registeredAt, COUNT(e.id) AS enablementCount FROM projects p LEFT JOIN enablements e ON e.target_type = 'project' AND e.target_key = p.path GROUP BY p.path, p.created_at ORDER BY p.created_at, p.path"
    ).all().map(row => ({ ...row, name: row.path.split(/[\\/]/).filter(Boolean).at(-1) || row.path }));
    const globalEnablementCount = db.prepare("SELECT COUNT(*) AS count FROM enablements WHERE target_type = 'global'").get().count;
    db.exec('COMMIT');
    return { meta: { updated: new Date().toISOString(), title: 'Skill Port · 本地项目列表' }, projects, globalEnablementCount };
  } catch {
    throw new Error('只读项目查询失败；检查 Hub 是否可读及 projects/enablements 表结构是否兼容。');
  } finally { db?.close(); }
}

export function renderReport(template, data) {
  const marker = '<!-- SKILL_PORT_DATA -->';
  if (template.split(marker).length !== 2) throw new Error('报告模板缺少唯一数据占位符。');
  const json = JSON.stringify(data).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  return template.replace(marker, () => '<script>window.SKILL_PORT_DATA = ' + json + ';</script>');
}

export function main(args = process.argv.slice(2)) {
  let output; let hub;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--help') { console.log('node generate-report.mjs [--output <new.html>] [--hub <Hub directory>]'); return; }
    if (!['--output', '--hub'].includes(args[i]) || !args[i + 1] || args[i + 1].startsWith('--')) throw new Error('参数无效；使用 --help 查看用法。');
    const flag = args[i++];
    if (flag === '--output') output = args[i]; else hub = args[i];
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const destination = resolve(output || join('skill-port-reports', 'local-projects-' + stamp + '.html'));
  if (!destination.endsWith('.html')) throw new Error('输出必须使用 .html 扩展名。');
  if (existsSync(destination)) throw new Error('输出已存在；请选择新文件名，不覆盖已有报告。');
  const data = readProjects(resolveHub(hub));
  const html = renderReport(readFileSync(join(root, 'assets/report.template.html'), 'utf8'), data);
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, html, { encoding: 'utf8', flag: 'wx' });
  const result = { output: destination, projects: data.projects.length, projectEnablementCount: data.projects.reduce((n,p)=>n+p.enablementCount,0), globalEnablementCount: data.globalEnablementCount, updated: data.meta.updated };
  console.log(JSON.stringify(result, null, 2));
  return result;
}
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(resolve(process.argv[1]))).href) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
