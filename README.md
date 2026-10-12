# RepoGateway

事件驱动的多 Agent 编排 GitHub App，运行在 Cloudflare Workers 上。

安装到仓库后，RepoGateway 监听 issue / PR / GitHub Actions 事件，按仓库里一个**配置 issue** 中的路由规则，把事件交给对应的 Agent（目前是 [Amp](https://ampcode.com) `@ampcode/sdk`），Agent 完成后把结果评论回 PR / issue。

典型场景：Claude Code 提交 PR → CI 全绿 → RepoGateway 发出 `pull_request.ci_passed` → Amp 审阅 PR → 在 PR 上评论。

## 架构

```
GitHub webhook ──► POST /webhooks/github (Hono)
                    │ 校验签名，202 立即返回
                    ▼
            normalize / deriveCiPassed      ← check_suite.completed 时汇总所有 check 与 status
                    │ GatewayEvent
                    ▼
            loadConfig (KV 缓存 ← 配置 issue)
                    │ route()
                    ▼
            Queue: AGENT_JOBS ──► queue() ──► AgentAdapter.run() ──► PR 评论
```

| 目录 | 内容 |
| --- | --- |
| `src/index.ts` | Worker 入口：webhook 路由与 Queue consumer |
| `src/github/` | 签名校验、App JWT 与 installation token、REST 客户端 |
| `src/events/` | 内部事件模型；`ci.ts` 推导 “CI 全部通过” |
| `src/config/` | 配置 issue 的 YAML 解析、默认模板与 KV 缓存 |
| `src/agents/` | Agent 适配器接口与 Amp 适配器 |
| `src/router.ts` | 事件 → 路由规则 → AgentJob |

## 配置 issue

App 安装后会在每个仓库创建一个带 `repogateway-config` 标签的 issue，编辑其中的 YAML 即生效：

```yaml
routes:
  - on: pull_request.ci_passed
    agent: amp
    skip_drafts: true
    prompt: |
      Review pull request #{{pr.number}} ({{pr.url}}) on branch {{pr.headRef}}.
```

只有由本 App 创建的配置 issue 才会被读取，单纯加标签无效。

## 已知限制

- **Amp 的执行环境尚未接入。** `@ampcode/sdk` 通过子进程运行 Amp CLI，Worker isolate 中无法执行。`src/agents/amp.ts` 里的 `AmpRunner` 是要补上的一环，可选方案：Cloudflare Sandbox / Containers、GitHub Actions `workflow_dispatch`、自托管 runner。
- 来自 fork 的 PR 不会触发 `pull_request.ci_passed`（GitHub 不在 `check_suite.pull_requests` 中返回它们）。

## 本地开发与部署

```bash
npm install
cp .dev.vars.example .dev.vars   # 填入 webhook secret、PKCS#8 私钥、AMP_API_KEY
npm run dev                      # 配合 smee.io / cloudflared 把 webhook 转发到本地
npm test && npm run typecheck

npx wrangler kv namespace create CONFIG_CACHE     # 把 id 写入 wrangler.jsonc
npx wrangler queues create repogateway-agent-jobs
npx wrangler secret put GITHUB_WEBHOOK_SECRET
npx wrangler secret put GITHUB_APP_PRIVATE_KEY
npx wrangler secret put AMP_API_KEY
npm run deploy
```

### GitHub App 设置

- Webhook URL：`https://<worker>/webhooks/github`
- 权限：Issues（读写）、Pull requests（读写）、Checks（读）、Commit statuses（读）、Actions（读）、Contents（读）、Metadata（读）
- 订阅事件：Issues、Issue comment、Pull request、Check suite、Workflow run（installation 事件默认推送）
