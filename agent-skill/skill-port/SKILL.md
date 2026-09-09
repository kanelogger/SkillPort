---
name: skill-port
description: 使用 sklp CLI 管理本地 Agent Skills。适用于初始化 Skill Port Hub；从本地目录、Git URL 或 sources.json registry 安装或链接 Skill；检查、标记、启用、停用、更新和同步 Skill；诊断、导出、清理、移除、取消链接或卸载受管状态；以及设置 Agent 集成。
---

# Skill Port

<!-- sklp-cli-surface-sha256: aa3570f25a1382403ea61aa7b13bfb44338d1ce9dbf3ba97bfc07754cf0c5367 -->

使用 `sklp` 管理 Agent Skill 生命周期。不要手工编辑 Hub、项目内的 `.agents/skills/`、全局 `~/.agents/skills/` 或 `~/.agents/skills/skill-port`。

## 执行原则

1. 先识别用户要求的是只读检查、预览还是变更。构造不熟悉的命令前运行 `sklp <command> --help`；自动化场景优先使用 `--json`。人类可读中文输出可设置 `SKLP_LANG=zh-CN`，JSON 字段不随语言变化。
2. 项目级操作从已初始化项目内运行，或显式传入 `--project <path>`。只有用户明确要求全局可用时才使用 `--global`；`--project` 与 `--global` 不能同时使用。
3. 检查或诊断请求不得隐含授权任何变更。优先使用支持的 `--dry-run` 或 `--check`；`sklp doctor --json` 始终只读。
4. 变更完成后用对应的读取命令核验：安装、启用和健康汇总用 `sklp list --status --json`，单个 Skill 用 `sklp info <skill> --json`，整体漂移用 `sklp doctor --json`。

## 初始化与 Agent 集成

- 使用 `sklp init --json` 初始化默认 Hub 并注册当前项目；需要其他项目或 Hub 时分别使用 `--project <path>`、`--hub <path>`。
- npm 全局安装后 Agent 仍无法发现本管理 Skill 时，运行 `sklp agent setup --json`。该命令不要求 Hub 已初始化，可重复执行，并拒绝覆盖非 Skill Port 管理的 `~/.agents/skills/skill-port`；不要改写 `AGENTS.md` 作为替代方案。

## 安装与链接

- `sklp install <source>` 支持本地 Skill 目录、Git URL，以及名为 `sources.json` 的本地 registry 文件。对 Git、多 Skill 或 registry 来源，先运行 `sklp install <source> --dry-run --json`。
- Git 来源可用 `--ref <branch|tag|commit>` 选择版本，用 `--path <path>` 扫描仓库子目录。registry 来源不能与 `--ref` 或 `--path` 组合。
- 用户要持续跟踪最新稳定 release 时使用 `--track-tags "<glob>"`（如 `--track-tags "skill-v*"`）：安装解析匹配 glob 且含语义化版本号的最高 tag，排除 `-beta` 类预发布后缀；之后普通 `update` 和 `update --all` 会自动跟进新 release。`--track-tags` 不能与 `--ref` 组合，也不能用于 registry、GitHub tree URL 或本地目录。
- 批量来源中允许保留已安装项时，在预览和执行阶段都使用 `--skip-existing`；否则重复名称会让整批预检失败，不产生部分安装。
- 只有用户要持续使用原目录时才运行 `sklp link <local-directory> --json`。`link` 不复制、不修改也不删除外部源目录。

## 检查、标签与启停

- `sklp list --status --json` 返回安装类型、启用数量和聚合健康状态，但不暴露项目或来源路径；`sklp list --tag <tag> --json` 按私有标签筛选；`sklp info <skill> --json` 查看单项来源、启用和健康详情。
- 为明确的一组 Skill 添加私有标签时，先运行 `sklp tag add <tag> <skills...> --dry-run --json`，再执行不带 `--dry-run` 的同一命令。批量写入是原子的，名称和标签匹配不区分大小写，每个 Skill 最多 32 个标签；标签不会写入 Skill 文件或公开 catalog。
- `sklp enable <skill>` 和 `sklp disable <skill>` 默认作用于当前已注册项目。其他项目使用 `--project <path>`，共享全局目标使用 `--global`。不要覆盖或接管非 Skill Port 管理的目标入口。

## 更新与 Git 集合同步

