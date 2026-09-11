import { describe, expect, it } from "vitest";

import { classify, type MatchClass } from "../src/matching/score";

interface Case {
  title: string;
  fields: string[];
  expected: MatchClass;
}

const cases: Case[] = [
  { title: "Backend developer", fields: ["backend developer"], expected: "exact" },
  { title: "Senior Frontend Developer", fields: ["frontend developer"], expected: "exact" },
  { title: "Full Stack Software Developer", fields: ["software developer"], expected: "exact" },
  { title: "Mobil developer", fields: ["mobil developer"], expected: "exact" },
  { title: "Data Analyst", fields: ["data analyst"], expected: "exact" },
  { title: "Qrafik dizayner", fields: ["qrafik dizayner"], expected: "exact" },
  { title: "Satış meneceri", fields: ["satis meneceri"], expected: "exact" },
  { title: "Baş mühasib", fields: ["bas muhasib"], expected: "exact" },
  { title: "HR mütəxəssisi", fields: ["hr mutexessisi"], expected: "exact" },
  { title: "Hüquqşünas", fields: ["huquqsunas"], expected: "exact" },
  { title: "Müəllim", fields: ["muellim"], expected: "exact" },
  { title: "Call-center operator", fields: ["call center operator"], expected: "exact" },
  { title: "Backend engineer", fields: ["software developer"], expected: "related" },
  { title: "Flutter developer", fields: ["mobile developer"], expected: "related" },
  { title: "Machine Learning Engineer", fields: ["data scientist"], expected: "related" },
  { title: "SMM menecer", fields: ["marketing"], expected: "related" },
  { title: "Auditor", fields: ["finance"], expected: "related" },
  { title: "İnsan resursları üzrə mütəxəssis", fields: ["hr"], expected: "related" },
  { title: "Repetitor", fields: ["teacher"], expected: "related" },
  { title: "Çağrı mərkəzi operatoru", fields: ["customer support"], expected: "related" },
  { title: "Aşpaz", fields: ["software developer"], expected: "none" },
  { title: "Sürücü", fields: ["designer"], expected: "none" },
  { title: "Anbardar", fields: ["legal"], expected: "none" },
];

describe("classify", () => {
  it.each(cases)("classifies $title as $expected", ({ title, fields, expected }) => {
    expect(classify({ title }, fields)).toBe(expected);
  });

  it("returns none when there are no fields", () => {
    expect(classify({ title: "Backend developer" }, [])).toBe("none");
  });

  it("keeps related matches out of strict mode", () => {
    expect(classify({ title: "Backend engineer" }, ["software developer"], { mode: "strict" })).toBe("none");
  });

  it("uses reverse synonyms for English and Azerbaijani terms", () => {
    expect(classify({ title: "Baş mühasib" }, ["accountant"])).toBe("related");
    expect(classify({ title: "Python developer" }, ["backend developer"])).toBe("related");
  });

  it("uses company, location, and description in broad mode", () => {
    expect(
      classify(
        {
          title: "Kiçik mütəxəssis",
          company: "Tech Academy",
          location: "Gəncə",
          description: "React Native və mobil tətbiqlər üzrə komanda.",
        },
        ["mobile developer"],
        { mode: "broad" },
      ),
    ).toBe("related");
  });

  it("does not use non-title fields in normal mode", () => {
    expect(
      classify(
        {
          title: "Kiçik mütəxəssis",
          company: "Tech Academy",
          location: "Gəncə",
          description: "React Native və mobil tətbiqlər üzrə komanda.",
        },
        ["mobile developer"],
      ),
    ).toBe("none");
  });
});
