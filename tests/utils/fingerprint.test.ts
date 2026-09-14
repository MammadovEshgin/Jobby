import { describe, expect, it } from "vitest";

import { fingerprint } from "../../src/utils/fingerprint";

// Stored in D1 (`sent_vacancies`, `vacancy_snapshot`): a changed hash makes every vacancy already
// delivered look new and sends it to every user again. Each expected value is sha256 of the
// hand-normalized "title|company", computed with node:crypto, not with the code under test.
describe("fingerprint", () => {
  it.each([
    [
      "Backend Developer",
      "Acme MMC",
      "85da72ba29030564dc9b274c9d73300e5917f3c3df42333dc53daedbd7254ec4",
    ],
    [
      "Baş Mühasib",
      "Azərbaycan Dəmir Yolları",
      "9b21365f7c9b631b3867a674c7ceffa9f5ad2e2688034e0888a8b75bb71cafb6",
    ],
    [
      "İNSAN RESURSLARI ÜZRƏ MÜTƏXƏSSİS",
      "ŞİRKƏT MMC",
      "0919c44b8d5f271717801186e35eb34f8d325733cc9e9a80a1347cf247e223ed",
    ],
    [
      "  Senior .NET/C# Developer!! ",
      "ACME, MMC",
      "f2517c00c26348fba93b24d7a3cf1218a5488d812ac6b8c644f58627ca3ac87d",
    ],
    ["C++ Proqramçı", "Glorri", "b518224f12c46932715068191fefba6e1c059d1ef23eedcc751ad3ca0cee259f"],
    ["Mühasib", "Acme", "ee48febb3b6f2653a989c736b865a1835612bd654fee874da1176e3c0c3f16cd"],
    ["Mu\u0308hasib", "Acme", "ee48febb3b6f2653a989c736b865a1835612bd654fee874da1176e3c0c3f16cd"],
    ["", "", "cbe5cfdf7c2118a9c3d78ef1d684f3afa089201352886449a06a6511cfef74a7"],
    ["Разработчик", "Яндекс", "bbbe0237ea8c60a7918ce96106d4697deeec3369d0c229571706ae4dddeaad9e"],
    ["Sales|Marketing", "Acme", "788d2c5fc27b988887af9e8b583717cbd73aa8f7acb2d80bc07211da82726caa"],
  ])("hashes %j at %j to the value already stored in D1", async (title, company, stored) => {
    await expect(fingerprint(title, company)).resolves.toBe(stored);
  });
});

describe("fingerprint equivalence", () => {
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