- 检查单个或全部 Git Skill：`sklp update <skill> --check --json` 或 `sklp update --all --check --json`。查看实际更新计划可改用 `--dry-run`；`--check` 与 `--dry-run` 不能组合。
- 用户要求“更新并同步所有 Skill”时必须顺序执行：先用 `sklp update --all --dry-run --json` 预览并运行 `sklp update --all --json`，再用 `sklp sync --all --skip-existing --dry-run --json` 预览并运行 `sklp sync --all --skip-existing --json`；最后运行 `sklp update --all --check --json`、`sklp list --status --json` 和 `sklp doctor --json` 核验。不要并发 update 与 sync。
- 批量 update/sync 即使成功处理部分 Skill，只要 `failed` 非空仍会返回退出码 `1`。必须读取 JSON 中的 `failed`，只重试失败项，不能把部分成功报告为全部成功。Git 命令每次默认限时 60 秒，超时会自动重试一次；两次仍超时时，可对失败项设置更大的 `SKLP_GIT_TIMEOUT_MS` 后重试。
- 普通 `update` 只跟进分支、默认分支或 `--track-tags` 安装时的 tag 模式。tag/commit 固定的 Skill 会保持 pinned；用户明确要改跟踪版本时运行 `sklp update <skill> --ref <ref> --json` 或 `sklp update --all --ref <ref> --json`。`--ref` 不能与 `--check` 或 `--dry-run` 组合，批量更新会跳过本地 copied 和 linked Skill。
- 用户要把已有 Git Skill 改为跟踪最新 release tag 时运行 `sklp update <skill> --track-tags "<glob>" --json`（或 `update --all --track-tags`）；规则与 `--ref` 相同：不能与 `--ref`、`--check` 或 `--dry-run` 组合。改回分支或固定版本用 `--ref`，会清除 tag 模式。tag-pattern Skill 的 `--check` 输出会附带解析出的 `remoteRef`。
- `update` 只刷新已安装 Skill；Git 仓库目录可能新增或移除 Skill 时使用 `sync`。先以同样的范围、`--skip-existing` 和删除选项运行预览，确认结果后再移除 `--dry-run`。
- `sklp sync <source> [--ref <ref>] [--track-tags "<glob>"] [--path <path>] [--skip-existing]` 同步一个集合；`sklp sync --all [--skip-existing]` 同步已登记的全部集合，且不能与 `--ref`、`--track-tags` 或 `--path` 组合。`--force` 必须与 `--prune` 组合。
- `sync --skip-existing` 会把已由其他来源安装或管理的同名 Skill 放入 `skipped`，不覆盖、不改绑来源，也不因此返回失败；上游内部重名、无效 metadata、来源损坏和拉取失败仍进入 `failed`。全量多来源同步默认使用该选项，并向用户报告所有 skipped 项。
- 普通 sync 会新增、更新并记录 upstream-missing Skill，但保留本地副本。只有 `--prune` 才删除可安全移除的 missing Skill；已启用项仍会跳过，除非用户明确授权 `--force` 先停用受管目标再删除。无效或重复的上游 metadata 只能记为失败，不能作为删除依据。
- 删除或 prune 掉来源集合的最后一个成员时，集合登记会自动注销，之后的 `sklp sync --all` 不会访问它或重新安装该 Skill。多成员集合仍按集合级同步管理，被单独 remove 的成员可能被再次发现。
- 用户要求停止整个来源集合的对账、同时保留已安装 Skill 时，使用 `sklp sync --forget <source> [--ref <ref> | --track-tags "<glob>"] [--path <path>]`：先输出 `--dry-run --json` 预览要注销的精确 scope 和保留的 Skill，再执行不带 `--dry-run` 的同一命令。forget 不删除已安装 Skill、Hub 内容、enablements 或 catalog，也不访问 Git 远端；不能与 `--all`、`--prune`、`--force` 或 `--skip-existing` 组合。不得建议用户手改 SQLite 来清理来源登记。

## 导出与删除

- `sklp export [output] --json` 生成只含名称和描述的离线 catalog，不包含标签、项目、来源、凭据或启用状态。已有输出必须保留，除非用户明确授权 `--force` 覆盖。
- 仅停用目标入口使用 `disable`。删除 copied/Git 安装使用 `remove`，取消 linked 注册使用 `unlink`；不确定安装类型时先运行 `info` 或 `list --status`。`remove --force` 和 `unlink --force` 会先停用受管目标，只能在用户明确授权后使用。
- 批量清理先运行 `sklp prune --dry-run --json`；只有用户确认计划后才运行 `sklp prune --yes --json`。prune 仅删除未启用且所有权可验证的 copied/Git Skill，保留 linked 和无法验证的副本。
- 只有用户明确要求卸载 Skill Port 时才运行交互式 `sklp uninstall`。它只接受精确的小写 `y` 确认，并保留 Hub 外的 linked 源目录。
