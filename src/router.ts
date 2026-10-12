import { getAdapter } from "./agents/registry";
import type { AgentJob } from "./agents/types";
import type { RepoConfig } from "./config/schema";
import type { Env } from "./env";
import type { GatewayEvent } from "./events/types";

/** Turns an event into one job per matching route. */
export function route(env: Env, config: RepoConfig, event: GatewayEvent): AgentJob[] {
  const jobs: AgentJob[] = [];
  for (const r of config.routes) {
    if (r.on !== event.name) continue;
    if ((r.skip_drafts ?? true) && event.pr?.draft) continue;
    const adapter = getAdapter(env, r.agent);
    if (!adapter) {
      console.warn(`unknown agent "${r.agent}" in ${event.repo.owner}/${event.repo.name}`);
      continue;
    }
    jobs.push({ agent: r.agent, prompt: r.prompt ? render(r.prompt, event) : adapter.defaultPrompt(event), event });
  }
  return jobs;
}

/** Fills `{{a.b}}` placeholders from the event; unknown paths render empty. */
export function render(template: string, event: GatewayEvent): string {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, path: string) => {
    let value: unknown = event;
    for (const key of path.split(".")) value = (value as Record<string, unknown> | undefined)?.[key];
    return value === undefined || value === null ? "" : String(value);
  });
}
