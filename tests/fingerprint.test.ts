import { describe, expect, it } from "vitest";

import { dedupeVacanciesByFingerprint, fingerprint } from "../src/utils/fingerprint";

describe("fingerprint", () => {
  it("creates a stable sha256 hex digest from normalized title and company", async () => {
    await expect(fingerprint("Backend Developer", "Acme MMC")).resolves.toMatch(/^[a-f0-9]{64}$/);
    await expect(fingerprint(" Backend   Developer ", "ACME MMC")).resolves.toBe(
      await fingerprint("backend developer", "acme mmc"),
    );
  });

  it("does not include date or source in the fingerprint", async () => {
    const first = await fingerprint("Mühasib", "Example LLC");
    const second = await fingerprint("Muhasib", "Example LLC");

    expect(first).toBe(second);
  });
});

describe("dedupeVacanciesByFingerprint", () => {
  it("keeps only the first vacancy with the same title and company", async () => {
    const vacancies = await dedupeVacanciesByFingerprint([
      {
        title: "Backend Developer",
        company: "Acme",
        location: "Bakı",
        url: "https://example.com/1",
        source: "test",
      },
      {
        title: " backend developer ",
        company: "ACME",
        location: "Bakı",
        url: "https://example.com/2",
        source: "test",
      },
      {
        title: "Frontend Developer",
        company: "Acme",
        location: "Bakı",
        url: "https://example.com/3",
        source: "test",
      },
    ]);

    expect(vacancies.map((vacancy) => vacancy.url)).toEqual(["https://example.com/1", "https://example.com/3"]);
  });
});
