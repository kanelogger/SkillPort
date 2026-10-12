# Skill Port 已安装 Skill 清册

调用后生成 Hub 已安装 Skill 的单文件 HTML。页面模板是 `assets/report.template.html`（已确认清册页的定稿）：纸感浅底并随系统转暗色，展示名称、中文描述、展示分类、安装时间与私有标签；三枚启用统计；分类筛选条与分组表格。不含来源路径、项目路径、安装类型列或类型筛选。零启用 Skill 仍显示。不要另起视觉设计。

## 随 CLI 全局安装

`skill-port-cli` 全局安装或 `sklp agent setup` 会把本 Skill 注册到 `~/.agents/skills/skill-port-report`（与 `skill-port` 同属包级 Agent integration，不是 Hub enablement）。Agent 已缓存技能列表时，刷新技能发现或开启新会话，然后说“调用 skill-port-report，生成已安装技能清单”。

从源码检出开发本 Skill 时，也可用同一命令补建入口（无需 `link` / `enable`）：

```sh
sklp agent setup --json
```

## 手动生成

```sh
node agent-skill/skill-port-report/scripts/generate-report.mjs
node agent-skill/skill-port-report/scripts/generate-report.mjs --hub "<Hub 目录>" --output "<新文件>.html"
```

需要 Node.js 22.16.0+ 和已有 Hub，无外部依赖。输出默认位于调用目录的 skill-port-reports/，每次新文件名，拒绝覆盖。其他目录使用脚本绝对路径。

## 数据与隐私

脚本以 readOnly: true 连接 SQLite，在只读事务里读取 skills、enablements，并在表存在时读取 skill_tags。不执行迁移、不写数据库，不调用 Desktop 初始化/恢复。Hub 顺序与 CLI 一致：--hub > SKLP_HOME > ~/.skill-port.json > ~/.skill-port。表结构不兼容时失败，不使用旧快照。启用统计是登记数量，不是链接健康检查。展示分类来自 assets/categories.json。中文描述优先 assets/descriptions.zh.json，再被 skill-port-reports/descriptions.zh.json 覆盖。写出页面前做中文自查：汉字少于 8 个，或英文字母多于汉字时，退出码为 2，打印 needsChinese，并且不写 HTML。不修改 Hub。

这是本地私有报告，不是公开 catalog；请勿上传或公开发布。HTML 使用系统字体且无任何外部请求。

## 验证

```sh
node --test agent-skill/skill-port-report/scripts/generate-report.test.mjs
```

测试使用临时 SQLite fixture，不读取真实 Hub，不依赖源码目录里存在报告，也不会在技能目录写产物。
