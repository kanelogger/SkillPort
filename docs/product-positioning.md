# SkillPort：Skill 管理工具

命令名是 `sklp`。

## 背景问题

现在使用 Skill 的方式**过于手工**：

* Skill 分散在不同目录、不同项目、不同 Agent 配置里。
* 全局启用太多 Skill 会污染上下文。
* 项目到底依赖哪些 Skill 不清楚。
* Skill 更新、迁移、删除、复用缺少统一入口。
* 本地原创 Skill、远程 Skill、项目启用状态混在一起，长期会失控。

`/Users/kanehua/project/hk-skills` 已经验证了这个问题真实存在，但它带有明显的个人工作流和本机管理属性。

SkillPort 要把其中通用、可产品化的部分抽出来。

## 核心目标

SkillPort 的目标**不是**做一个大而全的 Agent 平台，而是**做一件事**：让 Skill 可以被声明、安装、链接、更新、检查，并稳定投影到项目里。

核心价值：

* **项目级隔离**
* **可复现安装**
* **低成本复用**
* **清晰的 Skill 来源**
* **简单的 CLI 工作流**

## 功能聚焦

第一阶段只聚焦 CLI。

核心命令方向：

```bash
sklp init
sklp link
sklp install
sklp update
sklp list
sklp doctor
```

其中 `sklp link` 是最核心的命令。它应该让用户可以把一个本地或远程 Skill 接入当前项目，而不用手动复制 SKILL.md、记路径、改配置。

## 路线图

### 第一阶段：CLI

目标发布形式：npm package，以及 macOS / Windows / Linux standalone binary。

### 第二阶段：GUI

GUI 只作为 CLI 的可视化外壳，目标平台：

* macOS
* Windows

GUI 不能重新定义一套状态模型。

## 产品定位

* 项目优先，而不是全局优先
* 安装和启用分离
* Skill 来源和运行态输出分离
* 本地 Skill 和远程 Skill 都要支持
* 产品只做 Skill 包管理
* 先 CLI，后 GUI
* `sklp` 是主要交互入口
