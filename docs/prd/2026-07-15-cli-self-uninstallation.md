# PRD：Skill Port CLI 自卸载

## Problem Statement

Skill Port 已覆盖 Skill 的安装、启用、停用、移除和 unlink 生命周期，却没有 CLI 自身的卸载入口。通过 npm 全局安装 `skill-port-cli` 的用户需要手动分别删除 npm 包、Hub、Hub 中管理的 Skills、Hub locator，以及已启用到项目和全局 Agent 目录的入口。这既不完整，也难以确认哪些文件属于 Skill Port。

用户需要一个简单、直接、跨平台的生命周期终点：执行 `sklp uninstall`，确认一次，即可删除 Skill Port 管理的所有资源和 CLI 本体。

## Solution

提供终端交互命令 `sklp uninstall`。命令显示 `确认卸载 sklp 并删除其管理的技能？ [y/N]`（按 `SKLP_LANG` 使用对应人类可读语言），只有输入精确的 `y` 才执行。

确认后，命令清理 Hub 记录的 Agent 入口、活动 Hub 及其管理的 Skills、状态和 catalog、对应 Hub locator，并通过 npm 卸载全局 `skill-port-cli` 包和 `sklp` 可执行命令。流程适用于 macOS、Linux 和 Windows。Hub 外部的 linked Skill 源目录与源代码工作区保留。

## User Stories

1. 作为通过 npm 全局安装 Skill Port 的用户，我想执行 `sklp uninstall` 卸载 CLI 本体，以完成软件生命周期。
2. 作为用户，我想在删除前看到一次明确确认，以避免误触发卸载。
3. 作为用户，我想输入精确的 `y` 才开始卸载，以保持操作直接且可预期。
4. 作为用户，我想在输入 `N`、其他内容、空输入或中断输入时保留所有资源，以便安全取消。
5. 作为用户，我想卸载时删除 Hub 内复制安装的 Skills，以免留下 Skill Port 管理的数据。
6. 作为使用 `link` 的用户，我想卸载时删除 Hub 中的 linked Skill 注册和 Agent 入口，以清除 Skill Port 痕迹。
7. 作为使用 `link` 的用户，我想保留 Hub 外的原始 Skill 源目录，以免卸载 CLI 删除我维护的工作内容。
8. 作为在多个项目启用 Skills 的用户，我想卸载时删除 Hub 已记录的所有项目级 Agent 入口，以免项目继续引用已移除的 Hub。
9. 作为启用了全局 Skill 的用户，我想卸载时删除全局 Agent 入口，以免全局目录留下失效链接。
10. 作为使用默认 Hub 的用户，我想卸载时删除默认 Hub、状态数据库、catalog、staging 内容和 locator，以便重新安装时得到干净状态。
11. 作为使用自定义 Hub 的用户，我想卸载当前活动 Hub 及其关联 locator，以便自定义安装也能完整退出。
12. 作为 Hub 已空或部分文件已被手动删除的用户，我想仍能卸载 CLI 本体，以便清理残留安装。
13. 作为遇到单个入口无法删除的用户，我想命令继续尝试其余清理项，并得到明确失败信息，以便尽可能完成卸载。
14. 作为脚本或 CI 用户，我想卸载始终从标准输入读取精确的 `y`，以便没有确认输入时不会发生删除。
15. 作为中文用户，我想在 `SKLP_LANG=zh-CN` 时看到中文提示与结果，以保持现有 CLI 语言体验。
16. 作为英文用户，我想默认看到英文提示与结果，以保持现有 CLI 输出契约。
17. 作为 macOS 用户，我想卸载正确删除目录软链接，以免留下失效 Agent 入口。
18. 作为 Linux 用户，我想得到与 macOS 相同的命令、确认和清理语义，以便跨机器使用一致。
19. 作为 Windows 用户，我想卸载正确处理 Skill Port 创建的目录软链接或 junction，并删除 Windows npm 全局命令包装器，以便没有残留入口。
20. 作为重新安装的用户，我想旧 Hub 和 locator 已清除，以便新的 `sklp init` 从干净状态开始。
21. 作为维护者，我想 `--help` 显示卸载命令及其交互性质，以便用户发现完整生命周期能力。
22. 作为维护者，我想保持 `doctor` 只读，以便自卸载不会改变现有诊断命令的边界。

## Implementation Decisions

