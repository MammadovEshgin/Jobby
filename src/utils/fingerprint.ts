import { normalize } from "../matching/normalize";

export async function fingerprint(title: string, company: string): Promise<string> {
  const input = `${normalize(title)}|${normalize(company)}`;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));

  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
