import type { Env } from "../env";
import { AmpAdapter } from "./amp";
import type { AgentAdapter } from "./types";

export function getAdapter(env: Env, name: string): AgentAdapter | undefined {
  switch (name) {
    case "amp":
      return new AmpAdapter(env);
    default:
      return undefined;
  }
}
