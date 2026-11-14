# Skill Port CLI Exit Codes

Skill Port CLI keeps exit codes intentionally small and stable for shell scripts and Agents.

| Code | Meaning | Examples |
| --- | --- | --- |
| `0` | The command completed successfully. `sklp doctor` also returns `0` when it finds warnings only. | Successful install, healthy doctor result, warning-only doctor drift such as an unregistered entry. |
| `1` | The command failed, or `sklp doctor` found at least one error-severity diagnostic. | Invalid arguments, unsupported target, duplicate Skill name, missing Hub, broken enablement, corrupt database. |

`sklp update <skill> --check` exits `0` for `up-to-date`, `outdated`, and `pinned`. It exits `1` for `unknown`, which means the remote source could not be checked or classified safely.

`sklp update --all --check` exits `1` when any Git source is `unknown`. `sklp update <skill> --dry-run`, `sklp update --all --dry-run`, and `sklp update --all` exit `1` when their `failed` array is non-empty; skipped entries do not make the command fail.

`sklp update <skill>` exits `1` when the Skill is pinned to a tag or commit and directs the caller to `--ref <ref>`. `sklp update <skill> --ref <ref>` exits `1` if the new ref cannot be fetched or validated. `sklp update --all --ref <ref>` exits `1` when any Git Skill fails, while continuing with other Git Skills and skipping local copied or linked Skills. `--track-tags <glob>` follows the same rules: `install` and `update` exit `1` when no remote tag matches the glob, and tag-pattern Skills report `unknown` (exit `1`) from `--check` when the pattern stops matching.

Each Git command allows 60,000ms per attempt and automatically retries one timeout. `SKLP_GIT_TIMEOUT_MS` overrides the per-attempt limit. If both attempts time out, the command or batch item fails normally and keeps the sanitized timeout reason.

`sklp sync <source>` and `sklp sync --all` exit `1` when a source cannot be fetched or any collection-level `failed` array is non-empty. `--all` continues with other registered sources after one source fails. `--skip-existing` reports same-name Skills owned elsewhere in `skipped` without overwriting or reassigning them, and skipped entries do not fail the command. Invalid metadata, upstream-internal duplicate names, corrupt ownership, and fetch errors remain failures. Missing Skills with action `retain` or `skip-enabled` do not fail the command. `--prune` removes only upstream-missing Skills; enabled Skills use `skip-enabled` unless `--force` explicitly authorizes disabling managed targets first. `--force` without `--prune` exits `1` before opening the Hub.

Removing or pruning the last member of a source collection automatically deregisters its empty registration, so later `sklp sync --all` runs neither fetch it nor reinstall the Skill. `sklp sync --forget <source>` exits `1` without a registered scope match, and `--forget` cannot be combined with `--all`, `--prune`, `--force`, or `--skip-existing`. Forget never touches installed Skills, Hub content, enablements, catalogs, or the Git remote.

`sklp sync --forget --json` returns `forgotten` with the normalized `source` (`location`, `ref`, `tagPattern`, `path`) and the name-sorted `retained` members; preview adds top-level `dryRun: true`. The shape does not change with `SKLP_LANG`.

`sklp uninstall` exits `0` after a cancellation or complete cleanup. It exits `1` after attempting every cleanup step it can perform when a managed entry, Hub resource, or npm package cannot be removed.

`sklp agent setup` exits `0` when it creates every bundled Agent integration or finds each correct integration already present. It exits `1` when any reserved entry is occupied by unmanaged content or a bundled Skill cannot be verified. JSON includes compatibility field `agentIntegration` for `skill-port` and `agentIntegrations` for every bundled entry.

`sklp prune --dry-run` is read-only and exits `0` after returning its `planned` and `skipped` arrays. Mutating prune requires `--yes`; omitting both `--dry-run` and `--yes` exits `1` without changing state. `sklp prune --yes` continues after individual removal failures and exits `1` when its `failed` array is non-empty. Linked Skills and unverified copies appear in `skipped` and do not make the command fail.