- 新增 `uninstall` 作为顶层 CLI 命令。它从标准输入读取确认，不提供确认绕过、`--json`、dry-run、扫描或恢复模式。
- 使用现有双语人类可读输出机制；确认提示的默认选择是 `N`，只有精确小写 `y` 继续。取消不改变任何状态。
- 输入关闭或输入并非精确 `y` 时取消，不清理任何资源。
- 卸载服务位于应用层，负责按 Hub 状态枚举所有已记录的项目级和全局 Agent 入口，并直接移除这些受管入口。Windows 要兼容现有目录 symlink 与 junction 记录；macOS 和 Linux 使用目录 symlink 语义。
- 清理顺序为：已记录的 Agent 入口、活动 Hub 的全部内容与对应 locator、npm 全局 `skill-port-cli` 包。CLI 进程可在最后一步卸载自身，因为命令代码已在运行。
- 通过 Node 的无 shell 子进程调用 npm；调用方式必须兼容 macOS、Linux 和 Windows 的 npm 启动器与全局 bin 布局，且不得把路径或错误输出不加脱敏地直接展示。
- 以 Hub 的现有解析优先级确定本次活动 Hub。仅删除与该 Hub 关联的 locator，避免把不属于本次活动 Hub 的文件纳入清理。
- 完整卸载不要求 Hub 完整或数据库可读：能够识别的清理项继续执行；无法从丢失状态得知的历史项目入口不做文件系统扫描。
- 单个资源删除失败不能阻止后续资源和 npm 包卸载尝试。命令以非零状态返回，并列出用户可操作的失败项。
- Hub 外部 linked Skill 源目录、任意源代码工作区、未记录的 Agent 内容、npm cache 与其他安装渠道均不在清理范围。
- 更新用户文档、命令帮助、退出码说明和需求证据矩阵，使卸载契约、交互限制、支持平台与保留边界可发现且可验证。

## Testing Decisions

- 以已构建 CLI 的黑盒子进程测试作为主要接缝：测试只观察命令输入、退出状态、用户可见输出和最终文件系统状态，不依赖应用层内部实现。
- 扩展现有 CLI 测试辅助能力以提供标准输入，从而覆盖精确 `y`、默认取消、无效输入和中断输入；取消路径必须断言 npm 卸载和任何文件删除均未发生。
- 使用临时 Hub、临时项目和临时全局 Agent 目录构建完整场景，断言 copied Skill、linked Skill 注册、项目入口、全局入口、catalog、数据库和 locator 都被清理。
- 断言 Hub 外 linked Skill 源目录及其 `SKILL.md` 保留；断言未记录的 Agent 内容不被扫描或删除。
- 覆盖空 Hub、缺失 Hub 部分内容、不可读状态库与单项删除失败，断言命令尽力继续清理并提供稳定的非零失败结果。
- 覆盖默认 Hub 与自定义 Hub 解析，确保仅影响本次活动 Hub 及其 locator。
- 覆盖英文和 `SKLP_LANG=zh-CN` 人类可读输出；卸载命令不应产生 JSON 输出契约。
- 扩展现有隔离 npm 包安装 smoke：从临时全局 prefix 运行已安装的 `sklp uninstall`，输入 `y` 后验证 npm 全局包及平台对应的 `sklp` 可执行入口消失。
- 在现有 GitHub Actions macOS、Linux、Windows 矩阵执行 lint、typecheck、全量 CLI 测试、平台测试、Agent 发现 smoke 与 npm 包安装/卸载 smoke。Windows 断言 symlink 或 junction 场景及 `.cmd` 启动器清理。

## Out of Scope

- 桌面端的卸载、桌面应用基础设施或任何桌面功能恢复。
- npm 全局安装以外的 CLI 安装渠道的自动卸载，包括源码工作区、项目本地依赖、包管理器包装器和手工复制文件。
- `--yes`、无确认批处理模式、JSON 输出、dry-run、Home 递归扫描或历史项目路径猜测。
- Hub 外 linked Skill 源目录、源码工作区、未记录的 `.agents` 内容、npm cache 或其他用户数据的删除。
- 修复、恢复或重建损坏的 `state.db`；卸载仅清理可识别资源。
- 更改现有 install、link、enable、disable、remove、unlink 或 doctor 的业务语义。

## Further Notes

- 本 PRD 采用 ADR 0002：CLI 自卸载清理 Skill Port 管理状态，保留 Hub 外 linked Skill 源目录和源码工作区。
- 现有 Hub 中的 `projects` 与 `enablements` 记录是项目级入口的唯一发现来源。状态不可读时，历史项目入口可能无法定位；用户已明确拒绝 Home 递归扫描。
- 当前 CI 已覆盖 macOS、Linux、Windows 三端。npm 包卸载 smoke 应成为三端矩阵的发布前证据。
