import { describe, expect, it } from "vitest";

import { fingerprint } from "../src/utils/fingerprint";

describe("fingerprint", () => {
  it("creates a stable sha256 hex digest from normalized title and company", async () => {
    await expect(fingerprint("Backend Developer", "Acme MMC")).resolves.toMatch(/^[a-f0-9]{64}$/);
    await expect(fingerprint(" Backend   Developer ", "ACME MMC")).resolves.toBe(
      await fingerprint("backend developer", "acme mmc"),
    );
  });

  it("treats an Azerbaijani letter and its Latin fallback as the same vacancy", async () => {
    const first = await fingerprint("Mühasib", "Example LLC");
    const second = await fingerprint("Muhasib", "Example LLC");

    expect(first).toBe(second);
  });
});
