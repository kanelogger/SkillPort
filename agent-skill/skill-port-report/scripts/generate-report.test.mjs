import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync, symlinkSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Script } from 'node:vm';
import { readSkills, resolveHub, renderReport, main, isChineseDescription } from './generate-report.mjs';
const template = readFileSync(new URL('../assets/report.template.html', import.meta.url), 'utf8');

function fixture(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'sklp-skill-report-'));
  try {
    const db = new DatabaseSync(join(dir, 'state.db'));
    db.exec(`
      CREATE TABLE skills(
        instance_id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE COLLATE NOCASE,
        description TEXT NOT NULL,
        source_type TEXT NOT NULL,
        source_location TEXT NOT NULL,
        source_ref TEXT,
        source_revision TEXT,
        installed_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE skill_tags(skill_id TEXT NOT NULL, tag TEXT NOT NULL, PRIMARY KEY(skill_id, tag));
      CREATE TABLE enablements(
        id INTEGER PRIMARY KEY,
        skill_id TEXT NOT NULL,
        target_type TEXT,
        target_key TEXT,
        target_path TEXT,
        entry_path TEXT,
        link_type TEXT,
        created_at TEXT
      );
      INSERT INTO skills VALUES
        ('id-local','alpha-skill','用于报告测试的本地复制技能，描述保持中文。','local','/secret/local',NULL,NULL,'2026-08-01T00:00:00.000Z','2026-08-01T00:00:00.000Z'),
        ('id-git','beta-skill','用于报告测试的远端复制技能，描述保持中文。','git','https://example.com/repo.git','main','abc','2026-08-02T00:00:00.000Z','2026-08-02T00:00:00.000Z'),
        ('id-link','gamma-skill','用于报告测试的链接技能，描述保持中文。','local','/secret/link',NULL,NULL,'2026-08-03T00:00:00.000Z','2026-08-03T00:00:00.000Z'),
        ('id-code','code-review','Review code','local','/secret/code',NULL,NULL,'2026-08-04T00:00:00.000Z','2026-08-04T00:00:00.000Z');
      INSERT INTO skill_tags VALUES('id-local','work'),('id-local','cli'),('id-git','git');
      INSERT INTO enablements(id,skill_id,target_type,target_key,target_path,entry_path,link_type,created_at) VALUES
        (1,'id-local','project','/proj','/proj','/proj/.agents/skills/alpha-skill','symlink','2026-08-01'),
        (2,'id-local','global','global','/home','/home/.agents/skills/alpha-skill','symlink','2026-08-01'),
        (3,'id-code','project','/proj','/proj','/proj/.agents/skills/code-review','symlink','2026-08-04');
    `);
    db.close();
    mkdirSync(join(dir, 'skills'), { recursive: true });
    const linkTarget = mkdtempSync(join(tmpdir(), 'sklp-link-src-'));
    try {
      symlinkSync(linkTarget, join(dir, 'skills', 'gamma-skill'), process.platform === 'win32' ? 'junction' : 'dir');
      fn(dir);
    } finally {
      rmSync(linkTarget, { recursive: true, force: true });
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('installed skills include zero enablements, kinds, tags, and categories without source paths', () => fixture((dir) => {
  const data = readSkills(dir);
  assert.equal(data.skills.length, 4);
  assert.deepEqual(data.skills.map((skill) => skill.name), ['alpha-skill', 'beta-skill', 'code-review', 'gamma-skill']);
  assert.deepEqual(data.skills.map((skill) => skill.installationKind), ['local-copy', 'git-copy', 'local-copy', 'linked']);
  assert.deepEqual(data.skills.map((skill) => skill.enablementCount), [2, 0, 1, 0]);
  assert.deepEqual(data.skills[0].tags, ['cli', 'work']);
  assert.equal(data.skills.find((skill) => skill.name === 'code-review').category, 'build');
  assert.equal(data.skills.find((skill) => skill.name === 'alpha-skill').category, 'other');
  assert.match(data.skills.find((skill) => skill.name === 'code-review').description, /[\u4e00-\u9fff]/);
  const json = JSON.stringify(data);
  assert.equal(json.includes('/secret/'), false);
  assert.equal(json.includes('https://example.com'), false);
  assert.equal(json.includes('entry_path'), false);
}));

test('read-only snapshot leaves database contents unchanged', () => fixture((dir) => {
  const before = readFileSync(join(dir, 'state.db'));
  readSkills(dir);
  assert.deepEqual(readFileSync(join(dir, 'state.db')), before);
}));

test('Hub resolution precedence and locator validation', () => fixture((dir) => {
  assert.equal(resolveHub(dir, { SKLP_HOME: '/ignored' }, dir), dir);
  writeFileSync(join(dir, '.skill-port.json'), JSON.stringify({ hubPath: dir }));
  assert.equal(resolveHub(undefined, {}, dir), dir);
  writeFileSync(join(dir, '.skill-port.json'), 'bad');
  assert.throws(() => resolveHub(undefined, {}, dir));
}));

test('approved template keeps the confirmed inventory layout', () => {
  assert.match(template, /已安装 Skill 清册/);
  assert.match(template, /<th>技能<\/th><th>分类<\/th><th>安装时间<\/th>/);
  assert.match(template, /id="category"/);
  assert.match(template, /<!-- SKILL_PORT_DATA -->/);
  assert.equal(template.includes('id="kind"'), false);
  assert.equal(template.includes('全部类型'), false);
  assert.equal(template.includes('>类型<'), false);
  assert.equal(template.includes('>启用数<'), false);
});

test('tertiary text keeps WCAG AA contrast in both color schemes', () => {
  const [light, dark] = [...template.matchAll(/:root\{([^}]*)\}/g)].map((m) => m[1]);
  const token = (block, name) => block.match(new RegExp('--' + name + ':\\s*([^;]+)'))[1].trim();
  const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const luminance = (hex) => {
    const [r, g, b] = rgb(hex).map((v) => {
      const x = v / 255;
      return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const contrast = (fg, bg) => {
    const [hi, lo] = [luminance(fg), luminance(bg)].sort((a, b) => b - a);
    return (hi + 0.05) / (lo + 0.05);
  };
  const over = (fg, bg, alpha) => '#' + rgb(fg).map((v, i) =>
    Math.round(v * alpha + rgb(bg)[i] * (1 - alpha)).toString(16).padStart(2, '0')).join('');
  const cases = [
    [token(light, 'text-tertiary'), token(light, 'surface')],
    [token(light, 'text-tertiary'), token(light, 'bg-deep')],
    [token(dark, 'text-tertiary'), token(dark, 'surface')],
    [token(dark, 'text-tertiary'), over('#ffffff', token(dark, 'surface'), 0.05)]
  ];
  for (const [fg, bg] of cases) {
    const ratio = contrast(fg, bg);
    assert.ok(ratio >= 4.5, fg + ' on ' + bg + ' = ' + ratio.toFixed(2));
  }
});

test('single-file HTML escapes script injection and preserves skill fields', () => {
  const data = { skills: [], note: '</script><script>bad</script> $&' };
  const html = renderReport(template, data);
  assert.doesNotMatch(html, /<script[^>]+src=|@import|fonts.googleapis/);
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  assert.equal(scripts.length, 2);
  for (const script of scripts) new Script(script);
  const context = { window: {} };
  new Script(scripts[0]).runInNewContext(context);
  assert.equal(context.window.SKILL_PORT_DATA.note, data.note);
});

test('generation and overwrite rejection use only isolated fixtures', () => fixture((dir) => {
  const output = join(dir, 'report.html');
  const result = main(['--hub', dir, '--output', output]);
  assert.ok(existsSync(output));
  assert.equal(result.skills, 4);
  assert.equal(result.enabledCount, 2);
  assert.equal(result.enablementCount, 3);
  writeFileSync(output, 'sentinel');
  assert.throws(() => main(['--hub', dir, '--output', output]));
  assert.equal(readFileSync(output, 'utf8'), 'sentinel');
  assert.throws(() => main(['--output']));
  assert.throws(() => main(['--output', join(dir, 'bad.txt')]));
  assert.throws(() => renderReport('no marker', {}));
}));

test('Agent discovery junction entry actually executes generation', () => fixture((dir) => {
  const entry = join(dir, 'skill-entry');
  symlinkSync(fileURLToPath(new URL('../', import.meta.url)), entry, process.platform === 'win32' ? 'junction' : 'dir');
  const output = join(dir, 'junction-report.html');
  const result = spawnSync(process.execPath, [join(entry, 'scripts/generate-report.mjs'), '--hub', dir, '--output', output], { encoding: 'utf8', shell: false });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).skills, 4);
  assert.ok(existsSync(output));
}));

test('non-chinese descriptions block report generation', () => fixture((dir) => {
  const db = new DatabaseSync(join(dir, 'state.db'));
  db.prepare("UPDATE skills SET description=? WHERE name='alpha-skill'").run('Create polished diagrams for local systems and workflows.');
  db.close();
  const output = join(dir, 'blocked.html');
  assert.equal(isChineseDescription('Create polished diagrams for local systems and workflows.'), false);
  assert.throws(() => main(['--hub', dir, '--output', output]), /中文自查未通过/);
  assert.equal(existsSync(output), false);
}));

test('missing database is not created', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sklp-missing-'));
  try {
    assert.throws(() => readSkills(dir));
    assert.equal(existsSync(join(dir, 'state.db')), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('empty skills table produces an empty skill list', () => fixture((dir) => {
  const db = new DatabaseSync(join(dir, 'state.db'));
  db.exec('DELETE FROM enablements; DELETE FROM skill_tags; DELETE FROM skills');
  db.close();
  assert.deepEqual(readSkills(dir).skills, []);
}));

test('missing skill_tags table still lists skills', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sklp-notags-'));
  try {
    const db = new DatabaseSync(join(dir, 'state.db'));
    db.exec(`
      CREATE TABLE skills(
        instance_id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL,
        source_type TEXT NOT NULL, source_location TEXT NOT NULL, source_ref TEXT,
        source_revision TEXT, installed_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE TABLE enablements(id INTEGER PRIMARY KEY, skill_id TEXT NOT NULL);
      INSERT INTO skills VALUES('id-1','solo','Solo skill','local','/secret',NULL,NULL,'2026-08-01T00:00:00.000Z','2026-08-01T00:00:00.000Z');
    `);
    db.close();
    const data = readSkills(dir);
    assert.equal(data.skills.length, 1);
    assert.deepEqual(data.skills[0].tags, []);
    assert.equal(data.skills[0].installationKind, 'local-copy');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
