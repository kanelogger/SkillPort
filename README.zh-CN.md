# Skill Port CLI

<p align="center">
  <img src="apps/desktop/assets/skill-port-icon.png" alt="Skill Port 应用图标" width="128">
</p>

[English](README.md)

**版本: 0.5.1** · [更新日志](CHANGELOG.md)

Skill Port 是一个本地 Agent Skill 管理工具。它把 Skill 安装到本机 Hub，再启用到项目或全局 Agent 目录。`sklp` 命令行工具和可选的[桌面 GUI](#桌面-gui) 共享同一个 Hub 和相同的安全规则。

## 环境要求

- Node.js 24.15 或更新版本
- Git 可在 `PATH` 中使用，Git 来源安装需要它
- 本项目使用 [npm workspaces](https://docs.npmjs.com/cli/v11/using-npm/workspaces)

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
sklp enable my-skill --global
sklp update my-skill
sklp doctor
sklp disable my-skill
sklp remove my-skill
sklp unlink my-local-skill
sklp uninstall
```

`sklp init` 会初始化本地 Hub，并把当前目录注册为项目。项目启用会在 `.agents/skills/` 下创建受管入口，不会在项目里写 Skill Port 配置文件，也不会读取或修改 Git 配置。

项目启用使用 `<project>/.agents/skills/`；唯一的全局目标是 `~/.agents/skills/`。

默认 Hub 是 `~/.skill-port`。可以用 `SKLP_HOME` 或 `sklp init --hub <path>` 指定隔离 Hub。

## 桌面 GUI

Skill Port Desktop 是一个 Electron GUI，与 CLI 共享相同的 Hub 和核心安全规则。它支持 Skill 安装、链接、Hub 内标签编辑、项目/全局启用、只读诊断，以及带确认的 Git Skill 更新预览。

可以从 [GitHub Releases](https://github.com/kanelogger/SkillPort/releases) 下载 macOS 或 Windows 安装包。开发环境搭建、构建命令和发布说明请查看 [Skill Port Desktop](docs/desktop.md)。

Desktop 标签使用 `desktop-v*` 前缀。Desktop 不包含在已发布的 `skill-port-cli` npm 包中。

## Desktop API (Node.js)

本包为 Node.js 消费者导出了 Desktop 集成入口：

```ts
import { DesktopSkillPort } from "skill-port-cli/desktop";
```

公开类型包括 `DesktopSkillPort`、`DesktopBootstrapState`、`DesktopSkillDetails`、`DesktopHealth`、`Diagnostic`、`Enablement` 以及更新相关类型。详见 [desktop.ts](src/desktop.ts)。

## 卸载

```bash
sklp uninstall
```

命令会提示 `确认卸载 sklp 并删除其管理的技能？ [y/N]`，只有输入精确的 `y` 才会继续。它会删除 Hub 已记录的 Agent 入口、当前 Hub 与其管理的 Skills、匹配的 Hub locator，以及 npm 全局 `skill-port-cli` 包。Hub 外的 linked Skill 源目录和当前源码工作区会保留。`sklp uninstall` 不提供 `--yes` 或 `--json` 模式。

## 中文输出

设置 `SKLP_LANG=zh-CN` 后，人类可读输出会优先使用中文：

```bash
SKLP_LANG=zh-CN sklp --help
SKLP_LANG=zh-CN sklp install ./path/to/a-skill
SKLP_LANG=zh-CN sklp doctor
```

命令说明和主要操作反馈都会使用中文。`--json` 输出保持稳定，不随语言切换改变字段名，方便脚本和 Agent 调用。

## 实用案例：一个 Skill 在多个项目里复用

假设团队把 `debugging-playbook` Skill 放在一个共享 Git 仓库里。某个开发者今天要在后端服务项目里使用它，明天想让它在共享全局 Agent 目录可用，同时还要在团队更新 Skill 后能方便同步。

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

之后，如果开发者希望共享全局 Agent 目录可用这个 Skill，可以这样启用：

```bash
sklp enable debugging-playbook --global
```

这个全局受管入口会写到 `~/.agents/skills/`。

项目启用和全局启用会分别记录，因此可以只移除其中一个目标，不影响另一个：

```bash
sklp disable debugging-playbook --global
sklp disable debugging-playbook
```

团队发布新版本后，更新 Hub 里的 Skill，并检查启用位置和状态漂移：

```bash
sklp update debugging-playbook
sklp info debugging-playbook
sklp doctor
```

`sklp info` 会显示 Skill 当前启用到哪里。`sklp doctor` 是只读诊断，会检查缺失文件、非受管目标入口、断开的链接或 catalog 漂移，并为每条诊断给出可执行建议。

更新前可以检查复制安装的 Git Skill：

```bash
sklp update debugging-playbook --check
sklp update debugging-playbook --check --json
```

默认分支和分支跟踪的 Skill 会报告 `up-to-date` 或 `outdated`。commit 和 tag 选择会报告 `pinned`，检查不会推进它们。无法访问或无法可靠判定的 legacy source 会报告 `unknown` 并以非零退出。检查完全只读：不会修改 Hub、catalog、SQLite 状态或受管入口。

可以先查看或预览全部已安装 Skill，再决定批量更新：

```bash
sklp update --all --check
sklp update my-skill --dry-run --json
sklp update --all --dry-run --json
sklp update --all --json
```

批量检查按名称排序。本地复制和 linked Skill 会以稳定原因跳过；tag 与 commit 固定版本会以 `pinned` 跳过。`--dry-run` 会解析将要更新的精确 revision，但不修改 Hub。`--all` 只更新复制安装的 Git Skill；单个 Skill 失败不会回滚已经完成的更新，也不会阻止后续 Skill，并在 JSON 中输出 `updated`、`skipped` 和 `failed` 数组。

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
sklp install https://github.com/example/skills.git --ref main --path skills/review-animations
sklp install https://github.com/example/skills/tree/main/skills/review-animations
```

当 Git 仓库里的 Skill 不在仓库根目录时，用 `--path` 指定仓库内路径。也可以直接粘贴 GitHub 浏览器里的 `tree/<ref>/<path>` URL。若选中的 Git 路径本身没有 `SKILL.md`，Skill Port 会扫描该路径下的多个 Skill 目录。多 Skill 导入中的无效同级元数据不会阻止有效 Skill 安装。当 GitHub URL 一次安装至少两个新的有效 Skill 时，每个 Skill 会获得 GitHub owner 对应的 Hub 内发布者标签；用 `sklp list --tag <owner>` 可按标签进行大小写不敏感的筛选。`--dry-run --json` 会列出可安装、已跳过和会失败的条目，真实安装写入前仍会先检查同一批导入里的同名 Skill。Git 命令会关闭终端凭据提示，默认 30 秒超时；可用 `SKLP_GIT_TIMEOUT_MS` 设置其他正整数毫秒值。

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
sklp enable my-skill --global
sklp disable my-skill --global
```

全局启用只作用于共享的 `~/.agents/skills/`，不会写入其他 Agent 目录。

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

`sklp info <skill>` 默认输出 JSON。公开的 Skill JSON 包含 `tags` 数组；标签仅保存在 Hub 内，不会出现在 catalog 中。符合条件的导入会推断发布者标签，Skill Port Desktop 可显式编辑同一组 Hub 私有标签。

带 `--json` 的运行时命令失败会把固定 JSON envelope 写入 stdout，stderr 保持为空：

```json
{
  "error": {
    "code": "COMMAND_FAILED",
    "message": "Skill not installed: example-skill"
  }
}
```

`doctor --json` 保持原有 diagnostics payload，方便脚本逐项处理健康检查结果。

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

## 维护者发布

### CLI 发布

npm 包由本地发布。请在干净、已与远端同步的 `main` 分支运行发布命令；本机需要 Node.js 24.15.0 或更高版本，并且当前 npm 账号拥有 `skill-port-cli` 的发布权限：

```bash
npm run release -- patch --note "描述本次面向用户的改动"
```

可将 `patch` 换成 `minor`、`major` 或精确的稳定版本号；多项改动可重复传入 `--note`。脚本会检查 npm 登录状态和版本占用情况，运行全部 CLI 发布门禁，更新版本元数据和 changelog，创建发布提交与 tag，在本机发布 npm 包，推送 `main` 和 tag，最后安装线上包执行冒烟测试。如果发布提交创建后 npm 发布或 Git 推送失败，修复原因后运行 `npm run release -- --resume` 继续。

### Desktop 发布

Desktop 使用独立的发布脚本：它运行本地质量门禁，更新 Desktop 工作区版本和 lockfile，提交并创建 `desktop-v*` 标签。GitHub Actions 随后构建 macOS 和 Windows 安装包并创建 GitHub Release。

```bash
npm run release:desktop -- patch
```

可将 `patch` 换成 `minor`、`major` 或精确版本号。详见 [docs/desktop.md](docs/desktop.md)。
