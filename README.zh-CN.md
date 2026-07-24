# Skill Port

<p align="center">
  <img src="apps/desktop/assets/skill-port-icon.png" alt="Skill Port 应用图标" width="128">
</p>

[English](README.md)

**版本：0.5.1** · [更新日志](CHANGELOG.md)

你给 Agent 装的每个 Skill，都是它新学会的一件事。装得多了，Skill 会散在不同项目里：有的重复，有的忘了放在哪里，还有的该更新了。

Skill Port 是一个工具箱。Skill 只收一份，需要时再放进当前项目，或者放到所有 Agent 都能找到的地方。

- **Desktop** 给人用：点一点就能管理。
- **CLI** 给 Agent 用：装好以后，你可以直接让 Agent 替你管理。

## 最省事的办法：交给 Agent

你需要 Node.js 24.15 或更新版本。安装 Git 仓库里的 Skill 时，还需要 Git。

### 第 1 步：安装

```bash
npm install --global skill-port-cli
```

包名是 `skill-port-cli`，命令名是 `sklp`。

### 第 2 步：打开一个新的 Agent 会话

安装时，Skill Port 会把一份很短的使用说明放到：

```text
~/.agents/skills/skill-port
```

兼容的 Agent 会在新会话里发现它。你不用修改 `AGENTS.md`。

### 第 3 步：像平常一样说话

例如：

```text
帮我安装这个 Skill：https://github.com/example/my-skill.git
把 my-skill 启用到当前项目。
检查我的 Skills 有没有问题。
```

Agent 会自己调用 `sklp`，你不用记住命令。

如果它没有发现 Skill Port，执行 `setup` 后再打开一个新会话。仍有问题时，用 `doctor` 检查：

```bash
sklp agent setup
sklp doctor
```

`setup` 可以重复执行，也不会覆盖不属于 Skill Port 的同名文件。`doctor` 只检查，不会修改任何东西。

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
- Git 地址里的凭据不会写进公开目录。

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
