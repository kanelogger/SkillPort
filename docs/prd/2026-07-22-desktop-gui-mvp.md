# PRD：Skill Port Desktop GUI MVP

## Problem

Skill Port 的核心生命周期目前只能通过 CLI 使用。需要一个本地桌面界面，让用户在不记忆命令和路径参数的前提下管理同一个 Hub，同时保留 CLI 已验证的安全边界、恢复语义与跨平台行为。

## Solution

在当前仓库新增 Electron Desktop 应用。Renderer 通过受限 preload 和 IPC 调用 utility process；utility process 复用 `DesktopSkillPort` facade，所有持久化行为继续由 `SkillPort` 应用服务执行。GUI 与 CLI 共享 Hub 和 SQLite schema。

MVP 覆盖首次初始化、项目登记、Skill 列表/详情、local/Git/registry 安装预览、link 预览、项目/全局启停、只读 doctor，以及安全 remove/unlink。GUI 支持中英文，默认跟随系统语言。

## Acceptance

- GUI 与 CLI 可交替操作同一 Hub，CLI JSON 和退出码无变化。
- Renderer 无 Node、文件系统、SQLite 或原始 IPC 权限。
- Git 和文件操作不会阻塞窗口主线程。
- 非受管入口不会被覆盖或删除；doctor 保持只读。
- macOS unsigned 包可启动并完成核心生命周期；Windows/Linux 通过 Desktop build、typecheck 与 unit tests。

## Out of Scope

- 批量更新中心、Marketplace、Skill 编辑、标签编辑。
- repair、Desktop 自卸载、自动更新、签名、公证与公开发布。
- 数据库 schema 变更、独立 core/cli package 拆分。
