import type { GatewayEvent } from "../events/types";

/** One unit of work handed to an agent, carried through the AGENT_JOBS queue. */
export interface AgentJob {
  agent: string;
  prompt: string;
  event: GatewayEvent;
}

export interface AgentAdapter {
  readonly name: string;
  /** Default prompt when the route does not set one. */
  defaultPrompt(event: GatewayEvent): string;
  run(job: AgentJob): Promise<void>;
}
