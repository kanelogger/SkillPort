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
sklp update my-skill
sklp doctor
sklp disable my-skill
sklp remove my-skill
sklp unlink my-local-skill
```

`sklp init` 会初始化本地 Hub，并把当前目录注册为项目。项目启用会在 `.agents/skills/` 下创建受管入口，不会在项目里写 Skill Port 配置文件，也不会读取或修改 Git 配置。

Codex 的项目和全局启用都使用 Agent Skill 目录：项目内是 `<project>/.agents/skills/`，全局是 `~/.agents/skills/`。

默认 Hub 是 `~/.skill-port`。可以用 `SKLP_HOME` 或 `sklp init --hub <path>` 指定隔离 Hub。

## 中文输出

设置 `SKLP_LANG=zh-CN` 后，人类可读输出会优先使用中文：

```bash
SKLP_LANG=zh-CN sklp --help
SKLP_LANG=zh-CN sklp install ./path/to/a-skill
SKLP_LANG=zh-CN sklp doctor
```

命令说明和主要操作反馈都会使用中文。`--json` 输出保持稳定，不随语言切换改变字段名，方便脚本和 Agent 调用。

## 实用案例：一个 Skill 在多个项目里复用

假设团队把 `debugging-playbook` Skill 放在一个共享 Git 仓库里。某个开发者今天要在后端服务项目里使用它，明天想让 Codex 全局可用，同时还要在团队更新 Skill 后能方便同步。

先注册服务项目，并把共享 Skill 安装到本机 Hub：

```bash
cd ~/work/billing-service
sklp init
sklp install https://github.com/example/debugging-playbook.git --ref v1.0.0
```

此时 Skill 只存放在 `~/.skill-port` 里一份，当前服务项目也已经被 Skill Port 记录。接着在项目里启用它：

```bash
sklp enable debugging-playbook
```

Skill Port 会在 `~/work/billing-service/.agents/skills/` 下创建受管入口。项目可以使用这个 Skill，但不会把 Skill 源码复制进仓库，也不会添加 Skill Port manifest 或修改 Git 配置。

之后，如果开发者希望 Codex 在所有工作区都能使用这个 Skill，可以启用到 Codex 全局目录：

```bash
sklp enable debugging-playbook --global codex
```

对 Codex 来说，这个全局受管入口会写到 `~/.agents/skills/`。

项目启用和全局启用会分别记录，因此可以只移除其中一个目标，不影响另一个：

```bash
sklp disable debugging-playbook --global codex
sklp disable debugging-playbook
```

团队发布新版本后，更新 Hub 里的 Skill，并检查启用位置和状态漂移：

```bash
sklp update debugging-playbook
sklp info debugging-playbook
sklp doctor
```

`sklp info` 会显示 Skill 当前启用到哪里。`sklp doctor` 是只读诊断，会检查缺失文件、非受管目标入口、断开的链接或 catalog 漂移，并为每条诊断给出可执行建议。

如果开发者正在本地编辑这个 Skill，使用 `link` 更合适：

```bash
sklp link ~/work/skills/debugging-playbook
sklp enable debugging-playbook
```

Hub 会记录这个 Skill，但项目和全局启用入口会指回本地源目录。修改 `~/work/skills/debugging-playbook/SKILL.md` 后，已启用的 Agent 能立即看到变化。本地开发结束后：

```bash
sklp unlink debugging-playbook
```

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
sklp install ./registry/sources.json --skip-existing
```

`sources.json` 中每个条目需要提供 `local_path`。如果 `local_path/SKILL.md` 存在，就安装这个目录；否则会扫描 `local_path/**/SKILL.md`，把每个具体 Skill 子目录逐个安装。相对 `local_path` 会先按 `sources.json` 所在目录解析；如果不存在，再按父目录解析，以兼容 `registry/sources.json` 指向 `warehouse/...` 的布局。使用 `--dry-run` 可以先预览将要安装的 Skill，不改写 Hub。重复导入 registry 时，可以用 `--skip-existing` 跳过已安装 Skill。registry 安装会在写入前检查同一批导入里的同名 Skill，避免装到一半才失败。

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

## 退出码

查看完整说明：[exit codes](docs/exit-codes.md)。

- `0`：命令成功；`doctor` 只有 warning 时也返回 `0`。
- `1`：命令失败；或 `doctor` 发现至少一个 error 级诊断。

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

`doctor` 只读，不会修复或改写状态。它会检查 Hub、SQLite、Skill 内容、metadata、catalog、项目、启用入口和链接漂移，并为每条诊断输出可执行建议。

## 安全边界

- 不覆盖非 Skill Port 管理的文件、目录或链接。
- `remove` 默认拒绝删除仍被启用的 Skill。
- `remove --force` 只会移除验证过的受管入口。
- Git 命令不通过 shell 执行。
- Git URL 中的凭据会被脱敏。
