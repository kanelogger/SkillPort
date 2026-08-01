# Skill Port CLI Exit Codes

Skill Port CLI keeps exit codes intentionally small and stable for shell scripts and Agents.

| Code | Meaning | Examples |
| --- | --- | --- |
| `0` | The command completed successfully. `sklp doctor` also returns `0` when it finds warnings only. | Successful install, healthy doctor result, warning-only doctor drift such as an unregistered entry. |
| `1` | The command failed, or `sklp doctor` found at least one error-severity diagnostic. | Invalid arguments, unsupported target, duplicate Skill name, missing Hub, broken enablement, corrupt database. |

`sklp update <skill> --check` exits `0` for `up-to-date`, `outdated`, and `pinned`. It exits `1` for `unknown`, which means the remote source could not be checked or classified safely.

`sklp update --all --check` exits `1` when any Git source is `unknown`. `sklp update <skill> --dry-run`, `sklp update --all --dry-run`, and `sklp update --all` exit `1` when their `failed` array is non-empty; skipped entries do not make the command fail.

`sklp update <skill>` exits `1` when the Skill is pinned to a tag or commit and directs the caller to `--ref <ref>`. `sklp update <skill> --ref <ref>` exits `1` if the new ref cannot be fetched or validated. `sklp update --all --ref <ref>` exits `1` when any Git Skill fails, while continuing with other Git Skills and skipping local copied or linked Skills.

`sklp uninstall` exits `0` after a cancellation or complete cleanup. It exits `1` after attempting every cleanup step it can perform when a managed entry, Hub resource, or npm package cannot be removed.

`sklp agent setup` exits `0` when it creates the bundled Agent integration or finds the correct integration already present. It exits `1` when the reserved entry is occupied by unmanaged content or the bundled Skill cannot be verified.

`sklp prune --dry-run` is read-only and exits `0` after returning its `planned` and `skipped` arrays. Mutating prune requires `--yes`; omitting both `--dry-run` and `--yes` exits `1` without changing state. `sklp prune --yes` continues after individual removal failures and exits `1` when its `failed` array is non-empty. Linked Skills and unverified copies appear in `skipped` and do not make the command fail.

`sklp export [output]` exits `0` after atomically writing a self-contained HTML catalog. It exits `1` without changing the existing output when that path already exists; pass `--force` to replace it. Hub state is opened read-only.

`sklp tag add <tag> <skills...>` exits `0` after atomically adding the tag to every named Skill. It exits `1` without changing any tags when a Skill is missing, the tag is invalid, or any merged tag set exceeds 32 entries. `--dry-run` is read-only and exits `0` with the proposed Skill representations.

## Doctor Severity

`sklp doctor` reports each diagnostic with a `severity`:

- `warning`: state should be reviewed, but the CLI can still operate. Exit code stays `0` when all diagnostics are warnings.
- `error`: state is broken or unsafe for the related operation. Exit code is `1` when any diagnostic is an error.

A missing bundled Agent integration is a warning with the suggestion to run `sklp agent setup`. An unmanaged object at the reserved integration path is an error and remains untouched.

Use JSON output for automation:

```bash
sklp doctor --json
```

The JSON payload includes:

- `healthy`: `true` when there are no diagnostics.
- `diagnostics`: diagnostic objects with `code`, `severity`, `message`, and `suggestion`.

`sklp list --status --json` adds `installationKind`, `enablementCount`, and `health` to each public Skill entry without exposing source or project paths. `sklp tag add --json` returns `tag` and the updated public `skills`; its preview also returns `dryRun: true`. `sklp prune --dry-run --json` returns `dryRun`, `planned`, and `skipped`; confirmed prune returns `removed`, `skipped`, and `failed`. `sklp export --json` returns the absolute `output` path and `skillCount`.

For runtime command failures invoked with `--json`, stdout contains `{ "error": { "code", "message" } }` and stderr stays empty. `code` is `COMMAND_FAILED` for expected CLI failures and `INTERNAL_ERROR` for unexpected failures.

## 中文说明

Skill Port CLI 的退出码保持简单稳定，方便脚本和 Agent 调用。

| 退出码 | 含义 | 示例 |
| --- | --- | --- |
| `0` | 命令成功。`sklp doctor` 只有 warning 级诊断时也返回 `0`。 | 安装成功、doctor 健康、只有未注册入口这类 warning。 |
| `1` | 命令失败，或 `sklp doctor` 发现至少一个 error 级诊断。 | 参数错误、不支持的目标、Skill 同名、Hub 缺失、启用入口损坏、数据库损坏。 |

`sklp doctor --json` 适合自动化，字段名不会因为 `SKLP_LANG=zh-CN` 改变。

`sklp update --all --check` 只要有任一 Git source 为 `unknown` 就返回 `1`。`sklp update <skill> --dry-run`、`sklp update --all --dry-run` 和 `sklp update --all` 只要 `failed` 数组非空就返回 `1`；跳过条目不会导致失败。

`sklp update <skill>` 遇到 tag 或 commit 固定版本时返回 `1`，并提示使用 `--ref <ref>`。`sklp update <skill> --ref <ref>` 无法获取或验证新 ref 时返回 `1`。`sklp update --all --ref <ref>` 会继续处理其他 Git Skill，并跳过本地复制或 linked Skill；只要有一个 Git Skill 失败就返回 `1`。

`sklp uninstall` 在取消或完整清理后返回 `0`。受管入口、Hub 资源或 npm 包有任一无法移除时，它仍会尝试能够执行的其余清理步骤，并返回 `1`。

`sklp agent setup` 在成功创建内置 Agent 集成或确认正确入口已经存在时返回 `0`。保留路径被非受管内容占用，或无法验证内置 Skill 时返回 `1`。

`sklp prune --dry-run` 只读并返回 `planned` 与 `skipped`。真正清理必须使用 `--yes`；既没有 `--dry-run` 也没有 `--yes` 时返回 `1`，且不改写状态。`sklp prune --yes` 会继续处理其他候选，只要 `failed` 非空就返回 `1`。linked Skill 和无法验证所有权的副本只进入 `skipped`，不会导致失败。

`sklp export [output]` 会在只读打开 Hub 后原子写入自包含 HTML，并在成功时返回 `0`。输出路径已存在时默认返回 `1` 且不改写文件；显式使用 `--force` 才会替换。

`sklp tag add <tag> <skills...>` 会在给所有指定 Skill 原子追加标签后返回 `0`。任一 Skill 不存在、标签无效或合并后的标签超过 32 个时返回 `1`，且不修改任何标签。`--dry-run` 以只读方式返回计划中的 Skill 数据并退出 `0`。

`sklp list --status --json` 会给每个公开 Skill 条目增加 `installationKind`、`enablementCount` 和 `health`，但不暴露来源或项目路径。`sklp tag add --json` 返回 `tag` 和更新后的公开 `skills`；预览还会返回 `dryRun: true`。`sklp prune --dry-run --json` 返回 `dryRun`、`planned` 和 `skipped`；确认清理后返回 `removed`、`skipped` 和 `failed`。`sklp export --json` 返回绝对 `output` 路径与 `skillCount`。

其他带 `--json` 的运行时命令失败时，stdout 会输出 `{ "error": { "code", "message" } }`，stderr 保持为空。预期的 CLI 失败使用 `COMMAND_FAILED`，未预期失败使用 `INTERNAL_ERROR`。
