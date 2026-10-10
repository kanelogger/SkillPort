import { DatabaseSync } from 'node:sqlite';
import { existsSync, lstatSync, realpathSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
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

function tableExists(db, name) {
  return db.prepare("SELECT 1 FROM sqlite_schema WHERE type='table' AND name=?").get(name) !== undefined;
}

function installationKind(hub, name, sourceType) {
  if (sourceType === 'git') return 'git-copy';
  try {
    if (lstatSync(join(hub, 'skills', name)).isSymbolicLink()) return 'linked';
  } catch { /* Hub entry missing or unreadable: fall through */ }
  return 'local-copy';
}

function loadCategories() {
  const raw = JSON.parse(readFileSync(join(root, 'assets/categories.json'), 'utf8'));
  if (!Array.isArray(raw.categories) || typeof raw.assignments !== 'object' || !raw.assignments) {
    throw new Error('categories.json 格式无效。');
  }
  const keys = new Set(raw.categories.map((item) => item.key));
  if (!keys.has('other')) throw new Error('categories.json 缺少 other 分类。');
  const assignments = Object.create(null);
  for (const [name, key] of Object.entries(raw.assignments)) {
    assignments[String(name).toLowerCase()] = keys.has(key) ? key : 'other';
  }
  return { categories: raw.categories, assignments };
}

function readZhMap(path) {
  if (!existsSync(path)) return Object.create(null);
  const raw = JSON.parse(readFileSync(path, 'utf8'));
  if (typeof raw !== 'object' || !raw || Array.isArray(raw)) throw new Error('descriptions.zh.json 格式无效。');
  const map = Object.create(null);
  for (const [name, text] of Object.entries(raw)) {
    if (typeof text === 'string' && text.trim()) map[String(name).toLowerCase()] = text.trim();
  }
  return map;
}

function loadZhDescriptions() {
  const bundled = readZhMap(join(root, 'assets/descriptions.zh.json'));
  const local = readZhMap(join(process.cwd(), 'skill-port-reports', 'descriptions.zh.json'));
  return { ...bundled, ...local };
}

export function isChineseDescription(text) {
  const chars = [...String(text ?? '')];
  const cjk = chars.filter((char) => /[\u4e00-\u9fff]/.test(char)).length;
  const letters = chars.filter((char) => /[A-Za-z]/.test(char)).length;
  return cjk >= 8 && cjk >= letters;
}

function displayDescription(name, hubDescription, zhDescriptions) {
  const overlay = zhDescriptions[name.toLowerCase()];
  if (overlay) return overlay;
  return hubDescription;
}

export function readSkills(hub) {
  const database = join(hub, 'state.db');
  if (!existsSync(database)) throw new Error('Hub state.db 不存在；不会初始化 Hub。');
  let db;
  try {
    db = new DatabaseSync(database, { readOnly: true });
    db.exec('BEGIN');
    if (!tableExists(db, 'skills') || !tableExists(db, 'enablements')) {
      throw new Error('missing tables');
    }
    const hasTags = tableExists(db, 'skill_tags');
    const rows = db.prepare(`
      SELECT s.instance_id AS instanceId, s.name, s.description, s.source_type AS sourceType,
             s.installed_at AS installedAt, s.updated_at AS updatedAt,
             COUNT(e.id) AS enablementCount
      FROM skills s
      LEFT JOIN enablements e ON e.skill_id = s.instance_id
      GROUP BY s.instance_id, s.name, s.description, s.source_type, s.installed_at, s.updated_at
      ORDER BY s.name COLLATE NOCASE
    `).all();
    const tagsBySkill = new Map();
    if (hasTags && rows.length) {
      const placeholders = rows.map(() => '?').join(',');
      const tagRows = db.prepare(`
        SELECT skill_id AS skillId, tag FROM skill_tags
        WHERE skill_id IN (${placeholders})
        ORDER BY tag COLLATE NOCASE
      `).all(...rows.map((row) => row.instanceId));
      for (const tag of tagRows) {
        const list = tagsBySkill.get(tag.skillId) ?? [];
        list.push(tag.tag);
        tagsBySkill.set(tag.skillId, list);
      }
    }
    db.exec('COMMIT');
    const { categories, assignments } = loadCategories();
    const zhDescriptions = loadZhDescriptions();
    const skills = rows.map((row) => {
      const name = String(row.name);
      const hubDescription = String(row.description);
      return {
        name,
        description: displayDescription(name, hubDescription, zhDescriptions),
        hubDescription,
        installationKind: installationKind(hub, name, String(row.sourceType)),
        enablementCount: Number(row.enablementCount),
        tags: tagsBySkill.get(row.instanceId) ?? [],
        installedAt: String(row.installedAt),
        updatedAt: String(row.updatedAt),
        category: assignments[name.toLowerCase()] ?? 'other'
      };
    });
    return {
      meta: { updated: new Date().toISOString(), title: 'Skill Port · 已安装 Skill 清册' },
      categories,
      skills
    };
  } catch (error) {
    if (error instanceof Error && /state\.db 不存在|categories\.json|descriptions\.zh\.json/.test(error.message)) throw error;
    throw new Error('只读 Skill 查询失败；检查 Hub 是否可读及 skills/enablements 表结构是否兼容。');
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
  const destination = resolve(output || join('skill-port-reports', 'installed-skills-' + stamp + '.html'));
  if (!destination.endsWith('.html')) throw new Error('输出必须使用 .html 扩展名。');
  if (existsSync(destination)) throw new Error('输出已存在；请选择新文件名，不覆盖已有报告。');
  const data = readSkills(resolveHub(hub));
  const needsChinese = data.skills
    .filter((skill) => !isChineseDescription(skill.description))
    .map((skill) => ({ name: skill.name, description: skill.hubDescription }));
  if (needsChinese.length) {
    const error = new Error(`中文自查未通过：${needsChinese.length} 个技能描述仍以英文为主。写入 descriptions.zh.json 后重试。`);
    error.needsChinese = needsChinese;
    error.exitCode = 2;
    throw error;
  }
  const reportData = {
    meta: data.meta,
    categories: data.categories,
    skills: data.skills.map(({ hubDescription, ...skill }) => skill)
  };
  const html = renderReport(readFileSync(join(root, 'assets/report.template.html'), 'utf8'), reportData);
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, html, { encoding: 'utf8', flag: 'wx' });
  const enabledCount = reportData.skills.filter((skill) => skill.enablementCount > 0).length;
  const enablementCount = reportData.skills.reduce((n, skill) => n + skill.enablementCount, 0);
  const result = {
    output: destination,
    skills: reportData.skills.length,
    enabledCount,
    enablementCount,
    updated: data.meta.updated
  };
  console.log(JSON.stringify(result, null, 2));
  return result;
}
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(resolve(process.argv[1]))).href) {
  try { main(); }
  catch (error) {
    if (error.needsChinese) console.log(JSON.stringify({ ok: false, needsChinese: error.needsChinese }, null, 2));
    console.error(error.message);
    process.exitCode = error.exitCode ?? 1;
  }
}
