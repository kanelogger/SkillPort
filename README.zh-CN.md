# Skill Port

<p align="center">
  <img src="apps/desktop/assets/skill-port-icon.png" alt="Skill Port 应用图标" width="128">
</p>

[English](README.md)

你给 Agent 装的每个 Skill，都是它新学会的一件事。装得多了，Skill 会散在不同项目里：有的重复，有的忘了放在哪里，还有的该更新了。

Skill Port 是一个工具箱。Skill 只收一份，需要时再放进当前项目，或者放到所有 Agent 都能找到的地方。

- **Desktop** 给人用：点一点就能管理。
- **CLI** 给 Agent 用：装好以后，你可以直接让 Agent 替你管理。

## 快速开始

你需要 Node.js 22.16 或更新版本。安装 Git 仓库里的 Skill 时，还需要 Git。

### 让 Agent 帮你安装

把下面这句话发给能够执行终端命令的编码 Agent：

> 参考 https://github.com/kanelogger/SkillPort 帮我全局安装 Skill Port CLI。先检查 Node.js 是否满足版本要求，再执行 `sklp --version` 和 `sklp agent setup` 验证安装；遇到权限或 PATH 问题时先报告，不要自行绕过。

### 1. 安装 CLI

```bash
npm install --global skill-port-cli
sklp --version
sklp agent setup
```

安装时还会把内置管理 Skill 注册到 `~/.agents/skills/skill-port`。它负责告诉兼容的 Agent 如何操作 `sklp`，与之后由你加入的 Skill 相互独立。

`sklp --version` 输出版本号，并且 `sklp agent setup` 提示 Agent 集成已注册，说明安装成功。`setup` 可以重复执行；如果 npm 没有完成自动注册，它会补建该入口。

### 2. 初始化 Skill Port 并注册项目

把示例路径替换为需要使用 Skill 的项目目录：

```bash
cd ~/projects/my-project
sklp init
```

首次执行 `sklp init` 会在 `~/.skill-port` 创建共享 Hub，并把当前目录注册为项目。以后要注册其他项目，进入对应目录再次执行 `sklp init`；多个项目共用同一个 Hub。

### 3. 把 Skill 加入 Hub

选择一种方式执行：

```bash
# 从 Git 仓库安装
sklp install https://github.com/owner/my-skill.git

# 或者把本地 Skill 复制到 Hub
sklp install ~/skills/my-skill

# 或者链接本地 Skill，继续使用原目录
sklp link ~/skills/my-skill
```

把 URL 或路径替换为真实的 Skill 来源。安装或链接成功后，命令会输出 Skill 名称，例如 `my-skill`。

### 4. 启用 Skill

选择一个目标，使用上一步输出的 Skill 名称：

```bash
# 启用到当前已注册项目
sklp enable my-skill

# 或者启用到共享的全局 Agent 目录
sklp enable my-skill --global
```

然后检查状态：

```bash
sklp doctor
```

启用后打开一个新的 Agent 会话，兼容的 Agent 就能发现这个 Skill。

除了新增的 `~/.agents/skills/skill-port` 管理 Skill，`~/.agents/skills` 中原有的 Skill 不会被改动，可以继续使用。它们不会自动导入 Hub，因此无需处理。

### 更新 Git Skill

先检查，再更新单个 Skill 或整个 Hub：

```bash
sklp update my-skill --check
sklp update my-skill
sklp update --all
```

从分支或仓库默认分支安装的 Skill 会跟随后续提交。从 tag 或 commit 安装的 Skill 会保持固定；普通更新会明确报告固定状态，不再重复安装同一个 revision。需要解除固定时，显式指定新的跟踪 ref：

```bash
sklp update my-skill --ref main
sklp update --all --ref main
```

批量形式会把所有 Git 安装的 Skill 改为指定 ref，并跳过本地复制和 linked Skill。同一次批量检查或更新会按仓库/ref 复用远程查询和 clone。

### 同步 Git Skill 集合

`update` 只刷新已经安装的 Skill。当仓库目录可能新增或删除 Skill 时，使用 `sync`：

