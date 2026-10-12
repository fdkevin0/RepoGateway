import { describe, expect, it } from "vitest";
import type { Env } from "../src/env";
import type { GatewayEvent } from "../src/events/types";
import { normalize } from "../src/events/normalize";
import { render, route } from "../src/router";

const env = {} as Env;

const prEvent = (draft: boolean): GatewayEvent => ({
  name: "pull_request.ci_passed",
  deliveryId: "d1",
  installationId: 1,
  repo: { owner: "acme", name: "app" },
  pr: { number: 7, headSha: "abc", headRef: "feat", draft, title: "Add x", url: "https://github.com/acme/app/pull/7" },
});

describe("route", () => {
  const config = {
    routes: [
      { on: "pull_request.ci_passed" as const, agent: "amp", prompt: "Review #{{pr.number}} in {{repo.owner}}/{{repo.name}}" },
      { on: "issues.opened" as const, agent: "amp" },
      { on: "pull_request.ci_passed" as const, agent: "nope" },
    ],
  };

  it("creates one job per matching known route with a rendered prompt", () => {
    const jobs = route(env, config, prEvent(false));
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({ agent: "amp", prompt: "Review #7 in acme/app" });
  });

  it("skips draft PRs by default", () => {
    expect(route(env, config, prEvent(true))).toEqual([]);
    const withDrafts = { routes: [{ ...config.routes[0]!, skip_drafts: false }] };
    expect(route(env, withDrafts, prEvent(true))).toHaveLength(1);
  });
});

describe("render", () => {
  it("leaves unknown paths empty", () => {
    expect(render("[{{issue.number}}]", prEvent(false))).toBe("[]");
  });
});

describe("normalize", () => {
  it("maps routable deliveries and ignores the rest", () => {
    const payload = {
      action: "opened",
      installation: { id: 9 },
      repository: { name: "app", owner: { login: "acme" } },
      issue: { number: 3, title: "Bug", html_url: "https://github.com/acme/app/issues/3" },
    };
    expect(normalize("issues", "d", payload)).toMatchObject({ name: "issues.opened", installationId: 9, issue: { number: 3 } });
    expect(normalize("issues", "d", { ...payload, action: "closed" })).toBeNull();
    expect(normalize("star", "d", payload)).toBeNull();
  });
});
