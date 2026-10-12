/**
 * Internal event names, decoupled from GitHub's webhook shape so routes in the
 * config issue stay stable. Most are `<github event>.<action>`; a few are derived.
 */
export type GatewayEventName =
  | "issues.opened"
  | "issues.labeled"
  | "issue_comment.created"
  | "pull_request.opened"
  | "pull_request.ready_for_review"
  | "pull_request.synchronize"
  | "workflow_run.completed"
  /** Derived: every check suite and commit status on the PR head is green. */
  | "pull_request.ci_passed";

export interface RepoRef {
  owner: string;
  name: string;
}

export interface GatewayEvent {
  name: GatewayEventName;
  deliveryId: string;
  installationId: number;
  repo: RepoRef;
  pr?: { number: number; headSha: string; headRef: string; draft: boolean; title: string; url: string };
  issue?: { number: number; title: string; url: string };
}
