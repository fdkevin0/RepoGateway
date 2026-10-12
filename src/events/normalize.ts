import type { GatewayEvent, GatewayEventName, RepoRef } from "./types";

// Loosely typed on purpose: only the fields we read are declared.
export interface WebhookPayload {
  action?: string;
  installation?: { id: number };
  repository?: { name: string; owner: { login: string } };
  issue?: {
    number: number;
    title: string;
    html_url: string;
    body?: string | null;
    labels?: { name: string }[];
    performed_via_github_app?: { id: number } | null;
    pull_request?: unknown;
  };
  pull_request?: {
    number: number;
    title: string;
    html_url: string;
    draft?: boolean;
    head: { sha: string; ref: string };
  };
  [key: string]: unknown;
}

const PASSTHROUGH = new Set<string>([
  "issues.opened",
  "issues.labeled",
  "issue_comment.created",
  "pull_request.opened",
  "pull_request.ready_for_review",
  "pull_request.synchronize",
  "workflow_run.completed",
]);

/** Maps a webhook delivery straight onto a gateway event, or null if it is not routable as-is. */
export function normalize(githubEvent: string, deliveryId: string, payload: WebhookPayload): GatewayEvent | null {
  const name = `${githubEvent}.${payload.action ?? ""}`;
  if (!PASSTHROUGH.has(name) || !payload.installation || !payload.repository) return null;

  const event: GatewayEvent = {
    name: name as GatewayEventName,
    deliveryId,
    installationId: payload.installation.id,
    repo: repoRef(payload),
  };
  if (payload.pull_request) {
    const pr = payload.pull_request;
    event.pr = {
      number: pr.number,
      headSha: pr.head.sha,
      headRef: pr.head.ref,
      draft: pr.draft ?? false,
      title: pr.title,
      url: pr.html_url,
    };
  }
  if (payload.issue) {
    event.issue = { number: payload.issue.number, title: payload.issue.title, url: payload.issue.html_url };
  }
  return event;
}

export function repoRef(payload: WebhookPayload): RepoRef {
  return { owner: payload.repository!.owner.login, name: payload.repository!.name };
}
