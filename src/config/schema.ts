import { parse } from "yaml";
import type { GatewayEventName } from "../events/types";

export interface Route {
  /** Gateway event that triggers this route, e.g. `pull_request.ci_passed`. */
  on: GatewayEventName;
  /** Agent adapter name, e.g. `amp`. */
  agent: string;
  /** Prompt template; `{{pr.number}}`, `{{repo.owner}}` etc. are filled from the event. */
  prompt?: string;
  /** Skip draft PRs (default true). */
  skip_drafts?: boolean;
}

export interface RepoConfig {
  routes: Route[];
}

export const EMPTY_CONFIG: RepoConfig = { routes: [] };

const FENCE = /```ya?ml\s*\n([\s\S]*?)```/;

/** Reads the first ```yaml block of the config issue body. Throws on invalid config. */
export function parseConfigIssue(body: string | null | undefined): RepoConfig {
  const block = body?.match(FENCE)?.[1];
  if (!block) return EMPTY_CONFIG;
  const raw = parse(block) as { routes?: unknown } | null;
  if (!raw?.routes) return EMPTY_CONFIG;
  if (!Array.isArray(raw.routes)) throw new Error("`routes` must be a list");

  return {
    routes: raw.routes.map((r, i) => {
      if (typeof r?.on !== "string" || typeof r?.agent !== "string") {
        throw new Error(`routes[${i}] needs string \`on\` and \`agent\``);
      }
      return r as Route;
    }),
  };
}

export const DEFAULT_CONFIG_ISSUE_BODY = `This issue configures **RepoGateway** for this repository. Edit the YAML block below; changes apply on save.

\`\`\`yaml
routes:
  # When every check on a PR's head commit is green, ask Amp to review it.
  - on: pull_request.ci_passed
    agent: amp
    skip_drafts: true
    prompt: |
      Review pull request #{{pr.number}} ({{pr.url}}) on branch {{pr.headRef}}.
      Focus on correctness bugs and risky changes. Be concise.
\`\`\`

Supported events: \`issues.opened\`, \`issues.labeled\`, \`issue_comment.created\`, \`pull_request.opened\`, \`pull_request.ready_for_review\`, \`pull_request.synchronize\`, \`workflow_run.completed\`, \`pull_request.ci_passed\`.
Supported agents: \`amp\`.
`;
