import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG_ISSUE_BODY, parseConfigIssue } from "../src/config/schema";

describe("parseConfigIssue", () => {
  it("parses the default issue body", () => {
    const config = parseConfigIssue(DEFAULT_CONFIG_ISSUE_BODY);
    expect(config.routes).toHaveLength(1);
    expect(config.routes[0]).toMatchObject({ on: "pull_request.ci_passed", agent: "amp", skip_drafts: true });
  });

  it("returns no routes when there is no yaml block", () => {
    expect(parseConfigIssue("just text").routes).toEqual([]);
    expect(parseConfigIssue(null).routes).toEqual([]);
  });

  it("rejects routes without on/agent", () => {
    expect(() => parseConfigIssue("```yaml\nroutes:\n  - agent: amp\n```")).toThrow(/routes\[0\]/);
  });
});
