# Skill Port CLI Exit Codes

Skill Port CLI keeps exit codes intentionally small and stable for shell scripts and Agents.

| Code | Meaning | Examples |
| --- | --- | --- |
| `0` | The command completed successfully. `sklp doctor` also returns `0` when it finds warnings only. | Successful install, healthy doctor result, warning-only doctor drift such as an unregistered entry. |
| `1` | The command failed, or `sklp doctor` found at least one error-severity diagnostic. | Invalid arguments, unsupported target, duplicate Skill name, missing Hub, broken enablement, corrupt database. |

## Doctor Severity

`sklp doctor` reports each diagnostic with a `severity`:

- `warning`: state should be reviewed, but the CLI can still operate. Exit code stays `0` when all diagnostics are warnings.
- `error`: state is broken or unsafe for the related operation. Exit code is `1` when any diagnostic is an error.

Use JSON output for automation:

```bash
sklp doctor --json
```

The JSON payload includes:

- `healthy`: `true` when there are no diagnostics.
- `diagnostics`: diagnostic objects with `code`, `severity`, `message`, and `suggestion`.

For other runtime command failures invoked with `--json`, stdout contains `{ "error": { "code", "message" } }` and stderr stays empty. `code` is `COMMAND_FAILED` for expected CLI failures and `INTERNAL_ERROR` for unexpected failures.

## 中文说明

Skill Port CLI 的退出码保持简单稳定，方便脚本和 Agent 调用。

| 退出码 | 含义 | 示例 |
| --- | --- | --- |
| `0` | 命令成功。`sklp doctor` 只有 warning 级诊断时也返回 `0`。 | 安装成功、doctor 健康、只有未注册入口这类 warning。 |
| `1` | 命令失败，或 `sklp doctor` 发现至少一个 error 级诊断。 | 参数错误、不支持的目标、Skill 同名、Hub 缺失、启用入口损坏、数据库损坏。 |

`sklp doctor --json` 适合自动化，字段名不会因为 `SKLP_LANG=zh-CN` 改变。

其他带 `--json` 的运行时命令失败时，stdout 会输出 `{ "error": { "code", "message" } }`，stderr 保持为空。预期的 CLI 失败使用 `COMMAND_FAILED`，未预期失败使用 `INTERNAL_ERROR`。
