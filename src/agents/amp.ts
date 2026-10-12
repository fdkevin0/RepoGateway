import type { Env } from "../env";
import { GitHubClient } from "../github/client";
import type { GatewayEvent } from "../events/types";
import type { AgentAdapter, AgentJob } from "./types";

/**
 * Executes an Amp prompt against a checkout of the repo and returns Amp's final answer.
 *
 * `@ampcode/sdk` drives the Amp CLI as a child process, which a Worker isolate cannot
 * do, so this has to call out to somewhere that can: a Cloudflare Sandbox/Container,
 * a GitHub Actions `workflow_dispatch`, or a self-hosted runner. Not wired up yet.
 */
export interface AmpRunner {
  execute(input: { repoUrl: string; ref: string; prompt: string; apiKey: string }): Promise<string>;
}

export const unconfiguredRunner: AmpRunner = {
  async execute() {
    throw new Error("No Amp runner configured; see AmpRunner in src/agents/amp.ts");
  },
};

export class AmpAdapter implements AgentAdapter {
  readonly name = "amp";

  constructor(
    private readonly env: Env,
    private readonly runner: AmpRunner = unconfiguredRunner,
  ) {}

  defaultPrompt(event: GatewayEvent): string {
    if (event.pr) {
      return `Review pull request #${event.pr.number} (${event.pr.url}). Focus on correctness bugs and risky changes. Be concise.`;
    }
    return `Handle ${event.name} on ${event.repo.owner}/${event.repo.name}.`;
  }

  async run(job: AgentJob): Promise<void> {
    const { event } = job;
    if (!this.env.AMP_API_KEY) throw new Error("AMP_API_KEY is not set");
    const result = await this.runner.execute({
      repoUrl: `https://github.com/${event.repo.owner}/${event.repo.name}`,
      ref: event.pr?.headSha ?? "HEAD",
      prompt: job.prompt,
      apiKey: this.env.AMP_API_KEY,
    });

    const target = event.pr?.number ?? event.issue?.number;
    if (target === undefined) return;
    const gh = await GitHubClient.forInstallation(this.env, event.installationId);
    await gh.request("POST", `/repos/${event.repo.owner}/${event.repo.name}/issues/${target}/comments`, {
      body: `${result}\n\n<sub>Posted by RepoGateway · agent: amp · trigger: \`${event.name}\`</sub>`,
    });
  }
}
