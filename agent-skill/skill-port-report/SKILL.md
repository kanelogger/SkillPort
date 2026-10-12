---
name: skill-port-report
description: 展示 Skill Port Hub 已安装 Skill 清册，调用后生成可离线打开的静态 HTML。用于“展示已安装技能”“列出本地 Skill”“生成本地技能清单页面”等请求。展示名称、中文描述、展示分类、安装时间与私有标签；顶部汇总启用统计；不含来源路径、项目路径或安装类型列。
---

# Skill Port 已安装 Skill 清册

用户调用此技能时，必须实际生成一份新的静态 HTML 并交付文件链接，不能只回复命令、旧快照或口头清单。

页面已定稿。`assets/report.template.html` 就是已确认的清册页去掉内联数据后的模板：纸感浅底（随系统转暗色）、三枚统计、分类筛选条与下拉、按展示分类分组的表格，列为技能 / 分类 / 安装时间。生成时只替换 `<!-- SKILL_PORT_DATA -->`。不要重新设计，不要改列、筛选或配色体系。

## 执行步骤

1. 定位本 Skill 根目录，即包含本文件及 scripts/ 的目录。不要假定它在当前仓库中；全局 Agent 入口为 ~/.agents/skills/skill-port-report。
2. 从用户工作目录运行（需要 Node.js 22.16.0+）：

   ```sh
   node "<Skill 根目录>/scripts/generate-report.mjs"
   ```

3. 中文自查与自纠。退出码为 `2` 时，标准输出是 `{ "ok": false, "needsChinese": [...] }`，且不会写出 HTML。对 `needsChinese` 里每一项，根据 Hub 原文 `description` 写一句中文摘要：汉字不少于 8 个，且不少于其中的英文字母数。写入本 Skill 的 `assets/descriptions.zh.json`；该文件不可写时，改写入当前目录 `skill-port-reports/descriptions.zh.json`（生成时后者覆盖同名项）。不要修改 Hub 里的技能文件。写完后重新运行本脚本，直到退出码为 `0`。
4. 读取输出 JSON 中的 output、skills、enabledCount、enablementCount、updated，确认 HTML 存在，然后交付可点击文件链接；支持时展示文件卡片。汇报 Skill 数及快照时间。
5. 用户指定位置时使用 --output "<新文件绝对路径>.html"。默认输出到当前目录 skill-port-reports/，使用时间戳新文件名；禁止覆盖已有报告。用户指定其他 Hub 时使用 --hub "<Hub 目录>"。

## 数据契约与安全

- Skill 列表来自 Hub 的 skills 登记表与 enablements 计数，可选读取 skill_tags；不扫描项目目录，不读取公开 catalog 作为清单来源。
- 生成脚本使用 Node 内置 SQLite，以 readOnly: true 打开 state.db，在一个只读事务中查询；不调用会执行迁移或恢复写入的 Desktop 初始化接口。
- Hub 选择顺序：--hub、SKLP_HOME、~/.skill-port.json 的 hubPath、默认 ~/.skill-port，与当前 CLI 约定一致。
- 顶部启用统计来自 enablement 行数，不是健康诊断；表格本身不展示安装类型或启用数列。
- 展示分类来自本 Skill 内置 categories.json。中文描述先读 assets/descriptions.zh.json，再被当前目录 skill-port-reports/descriptions.zh.json 同名项覆盖；都没有时才用 Hub 原描述。写出 HTML 前必须通过中文自查，未通过则退出码为 2 且不写文件。这些映射只用于展示，不写入也不修改 Hub。
- 只读报告不初始化、登记、迁移、恢复或修改 Hub，不安装或启停 Skill，不访问 Git、网络或凭据。数据库不存在或结构不兼容须报错，不使用示例兜底。
- 页面不得包含 source location、项目路径、target entry path、凭据或其他无关私有字段。交付的是本地私有报告，不是公开 catalog；只交付本地文件，不公开上传。
- 单文件 HTML 内联数据、CSS 和脚本，没有外部字体、CDN、fetch 或服务器依赖；可直接离线打开。

不要用口头复述 `sklp list` 或仓库里的旧报告代替此次调用产物。
