import { describe, expect, it } from "vitest";
import { createAppJwt } from "../src/github/client";

describe("createAppJwt", () => {
  it("signs an RS256 JWT that verifies with the public key", async () => {
    const pair = (await crypto.subtle.generateKey(
      { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
      true,
      ["sign", "verify"],
    )) as CryptoKeyPair;
    const der = new Uint8Array((await crypto.subtle.exportKey("pkcs8", pair.privateKey)) as ArrayBuffer);
    const pem = `-----BEGIN PRIVATE KEY-----\n${btoa(String.fromCharCode(...der))}\n-----END PRIVATE KEY-----`;

    const jwt = await createAppJwt("12345", pem, 1_700_000_000_000);
    const [h, p, s] = jwt.split(".") as [string, string, string];
    const decode = (x: string) => Uint8Array.from(atob(x.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

    expect(JSON.parse(new TextDecoder().decode(decode(p)))).toEqual({ iat: 1_699_999_940, exp: 1_700_000_480, iss: "12345" });
    const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", pair.publicKey, decode(s), new TextEncoder().encode(`${h}.${p}`));
    expect(ok).toBe(true);
  });

  it("rejects PKCS#1 keys with a pointer to the conversion", async () => {
    await expect(createAppJwt("1", "-----BEGIN RSA PRIVATE KEY-----\nAA\n-----END RSA PRIVATE KEY-----")).rejects.toThrow(/PKCS#8/);
  });
});