`sklp export [output]` exits `0` after atomically writing a self-contained HTML catalog. It exits `1` without changing the existing output when that path already exists; pass `--force` to replace it. Hub state is opened read-only.

`sklp tag add <tag> <skills...>` exits `0` after atomically adding the tag to every named Skill. It exits `1` without changing any tags when a Skill is missing, the tag is invalid, or any merged tag set exceeds 32 entries. `--dry-run` is read-only and exits `0` with the proposed Skill representations.

## Project Unregistration

`sklp project unregister <path>` exits `0` after removing one exact project registration. `--dry-run` opens the Hub read-only, performs the same validation, and does not run recovery or change state. An unknown path or any recorded project enablement for that project exits `1`; no project files, Skills, enablements, or catalogs are removed. Restore a missing directory and disable its Skills before retrying if it has project enablements. Global enablements and other projects do not block unregistration. There is no `--force` option.

`sklp project unregister --json` returns `{ "unregistered": { "path": "<registered canonical path>" } }`; preview adds top-level `dryRun: true`. JSON keys remain stable across languages and displayed paths are sanitized. Missing project directories are supported. Relative paths and existing symlinked ancestors are resolved, but an unregistered child never selects a registered ancestor. The command uses the Hub mutation lock and an SQLite transaction; no schema migration is needed.

## Doctor Severity

`sklp doctor` reports each diagnostic with a `severity`:

- `warning`: state should be reviewed, but the CLI can still operate. Exit code stays `0` when all diagnostics are warnings.
- `error`: state is broken or unsafe for the related operation. Exit code is `1` when any diagnostic is an error.

Each missing bundled Agent integration is a warning with the suggestion to run `sklp agent setup`. An unmanaged object at any reserved integration path is an error and remains untouched.

A registered project or global target that cannot be listed — for example a protected directory the current process may only `stat` — produces an error `TARGET_UNREADABLE` diagnostic for that target instead of aborting the whole report. An entry inside a managed target that points to a missing target produces a warning `DANGLING_ENTRY`. `doctor` reports both without removing anything; entries outside Skill Port management must be cleaned up manually.

Use JSON output for automation:

```bash
sklp doctor --json
```

The JSON payload includes:

- `healthy`: `true` when there are no diagnostics.
- `diagnostics`: diagnostic objects with `code`, `severity`, `message`, and `suggestion`.

`sklp list --status --json` adds `installationKind`, `enablementCount`, and `health` to each public Skill entry without exposing source or project paths. `sklp tag add --json` returns `tag` and the updated public `skills`; its preview also returns `dryRun: true`. `sklp prune --dry-run --json` returns `dryRun`, `planned`, and `skipped`; confirmed prune returns `removed`, `skipped`, and `failed`. `sklp export --json` returns the absolute `output` path and `skillCount`.

`sklp sync --json` returns `sources` and a top-level `failed` array. In a sync summary, exit code `1` means that top-level array is non-empty. Source-level failures keep the fields `source` and `reason`. Failures from `sources[].failed` also appear at the top level, with `source` (repository URL), `scanPath`, and `ref` alongside the original `reason` and any `name` or `path`. A single-source sync that aborts before producing a summary returns the runtime error envelope below.

Each item in `sources` contains the normalized `location`, `ref`, scan `path`, and resolved `revision` under `source`, alongside the stable arrays `added`, `updated`, `unchanged`, `skipped`, `missing`, `removed`, and `failed`. Each skipped entry has the language-stable reason `already-installed`; each missing entry includes the action code `retain`, `remove`, or `skip-enabled`. Preview adds `dryRun: true` without changing Hub state.

For runtime command failures invoked with `--json`, stdout contains `{ "error": { "code", "message" } }` and stderr stays empty. `code` is `COMMAND_FAILED` for expected CLI failures and `INTERNAL_ERROR` for unexpected failures.

