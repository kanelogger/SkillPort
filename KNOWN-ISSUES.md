# 遗留问题与 Bug 清单

最后一次核对：2026-08-15（`--track-tags` 功能落地后，`src/` 当前 HEAD）。

## 高优先级

### 1. 大仓库更新必然超时且全量重复下载
- 现象：`pbakaus/impeccable` 这类 354MB monorepo，完整 clone 约 34s，超过默认 30s git 超时（`src/infrastructure/sources.ts:58` `defaultGitTimeoutMs`），`update`/`sync` 实际拉取内容时直接失败。
- 根因：① 超时默认值偏小，仅能靠 `SKLP_GIT_TIMEOUT_MS` 环境变量临时绕过（`sources.ts:419`）；② `GitSourceCache` 是单次命令内的临时 clone（`createGitSourceCache`/`cleanupGitSourceCache`），命令结束即删除，每次 update 都重新全量下载；③ 指定 ref 时不走 `--depth 1`（`prepareGitSourceSet`，`sources.ts` clone 参数只对无 ref 来源浅克隆）。
- 影响：大仓库 Skill 的 update/sync 在无 env 覆盖时不可用；有覆盖时每次更新消耗数百 MB 流量。
- 建议方向：持久化 git 缓存（bare mirror + fetch）；对 branch/tag ref 使用 `git clone --depth 1 --branch <ref>`；或按仓库大小自适应超时。

### 2. tag-pattern 跟踪存在降级风险（无回退保护）
- 现象：上游删除当前 tag 后（如 `skill-v4.1.1` 被删，最高匹配变为 `skill-v4.1.0`），`inspectGitSource` 的 tag-pattern 分支（`sources.ts`）判定 revision/tag 不一致 → `outdated` → `update` 会把 Skill 降级到旧 release。
- 根因：检查只比较"当前 vs 最高匹配"，没有"已安装版本不得低于候选版本"的守卫；`parseTagVersion` 已有版本可比，但比较结果未用于拒绝降级。
- 影响：上游维护者撤回 release 时用户被静默降级。
- 建议方向：`outdated` 判定前比较 semver，候选版本低于已安装 `sourceRef` 版本时报 `unknown` 并给出原因，不做内容变更。

## 中优先级

### 3. `--track-tags` 仅 CLI 可用，Desktop 未暴露
- 现状：`DesktopInstallOptions`/`previewUpdate`/`update`（`src/application/desktop-skill-port.ts:50,170-181`）只有 `ref` 通道，没有 tagPattern 参数；Renderer/IPC 同样无入口。
- 影响：Desktop 用户无法设置或预览 tag 模式；CLI 设置的 pattern 在 Desktop 详情页只读可见（sourceTracking 透传为 `tag-pattern`）。
- 建议方向：Desktop facade 增加 `tagPattern` 选项 + RPC allowlist + 详情页展示解析出的 tag。

### 4. `sync <source> --ref <ref>` 重设 tag-pattern 登记集合时报错误信息误导
- 现象：已按 `tag-pattern:skill-v*` 登记的 collection，再执行 `sklp sync <url> --ref main` 会失败为 `Skill already installed from another source`。
- 根因：collection key 按 `tag-pattern:<pattern>` 与具体 ref 分别生成（`sources.ts` `gitCollectionKey`），换 ref 后查不到原登记；`sameSourceRepository`（`src/application/skill-port.ts:1966`）在 pattern 不匹配时判为不同来源。行为安全（不产生错误状态），但用户无法从报错得知正确做法。
- 建议方向：检测同 location+scanPath 的已登记集合，报错信息改为提示先用 `update --ref`/`update --track-tags` 变更跟踪方式，或提供显式重登记路径。

### 5. `update --all --track-tags` 把同一 glob 施加到所有 Git Skill
- 现状：与 `--ref` 批量行为对齐实现（`skill-port.ts` `updateAllToTagPattern`）。不同仓库的 tag 系列不同（`cli-*`/`ext-*`/`skill-*`），统一 pattern 会把不匹配的 Skill 打进 `failed`。
- 影响：多来源 Hub 上批量切换几乎必然部分失败；单 Skill 用法不受影响。
- 建议方向：文档保留警示；或改为仅作用于已有 pattern 的 Skill（`--all` 不带 pattern 时沿用各自模式——当前已如此）。

## 低优先级 / 语义边界

### 6. tag 解析的 semver 启发式限制
- 不含数字的 tag（如 `latest`）永不匹配；带 `-suffix` 的一律视为预发布排除，无法 opt-in（nightly 场景不支持）；日期型 tag（`release-2024-01`）因 `-01` 被判为预发布而排除；同版本并列时按 tag 名字典序取大者（`sources.ts` `parseTagVersion`/`resolveLatestTagRevision`）。
- 影响：非 semver 命名习惯的仓库无法用 `--track-tags`。
- 建议方向：需要时增加 `--include-prerelease` 或显式版本正则；当前在 README/SKILL.md 已声明语义。

### 7. tag-pattern Skill 已最新时普通 `update` 仍会全量重克隆
- 现状：`sklp update <skill>` 对已最新的 tag-pattern Skill 做幂等刷新（`updateInternal`，`skill-port.ts`），up-to-date 时仍 clone 全仓库。`--check`/`--dry-run` 只走 ls-remote，无此问题。
- 影响：与问题 1 叠加时一次空操作消耗 354MB。
- 建议方向：up-to-date 时跳过 prepare，直接返回当前状态。

### 8. `--ref` 与 `--track-tags` 对本地目录的处理不一致
- 现状：本地目录 + `--ref` 被静默忽略（`prepareSources` 原有行为）；本地目录 + `--track-tags` 直接报错（本次新增，见 `sources.ts`）。
- 影响：轻微不一致；报错优于静默，但 `--ref` 侧的历史行为未统一。
- 建议方向：下个大版本把 `--ref` + 本地目录也改为显式报错。

### 9. v7 数据库与旧版 sklp 的双向兼容边界
- 已验证：旧版（≤0.9.3）读写 v7 数据库不损坏 `source_tag_pattern` 列（显式列名 INSERT/UPDATE，未知列忽略）。
- 残留：旧版的 recovery payload 校验（`isSkill`，`skill-port.ts:2111`）不认识 `"tag-pattern"`；若新版在 update 中途崩溃留下 tag-pattern Skill 的 recovery 记录，换旧版启动无法完成该条恢复。
- 建议方向：发布说明中注明；或让旧版校验对未来未知 tracking 值降级为跳过恢复而非失败（需旧版侧改动，只能在新版本预防）。

## 环境注意（非代码问题）

- 本机全局安装的 sklp 仍为已发布旧版，不含 `--track-tags`；本次切换 `impeccable` 用的是仓库内 `dist/cli.js` 构建。功能发布后 `npm i -g skill-port-cli@latest` 升级即可，v7 数据库向后兼容（见问题 9）。
