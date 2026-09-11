import { describe, expect, it } from "vitest";

import { normalize, tokenize } from "../src/matching/normalize";

describe("normalize", () => {
  it("folds Azerbaijani characters and lowercases text", () => {
    expect(normalize("İnformasiya Texnologiyaları üzrə Mütəxəssis")).toBe(
      "informasiya texnologiyalari uzre mutexessis",
    );
  });

  it("trims and collapses punctuation and whitespace", () => {
    expect(normalize("  Backend / Full-stack   Developer!! ")).toBe("backend full stack developer");
  });

  it("keeps digits and letters of other alphabets", () => {
    expect(normalize("1C Mühasib (Программист)")).toBe("1c muhasib программист");
  });

  it("returns an empty string when nothing is a letter or a digit", () => {
    expect(normalize(" -- // ")).toBe("");
  });
});

describe("tokenize", () => {
  it("returns normalized tokens", () => {
    expect(tokenize("Qrafik dizayner")).toEqual(["qrafik", "dizayner"]);
  });

  it("returns an empty array for blank input", () => {
    expect(tokenize("  ")).toEqual([]);
  });
});
