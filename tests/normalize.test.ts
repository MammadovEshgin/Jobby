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
});

describe("tokenize", () => {
  it("returns normalized tokens", () => {
    expect(tokenize("Qrafik dizayner")).toEqual(["qrafik", "dizayner"]);
  });

  it("returns an empty array for blank input", () => {
    expect(tokenize("  ")).toEqual([]);
  });
});
