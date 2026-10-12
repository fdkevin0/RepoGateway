import type { Env } from "../env";

const API = "https://api.github.com";

/** Minimal GitHub REST client authenticated as one App installation. */
export class GitHubClient {
  constructor(private readonly token: string) {}

  static async forInstallation(env: Env, installationId: number): Promise<GitHubClient> {
    const jwt = await createAppJwt(env.GITHUB_APP_ID, env.GITHUB_APP_PRIVATE_KEY);
    const res = await fetch(`${API}/app/installations/${installationId}/access_tokens`, {
      method: "POST",
      headers: headers(`Bearer ${jwt}`),
    });
    if (!res.ok) throw new Error(`installation token: ${res.status} ${await res.text()}`);
    const { token } = (await res.json()) as { token: string };
    return new GitHubClient(token);
  }

  async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${API}${path}`, {
      method,
      headers: headers(`token ${this.token}`),
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${await res.text()}`);
    return (res.status === 204 ? undefined : await res.json()) as T;
  }
}

function headers(authorization: string): HeadersInit {
  return {
    authorization,
    accept: "application/vnd.github+json",
    "x-github-api-version": "2022-11-28",
    "user-agent": "repogateway",
  };
}

/** Signs a short-lived RS256 JWT identifying the App (expects a PKCS#8 PEM key). */
export async function createAppJwt(appId: string, pkcs8Pem: string, now = Date.now()): Promise<string> {
  const iat = Math.floor(now / 1000) - 60; // allow for clock drift
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = b64url(JSON.stringify({ iat, exp: iat + 9 * 60, iss: appId }));
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToDer(pkcs8Pem),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const data = new TextEncoder().encode(`${header}.${payload}`);
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, data);
  return `${header}.${payload}.${b64url(new Uint8Array(sig))}`;
}

function pemToDer(pem: string): ArrayBuffer {
  if (pem.includes("BEGIN RSA PRIVATE KEY")) {
    throw new Error("GITHUB_APP_PRIVATE_KEY must be PKCS#8; see .dev.vars.example for the openssl conversion");
  }
  const b64 = pem.replace(/\\n/g, "\n").replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)).buffer;
}

function b64url(input: string | Uint8Array): string {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
