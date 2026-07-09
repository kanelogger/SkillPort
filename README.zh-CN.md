# Skill Port CLI

[English](README.md)

Skill Port CLI 是一个本地 Agent Skill 管理工具。它把 Skill 安装到本机 Hub，再启用到项目或全局 Agent 目录。

## 环境要求

- Node.js 24.15 或更新版本
- Git 可在 `PATH` 中使用，Git 来源安装需要它

## 安装

```bash
npm install --global skill-port-cli
```

npm 包名是 `skill-port-cli`，命令名是 `sklp`。

## 常用流程

```bash
sklp init
sklp install ./path/to/a-skill
sklp link ./path/to/a-local-skill
sklp list
sklp info my-skill
sklp enable my-skill
sklp enable my-skill --global codex
sklp doctor
sklp disable my-skill
sklp remove my-skill
sklp unlink my-local-skill
```

`sklp init` 会初始化本地 Hub，并把当前目录注册为项目。项目启用会在 `.agents/skills/` 下创建受管入口，不会在项目里写 Skill Port 配置文件，也不会读取或修改 Git 配置。

默认 Hub 是 `~/.skill-port`。可以用 `SKLP_HOME` 或 `sklp init --hub <path>` 指定隔离 Hub。

## 安装 Skill

安装单个本地 Skill：

```bash
sklp install ./path/to/a-skill
```

安装 Git 来源：

```bash
sklp install https://github.com/example/my-skill.git
sklp install https://github.com/example/my-skill.git --ref v1.2.0
```

安装 registry 文件：

```bash
sklp install ./registry/sources.json
sklp install ./registry/sources.json --dry-run
```

`sources.json` 中每个条目需要提供 `local_path`。如果 `local_path/SKILL.md` 存在，就安装这个目录；否则会扫描 `local_path/**/SKILL.md`，把每个具体 Skill 子目录逐个安装。相对 `local_path` 会先按 `sources.json` 所在目录解析；如果不存在，再按父目录解析，以兼容 `registry/sources.json` 指向 `warehouse/...` 的布局。使用 `--dry-run` 可以先预览将要安装的 Skill，不改写 Hub。registry 安装会在写入前检查同名 Skill 和已安装 Skill，避免装到一半才失败。

## 本地开发态 link

如果你正在编辑一个本地 Skill，用 `link`：

```bash
sklp link ./path/to/a-local-skill
sklp enable my-skill
```

linked Skill 不会被复制进 Hub，Hub 入口会指向原始目录。你修改源目录后，项目或全局 Agent 能直接看到变化。

移除 linked 注册：

```bash
sklp unlink my-skill
sklp unlink my-skill --force
```

`unlink` 不会删除原始源目录。存在启用入口时，默认拒绝；`--force` 会先移除受管入口。

## Skill 元数据

每个 Skill 的 `SKILL.md` 必须以 YAML frontmatter 开头：

```yaml
---
name: my-skill
description: 这个 Skill 能帮助 Agent 做什么。
---
```

名称只能使用小写字母、数字和单个连字符。已安装的 Skill 名称必须唯一；同名时请修改来源 Skill 的 `SKILL.md`。

## 全局目标

查看支持的目标：[supported targets](docs/supported-targets.md)。

```bash
sklp enable my-skill --global claude
sklp disable my-skill --global claude
```

全局启用总是只作用于指定工具，不会同时写多个 Agent 目录。

## 机器可读输出

面向脚本和 Agent，可以使用 `--json`：

```bash
sklp install ./registry/sources.json --json
sklp install ./registry/sources.json --dry-run --json
sklp list --json
sklp enable my-skill --json
sklp doctor --json
```

`sklp info <skill>` 默认输出 JSON。

## Catalog 和隐私

Hub 会自动维护：

- `catalog.json`：给机器读取
- `catalog.md`：给人阅读
- `skills/<name>/meta.json`：复制安装的 Skill 注册信息

catalog 只包含 `instanceId`、`name` 和 `description`。项目关联、source path 等本地状态保存在 SQLite 里。linked 本地源目录不会被写入 `meta.json`。

## 诊断

```bash
sklp doctor
sklp doctor --json
```

`doctor` 只读，不会修复或改写状态。它会检查 Hub、SQLite、Skill 内容、metadata、catalog、项目、启用入口和链接漂移。

## 安全边界

- 不覆盖非 Skill Port 管理的文件、目录或链接。
- `remove` 默认拒绝删除仍被启用的 Skill。
- `remove --force` 只会移除验证过的受管入口。
- Git 命令不通过 shell 执行。
- Git URL 中的凭据会被脱敏。
