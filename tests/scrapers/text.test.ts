import { describe, expect, it } from "vitest";
import { parse } from "node-html-parser";

import { cleanText, elementText, optionalText } from "../../src/scrapers/text";

describe("cleanText", () => {
  it("collapses runs of whitespace and trims both ends", () => {
    expect(cleanText("\n   Baş\t\tmühasib \n ")).toBe("Baş mühasib");
  });

  it("reads a missing value as empty", () => {
    expect(cleanText(undefined)).toBe("");
    expect(cleanText("   ")).toBe("");
  });
});

describe("elementText", () => {
  it("cleans the element's text and reads a missing element as empty", () => {
    const root = parse("<div><p>  Bakı \n şəhəri </p></div>");

    expect(elementText(root.querySelector("p"))).toBe("Bakı şəhəri");
    expect(elementText(root.querySelector(".nothing"))).toBe("");
    expect(elementText(undefined)).toBe("");
  });
});

describe("optionalText", () => {
  it("leaves a blank value out of the vacancy entirely", () => {
    expect(optionalText(undefined)).toBeUndefined();
    expect(optionalText("")).toBeUndefined();
    expect(optionalText(" \n\t ")).toBeUndefined();
  });

  it("cleans a value that is there", () => {
    expect(optionalText("  2 gün   əvvəl ")).toBe("2 gün əvvəl");
  });
});
