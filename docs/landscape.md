# 同类产品调研（2026-10）

目标：基于 GitHub 事件驱动、可编排多家 Agent（Amp、Claude Code、Codex…）的 GitHub App。

## 结论

没有找到一个开源或商用产品同时满足：① 以 GitHub App 形式安装；② 以事件（尤其 “CI 全绿”）为触发；③ 路由到**多家**厂商的 Agent；④ 配置放在仓库内。现有产品大多只覆盖其中两三点，或绑定单一厂商。

## 相近产品

| 产品 | 做了什么 | 与 RepoGateway 的差异 |
| --- | --- | --- |
| [GitHub Agent HQ](https://thenewstack.io/github-agent-hq/) | 在 GitHub 内把 issue 分配给 Copilot / Claude / Codex，PR 中 @ 它们跟进 | 人工指派为主，没有事件路由规则；仅限 GitHub 合作的 Agent，不含 Amp；需 Copilot Pro+/Enterprise |
| [Claude Code Routines](https://codex.danielvaughan.com/2026/04/14/claude-code-routines-launch/) / `claude-code-action` | 定时、HTTP 或 GitHub 事件触发 Claude Code 云端运行 | 仅 Claude；每仓库写 workflow，没有跨 Agent 编排 |
| [Composio Agent Orchestrator](https://www.mintlify.com/ComposioHQ/agent-orchestrator) | 并行运行多个编码 Agent，监听 CI 失败与 review 反馈并回派给 Agent | 侧重“修复失败”的闭环，不是 CI 全绿后触发审阅；自托管编排器而非 GitHub App |
| [Optio](https://www.everydev.ai/tools/optio/llms.txt) | issue / Linear 工单 → Claude Code / Codex 在 K8s 上实现 → CI 与审阅通过后合并 | 面向“工单到合并”的流水线，需 K8s；Agent 种类固定 |
| [Cloudflare 内部 AI code review](https://blog.cloudflare.com/ai-code-review) | 基于 OpenCode 的 CI 原生多 Agent 审阅 | 内部系统，未开源，单一 Agent 框架 |
| Hookdeck + Trigger.dev（[教程](https://hookdeck.com/webhooks/platforms/github-trigger-dev-claude-automation)） | Webhook 网关按 header 过滤，路由到不同任务 | 通用 webhook 网关，Agent 适配和配置都要自己写 |
| CodeRabbit、Copilot code review 等 | PR 自动审阅 | 自家模型，不可替换为任意 Agent，也不做编排 |

## 可借鉴点

- 仓库内 “配置 issue” 的模式与 Renovate 的 Dependency Dashboard 类似，用户熟悉、无需改代码即可调整。
- GitHub 没有 “PR 所有 CI 通过” 的单一事件，需要在 `check_suite.completed` 时汇总 check suites 与 commit status（已在 `src/events/ci.ts` 实现）。
- Amp SDK（`@ampcode/sdk`）通过子进程驱动 Amp CLI，需要 `AMP_API_KEY`，不能直接在 Worker 中运行，需要容器或 runner；Cloudflare Sandbox / Containers 已于 2026-04 GA，是同栈内最顺手的选择。
