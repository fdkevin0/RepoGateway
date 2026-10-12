import type { Env } from "../env";
import type { GitHubClient } from "../github/client";
import { repoRef, type WebhookPayload } from "./normalize";
import type { GatewayEvent } from "./types";

const GREEN = new Set(["success", "neutral", "skipped"]);

interface CheckSuitePayload extends WebhookPayload {
  check_suite: { head_sha: string; conclusion: string | null; pull_requests: { number: number }[] };
}

/**
 * GitHub has no "all CI passed" webhook. On each `check_suite.completed` we re-check
 * every suite and status on the head commit and emit `pull_request.ci_passed` once
 * per (repo, sha) when the last one turns green.
 */
export async function deriveCiPassed(
  env: Env,
  gh: GitHubClient,
  deliveryId: string,
  payload: WebhookPayload,
): Promise<GatewayEvent[]> {
  const { check_suite: suite } = payload as CheckSuitePayload;
  if (payload.action !== "completed" || !GREEN.has(suite.conclusion ?? "")) return [];
  // pull_requests is empty for PRs from forks; those are not handled yet.
  if (suite.pull_requests.length === 0) return [];

  const repo = repoRef(payload);
  const base = `/repos/${repo.owner}/${repo.name}/commits/${suite.head_sha}`;
  if (!(await isHeadGreen(gh, base))) return [];

  // KV is eventually consistent, so two suites finishing together may still both pass this check.
  const dedupeKey = `ci_passed:${repo.owner}/${repo.name}@${suite.head_sha}`;
  if (await env.CONFIG_CACHE.get(dedupeKey)) return [];
  await env.CONFIG_CACHE.put(dedupeKey, deliveryId, { expirationTtl: 7 * 24 * 3600 });

  const events: GatewayEvent[] = [];
  for (const { number } of suite.pull_requests) {
    const pr = await gh.request<{
      title: string;
      html_url: string;
      draft: boolean;
      head: { sha: string; ref: string };
    }>("GET", `/repos/${repo.owner}/${repo.name}/pulls/${number}`);
    if (pr.head.sha !== suite.head_sha) continue; // PR moved on since this run
    events.push({
      name: "pull_request.ci_passed",
      deliveryId,
      installationId: payload.installation!.id,
      repo,
      pr: { number, headSha: pr.head.sha, headRef: pr.head.ref, draft: pr.draft, title: pr.title, url: pr.html_url },
    });
  }
  return events;
}

async function isHeadGreen(gh: GitHubClient, commitPath: string): Promise<boolean> {
  const suites = await gh.request<{ check_suites: { status: string; conclusion: string | null; latest_check_runs_count: number }[] }>(
    "GET",
    `${commitPath}/check-suites?per_page=100`,
  );
  const allSuitesGreen = suites.check_suites
    .filter((s) => s.latest_check_runs_count > 0) // apps that never created runs leave empty queued suites
    .every((s) => s.status === "completed" && GREEN.has(s.conclusion ?? ""));
  if (!allSuitesGreen) return false;

  const status = await gh.request<{ state: string; total_count: number }>("GET", `${commitPath}/status`);
  return status.total_count === 0 || status.state === "success";
}