## 中文说明

Skill Port CLI 的退出码保持简单稳定，方便脚本和 Agent 调用。

| 退出码 | 含义 | 示例 |
| --- | --- | --- |
| `0` | 命令成功。`sklp doctor` 只有 warning 级诊断时也返回 `0`。 | 安装成功、doctor 健康、只有未注册入口这类 warning。 |
| `1` | 命令失败，或 `sklp doctor` 发现至少一个 error 级诊断。 | 参数错误、不支持的目标、Skill 同名、Hub 缺失、启用入口损坏、数据库损坏。 |

`sklp doctor --json` 适合自动化，字段名不会因为 `SKLP_LANG=zh-CN` 改变。

`sklp project unregister <path>` 在注销精确匹配的项目登记后返回 `0`。`--dry-run` 只读打开 Hub、执行相同校验，不运行恢复或改写状态。路径未登记或该项目还有已记录的 project enablement 时返回 `1`，不删除项目文件、Skill、enablement 或 catalog。目录缺失且仍有 project enablement 时，需要先恢复目录并停用对应 Skill；global enablement 和其他项目不会阻止注销。命令不提供 `--force`。

JSON 返回 `{ "unregistered": { "path": "<已登记的规范路径>" } }`，预览额外包含 `dryRun: true`；字段不随语言变化，展示路径经过脱敏。支持缺失目录、相对路径及现有符号链接父目录解析，不会为未登记子目录选择已登记祖先。实际注销使用 Hub mutation lock 和 SQLite 事务，无需 schema migration。

已注册项目或全局目标目录无法列出时（例如当前进程只能 `stat`、不能读取受保护目录），该目标记为 error 级 `TARGET_UNREADABLE`，其余诊断照常输出，不会中断整轮检查。受管目标内指向不存在位置的文件或链接记为 warning 级 `DANGLING_ENTRY`。两种情况 `doctor` 都只报告、不删除；不属于 Skill Port 管理的入口需要手动清理。

`sklp update --all --check` 只要有任一 Git source 为 `unknown` 就返回 `1`。`sklp update <skill> --dry-run`、`sklp update --all --dry-run` 和 `sklp update --all` 只要 `failed` 数组非空就返回 `1`；跳过条目不会导致失败。

`sklp update <skill>` 遇到 tag 或 commit 固定版本时返回 `1`，并提示使用 `--ref <ref>`。`sklp update <skill> --ref <ref>` 无法获取或验证新 ref 时返回 `1`。`sklp update --all --ref <ref>` 会继续处理其他 Git Skill，并跳过本地复制或 linked Skill；只要有一个 Git Skill 失败就返回 `1`。`--track-tags <glob>` 遵循同样规则：没有远程 tag 匹配该 glob 时 `install` 和 `update` 返回 `1`；tag 模式的 Skill 在 pattern 不再匹配时 `--check` 报告 `unknown` 并返回 `1`。

每条 Git 命令单次限时 60000ms，并在超时后自动重试一次。`SKLP_GIT_TIMEOUT_MS` 可覆盖单次限时；两次均超时时，命令或批量项按普通失败处理，并保留脱敏后的超时原因。

`sklp sync <source>` 和 `sklp sync --all` 在来源无法拉取或任一集合的 `failed` 非空时返回 `1`。`--all` 遇到单个来源失败后会继续同步其他已登记来源。`--skip-existing` 会把已由其他来源管理的同名 Skill 放入 `skipped`，不覆盖、不改绑，skipped 项不会导致命令失败；无效 metadata、上游集合内部重名、损坏的来源所有权和拉取错误仍属于失败。缺失项的 action 为 `retain` 或 `skip-enabled` 时不会导致失败。`--prune` 只移除上游缺失 Skill；已启用 Skill 默认使用 `skip-enabled`，只有显式传入 `--force` 才会先停用受管目标。单独使用 `--force` 会在打开 Hub 前返回 `1`。

