import { describe, expect, it } from "vitest";
import { verifySignature } from "../src/github/verify";

async function sign(secret: string, body: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)));
  return "sha256=" + [...mac].map((b) => b.toString(16).padStart(2, "0")).join("");
}

describe("verifySignature", () => {
  it("accepts a valid signature and rejects tampering", async () => {
    const header = await sign("s3cret", '{"a":1}');
    expect(await verifySignature("s3cret", '{"a":1}', header)).toBe(true);
    expect(await verifySignature("s3cret", '{"a":2}', header)).toBe(false);
    expect(await verifySignature("other", '{"a":1}', header)).toBe(false);
  });

  it("rejects missing or malformed headers", async () => {
    expect(await verifySignature("s3cret", "x", null)).toBe(false);
    expect(await verifySignature("s3cret", "x", "sha1=abc")).toBe(false);
    expect(await verifySignature("s3cret", "x", "sha256=zz")).toBe(false);
  });
});
