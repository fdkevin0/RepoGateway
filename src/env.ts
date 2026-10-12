import type { AgentJob } from "./agents/types";

export interface Env {
  GITHUB_APP_ID: string;
  GITHUB_WEBHOOK_SECRET: string;
  /** PKCS#8 PEM private key of the GitHub App. */
  GITHUB_APP_PRIVATE_KEY: string;
  CONFIG_ISSUE_LABEL: string;
  AMP_API_KEY?: string;
  CONFIG_CACHE: KVNamespace;
  AGENT_JOBS: Queue<AgentJob>;
}