删除或 prune 掉集合的最后一个成员时，会自动注销该空来源登记，之后的 `sklp sync --all` 既不会访问它也不会重新安装该 Skill。`sklp sync --forget <source>` 找不到精确登记时返回 `1`，且 `--forget` 不能与 `--all`、`--prune`、`--force` 或 `--skip-existing` 组合。forget 不会触碰已安装 Skill、Hub 内容、enablements、catalogs 或 Git 远端。

`sklp sync --forget --json` 返回 `forgotten`，包含规范化 `source`（`location`、`ref`、`tagPattern`、`path`）和按名称排序的 `retained` 成员；预览额外在顶层返回 `dryRun: true`。该结构不随 `SKLP_LANG` 改变。

`sklp uninstall` 在取消或完整清理后返回 `0`。受管入口、Hub 资源或 npm 包有任一无法移除时，它仍会尝试能够执行的其余清理步骤，并返回 `1`。

`sklp agent setup` 在成功创建内置 Agent 集成或确认正确入口已经存在时返回 `0`。保留路径被非受管内容占用，或无法验证内置 Skill 时返回 `1`。

`sklp prune --dry-run` 只读并返回 `planned` 与 `skipped`。真正清理必须使用 `--yes`；既没有 `--dry-run` 也没有 `--yes` 时返回 `1`，且不改写状态。`sklp prune --yes` 会继续处理其他候选，只要 `failed` 非空就返回 `1`。linked Skill 和无法验证所有权的副本只进入 `skipped`，不会导致失败。

`sklp export [output]` 会在只读打开 Hub 后原子写入自包含 HTML，并在成功时返回 `0`。输出路径已存在时默认返回 `1` 且不改写文件；显式使用 `--force` 才会替换。

`sklp tag add <tag> <skills...>` 会在给所有指定 Skill 原子追加标签后返回 `0`。任一 Skill 不存在、标签无效或合并后的标签超过 32 个时返回 `1`，且不修改任何标签。`--dry-run` 以只读方式返回计划中的 Skill 数据并退出 `0`。

`sklp list --status --json` 会给每个公开 Skill 条目增加 `installationKind`、`enablementCount` 和 `health`，但不暴露来源或项目路径。`sklp tag add --json` 返回 `tag` 和更新后的公开 `skills`；预览还会返回 `dryRun: true`。`sklp prune --dry-run --json` 返回 `dryRun`、`planned` 和 `skipped`；确认清理后返回 `removed`、`skipped` 和 `failed`。`sklp export --json` 返回绝对 `output` 路径与 `skillCount`。

`sklp sync --json` 返回 `sources` 和顶层 `failed`。命令返回同步汇总时，退出码 `1` 对应顶层 `failed` 非空。来源级失败保留 `source` 和 `reason` 字段。`sources[].failed` 中的失败也会出现在顶层，在原有 `reason` 及可用的 `name`、`path` 之外，附带 `source`（仓库 URL）、`scanPath` 和 `ref`。单来源同步在生成汇总前中止时，返回下文的运行时错误结构。

`sources` 中每项的 `source` 包含规范化后的 `location`、`ref`、扫描 `path` 和解析出的 `revision`，同级有 `added`、`updated`、`unchanged`、`skipped`、`missing`、`removed`、`failed` 数组。每个 skipped 项包含不随语言改变的原因 `already-installed`；每个缺失项包含 action `retain`、`remove` 或 `skip-enabled`。预览额外返回 `dryRun: true`，且不修改 Hub 状态。

其他带 `--json` 的运行时命令失败时，stdout 会输出 `{ "error": { "code", "message" } }`，stderr 保持为空。预期的 CLI 失败使用 `COMMAND_FAILED`，未预期失败使用 `INTERNAL_ERROR`。
