import type { Env } from "../env";
import type { RepoRef } from "../events/types";
import type { GitHubClient } from "../github/client";
import { DEFAULT_CONFIG_ISSUE_BODY, EMPTY_CONFIG, parseConfigIssue, type RepoConfig } from "./schema";

interface Issue {
  number: number;
  body?: string | null;
  labels?: { name: string }[];
  performed_via_github_app?: { id: number } | null;
}

const cacheKey = (repo: RepoRef) => `config:${repo.owner}/${repo.name}`;

export async function loadConfig(env: Env, gh: GitHubClient, repo: RepoRef): Promise<RepoConfig> {
  const cached = await env.CONFIG_CACHE.get<RepoConfig>(cacheKey(repo), "json");
  if (cached) return cached;
  const issue = await findConfigIssue(env, gh, repo);
  return refreshConfig(env, repo, issue?.body);
}

/** Re-parses and caches config; an invalid config is logged and treated as empty. */
export async function refreshConfig(env: Env, repo: RepoRef, body: string | null | undefined): Promise<RepoConfig> {
  let config = EMPTY_CONFIG;
  try {
    config = parseConfigIssue(body);
  } catch (err) {
    console.warn(`invalid config for ${repo.owner}/${repo.name}:`, err);
  }
  await env.CONFIG_CACHE.put(cacheKey(repo), JSON.stringify(config));
  return config;
}

/**
 * Only issues opened by this App count: the label alone could be added to any issue by
 * a triager, and the config decides what prompts reach agents.
 */
export function isConfigIssue(env: Env, issue: Issue): boolean {
  return (
    !!issue.labels?.some((l) => l.name === env.CONFIG_ISSUE_LABEL) &&
    String(issue.performed_via_github_app?.id) === env.GITHUB_APP_ID
  );
}

/** Opens the config issue on a freshly installed repo unless one already exists. */
export async function ensureConfigIssue(env: Env, gh: GitHubClient, repo: RepoRef): Promise<void> {
  if (await findConfigIssue(env, gh, repo)) return;
  const issue = await gh.request<Issue>("POST", `/repos/${repo.owner}/${repo.name}/issues`, {
    title: "RepoGateway configuration",
    body: DEFAULT_CONFIG_ISSUE_BODY,
    labels: [env.CONFIG_ISSUE_LABEL],
  });
  await refreshConfig(env, repo, issue.body);
}

async function findConfigIssue(env: Env, gh: GitHubClient, repo: RepoRef): Promise<Issue | undefined> {
  const label = encodeURIComponent(env.CONFIG_ISSUE_LABEL);
  const issues = await gh.request<Issue[]>(
    "GET",
    `/repos/${repo.owner}/${repo.name}/issues?labels=${label}&state=open&per_page=20`,
  );
  return issues.find((i) => isConfigIssue(env, i));
}
