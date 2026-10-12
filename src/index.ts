import { Hono } from "hono";
import { getAdapter } from "./agents/registry";
import type { AgentJob } from "./agents/types";
import { ensureConfigIssue, isConfigIssue, loadConfig, refreshConfig } from "./config/store";
import type { Env } from "./env";
import { deriveCiPassed } from "./events/ci";
import { normalize, repoRef, type WebhookPayload } from "./events/normalize";
import type { GatewayEvent } from "./events/types";
import { GitHubClient } from "./github/client";
import { verifySignature } from "./github/verify";
import { route } from "./router";

const app = new Hono<{ Bindings: Env }>();

app.get("/", (c) => c.text("RepoGateway ok"));

app.post("/webhooks/github", async (c) => {
  const body = await c.req.text();
  if (!(await verifySignature(c.env.GITHUB_WEBHOOK_SECRET, body, c.req.header("x-hub-signature-256")))) {
    return c.text("invalid signature", 401);
  }
  const githubEvent = c.req.header("x-github-event") ?? "";
  const deliveryId = c.req.header("x-github-delivery") ?? crypto.randomUUID();
  const payload = JSON.parse(body) as WebhookPayload;

  // GitHub expects a response within 10s; do the work after acknowledging.
  c.executionCtx.waitUntil(
    handleDelivery(c.env, githubEvent, deliveryId, payload).catch((err) =>
      console.error(`delivery ${deliveryId} (${githubEvent}) failed:`, err),
    ),
  );
  return c.text("accepted", 202);
});

async function handleDelivery(env: Env, githubEvent: string, deliveryId: string, payload: WebhookPayload) {
  const installationId = payload.installation?.id;
  if (!installationId) return;
  const gh = await GitHubClient.forInstallation(env, installationId);

  type RepoEntry = { full_name: string };
  if (githubEvent === "installation" && payload.action === "created") {
    return ensureConfigIssues(env, gh, (payload.repositories as RepoEntry[] | undefined) ?? []);
  }
  if (githubEvent === "installation_repositories" && payload.action === "added") {
    return ensureConfigIssues(env, gh, (payload.repositories_added as RepoEntry[] | undefined) ?? []);
  }

  if (githubEvent === "issues" && payload.issue && isConfigIssue(env, payload.issue)) {
    const removed = payload.action === "closed" || payload.action === "deleted";
    await refreshConfig(env, repoRef(payload), removed ? null : payload.issue.body);
    return;
  }

  let events: GatewayEvent[];
  if (githubEvent === "check_suite") {
    events = await deriveCiPassed(env, gh, deliveryId, payload);
  } else {
    const event = normalize(githubEvent, deliveryId, payload);
    events = event ? [event] : [];
  }

  for (const event of events) {
    const config = await loadConfig(env, gh, event.repo);
    const jobs = route(env, config, event);
    if (jobs.length) await env.AGENT_JOBS.sendBatch(jobs.map((body) => ({ body })));
  }
}

async function ensureConfigIssues(env: Env, gh: GitHubClient, repos: { full_name: string }[]) {
  for (const { full_name } of repos) {
    const [owner, name] = full_name.split("/") as [string, string];
    await ensureConfigIssue(env, gh, { owner, name });
  }
}

export default {
  fetch: app.fetch,

  async queue(batch: MessageBatch<AgentJob>, env: Env) {
    for (const message of batch.messages) {
      const job = message.body;
      const adapter = getAdapter(env, job.agent);
      if (!adapter) {
        console.warn(`dropping job for unknown agent "${job.agent}"`);
        message.ack();
        continue;
      }
      try {
        await adapter.run(job);
        message.ack();
      } catch (err) {
        console.error(`${job.agent} job for ${job.event.name} failed:`, err);
        message.retry();
      }
    }
  },
} satisfies ExportedHandler<Env, AgentJob>;