```bash
# 预览新增、内容更新和上游缺失项
sklp sync https://github.com/owner/skills.git --path skills --dry-run --json

# 安装新增项、更新已有项，并保留上游缺失的本地副本
sklp sync https://github.com/owner/skills.git --path skills

# 移除未启用的上游缺失 Skill
sklp sync --all --prune

# 显式停用受管目标后，移除已启用的缺失 Skill
sklp sync --all --prune --force
```

新的 Git 安装会把仓库 URL、ref 和扫描目录登记为来源集合，之后 `sklp sync --all` 可以对账全部已登记集合。升级前已经安装的 Git Skill，需要执行一次显式的 `sklp sync <repo> --path <path>`；只有来源匹配的现有 Skill 才会被安全收编。

同步结果会分别列出 `added`、`updated`、`unchanged`、`missing`、`removed` 和 `failed`。普通同步只记录上游缺失状态，保留本地副本。`--prune` 是删除边界：已启用的缺失 Skill 默认跳过，只有同时传入 `--force` 才会先停用再移除。上游 metadata 无效或名称重复时会报告失败，绝不会把它当成删除依据。没有稳定 manifest 标识时，Skill 改名会表现为一个新增项和一个缺失项。

### 查看状态并清理 Hub

为一组明确指定的已安装 Skill 添加同一个私有标签：

```bash
sklp tag add develop code-review-helper skill-creator
sklp tag add develop code-review-helper skill-creator --dry-run --json
sklp list --tag develop
```

批量命令会先验证所有 Skill 和合并后的 32 标签上限，再通过单个事务写入。它保留已有标签，匹配标签和 Skill 名称时忽略大小写。`--dry-run` 以只读方式打开 Hub。私有标签只保存在 Hub 中，不会写入导出目录或 Skill 文件。

查看安装类型、启用数量和健康状态，同时不暴露项目路径：

```bash
sklp list --status
sklp list --status --json
```

先预览，再清理未启用的 Skill 副本：

```bash
sklp prune --dry-run --json
sklp prune --yes
```

`prune` 只考虑没有任何启用记录的 Skill。它只移除所有权可验证的本地或 Git 副本，保留 linked Skill 及其外部源，并跳过无法验证属于 Skill Port 的副本。没有 `--yes` 时不会开始删除。

### 导出可分享目录

生成一个可离线打开、可直接分享的自包含 HTML 文件：

```bash
sklp export
sklp export ./team-skills.html --json
sklp export ./team-skills.html --force
```

默认输出为当前目录下的 `skill-port-catalog.html`。页面支持按名称/描述实时搜索、深浅主题、响应式卡片和点击复制 Skill 名称。已有输出默认保留，只有显式使用 `--force` 才会替换。

导出页面只包含 Skill 名称和描述，不包含 instance ID、发布者标签、安装/启用状态、项目路径或 source URL/path。

## 不想敲命令

安装 [Skill Port Desktop 0.1.4](https://github.com/kanelogger/SkillPort/releases/tag/desktop-v0.1.4)。

1. macOS 下载 `arm64.dmg`（Apple 芯片）或 `x64.dmg`（Intel）；Windows 下载 `Skill Port Setup.exe`。
2. 选择一个项目目录。
3. 安装或链接 Skill，然后选择项目启用或全局启用。

macOS 第一次打开时，可以右键应用并选择“打开”。不要安装已经撤回的 Desktop 0.1.3。完整步骤见 [Desktop 说明](docs/desktop.md)。

## 它会小心什么

- 不覆盖已有的、并非由 Skill Port 管理的文件或链接。
- 删除前先确认目标确实属于 Skill Port。
- `doctor` 永远只读。
- `link` 不会修改或删除你的原始 Skill 目录。
- `prune` 只移除所有权可验证的未启用副本，并保留 linked Skill。
- Git 地址里的凭据不会写进公开目录。
- 静态目录导出只包含公开的名称和描述。

完全卸载：

```bash
sklp uninstall
```

它会要求你输入 `y`，然后只清理经过验证的受管内容。Hub 外的 linked Skill 源目录会留下。

## 需要更多细节时

- [Desktop 安装与开发](docs/desktop.md)
- [支持的目录](docs/supported-targets.md)
- [退出码](docs/exit-codes.md)
- [版本变化](CHANGELOG.md)
- [项目背景与设计决定](CONTEXT.md)
