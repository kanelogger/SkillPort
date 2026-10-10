---
name: skill-port-report
description: 展示 Skill Port Hub 已登记的本地项目，调用后生成可离线打开的静态 HTML 项目列表。用于“展示本地项目”“列出 Skill Port 管理的项目”“生成本地项目列表页面”“查看项目启用数”等请求。展示项目名称、完整路径、登记时间、项目启用数，并单独汇总全局启用数；不是已安装 Skill 清册。
---

# Skill Port 本地项目报告

用户调用此技能时，必须实际生成一份新的静态 HTML 并交付文件链接，不能只回复命令、旧快照或技能清单。

## 执行步骤

1. 定位本 Skill 根目录，即包含本文件及 scripts/ 的目录。不要假定它在当前仓库中；全局 Agent 入口为 ~/.agents/skills/skill-port-report。
2. 从用户工作目录运行（需要 Node.js 22.16.0+）：

   ```sh
   node "<Skill 根目录>/scripts/generate-report.mjs"
   ```

3. 读取输出 JSON 中的 output、projects、projectEnablementCount、globalEnablementCount、updated，确认 HTML 存在，然后交付可点击文件链接；支持时展示文件卡片。汇报项目数及快照时间。
4. 用户指定位置时使用 --output "<新文件绝对路径>.html"。默认输出到当前目录 skill-port-reports/，使用时间戳新文件名；禁止覆盖已有报告。用户指定其他 Hub 时使用 --hub "<Hub 目录>"。

## 数据契约与安全

- 项目列表来自 Hub 的 projects 登记表，不通过 Skill 清单反推，也不扫描文件系统。登记但零启用的项目必须保留；当前目录未登记则不能添加。
- sklp 没有项目读取命令。生成脚本使用 Node 内置 SQLite，以 readOnly: true 打开 state.db，在一个只读事务中查询 projects 与 enablements；不调用会执行迁移或恢复写入的 Desktop 初始化接口。
- Hub 选择顺序：--hub、SKLP_HOME、~/.skill-port.json 的 hubPath、默认 ~/.skill-port，与当前 CLI 约定一致。
- 项目启用数只统计 target_type=project 且 target_key 等于登记路径的 enablement；全局启用数单独展示，不伪装项目或加入项目计数。
- 只读报告不初始化、登记、迁移、恢复或修改 Hub，不安装或启停 Skill，不访问 Git、网络或凭据。数据库不存在或结构不兼容须报错，不使用示例兜底。
- 页面包含用户要求的本地项目路径，属于本地私有报告，不是公开 catalog。只交付本地文件，不公开上传。不导出 target entry path、来源凭据或其他无关私有字段。
- 单文件 HTML 内联数据、CSS 和脚本，没有外部字体、CDN、fetch 或服务器依赖；可直接离线打开。

不要使用仓库中旧的 skill-port-report/ 手工技能清册代替此次调用产物。
