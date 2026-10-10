# Skill Port 本地项目报告

调用后生成 Hub 已登记本地项目的单文件 HTML，不是已安装 Skill 清册。展示名称、完整项目路径、登记时间和项目 enablement 数量；全局 enablement 单独汇总。零启用项目仍显示，未登记当前目录不添加。

## 注册并让 Agent 可调用

从仓库根目录执行：

```sh
sklp install ./agent-skill/skill-port-report --dry-run --json
sklp link ./agent-skill/skill-port-report --json
sklp enable skill-port-report --global --json
sklp info skill-port-report --json
```

全局 enablement 使技能出现在 ~/.agents/skills/skill-port-report，无需登记当前仓库。link 保留源码目录并即时跟随修改。Agent 已缓存技能列表时，刷新技能发现或开启新会话，然后说“调用 skill-port-report，生成本地项目列表”。

## 手动生成

```sh
node agent-skill/skill-port-report/scripts/generate-report.mjs
node agent-skill/skill-port-report/scripts/generate-report.mjs --hub "<Hub 目录>" --output "<新文件>.html"
```

需要 Node.js 22.16.0+ 和已有 Hub，无外部依赖。输出默认位于调用目录的 skill-port-reports/，每次新文件名，拒绝覆盖。其他目录使用脚本绝对路径。

## 数据与隐私

sklp 暂无项目列表命令；脚本直接以 readOnly: true 连接 SQLite，在只读事务里读取 projects(path, created_at) 和 enablements(target_type, target_key)。不执行迁移、不写数据库，不调用 Desktop 初始化/恢复。Hub 顺序与 CLI 一致：--hub > SKLP_HOME > ~/.skill-port.json > ~/.skill-port。表结构不兼容时失败，不使用旧快照。项目启用数是登记数量，不是链接健康检查。

这是包含本地项目路径的私有报告，不是公开 catalog；请勿上传或公开发布。HTML 使用系统字体且无任何外部请求。

## 验证

```sh
node --test agent-skill/skill-port-report/scripts/generate-report.test.mjs
```

测试使用临时 SQLite fixture，不读取真实 Hub，不依赖源码目录里存在报告，也不会在技能目录写产物。浏览器验证脚本接受已安装 Playwright 的 index.mjs 路径和报告路径，使用临时 HTTP 服务并自动关闭。
