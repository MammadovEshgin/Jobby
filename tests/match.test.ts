import { describe, expect, it } from "vitest";

import { matchField, matchFields, matchesAnyField } from "../src/matching/match";

function matches(title: string, field: string): boolean {
  return matchField({ title }, field).matched;
}

describe("cross-language matching", () => {
  const pairs: [string, string][] = [
    ["Musiqi müəllimi", "music teacher"],
    ["Music Teacher", "musiqi müəllimi"],
    ["Riyaziyyat müəllimi", "math teacher"],
    ["İngilis dili müəllimi", "english teacher"],
    ["English language teacher", "ingilis dili müəllimi"],
    ["Sürücü", "driver"],
    ["Driver (B kateqoriya)", "sürücü"],
    ["Baş mühasib", "accountant"],
    ["Chief Accountant", "mühasib"],
    ["Proqramçı", "developer"],
    ["Backend Developer", "backend proqramçı"],
    ["Satıcı-kassir", "cashier"],
    ["Hüquqşünas", "lawyer"],
    ["Legal counsel", "hüquqşünas"],
    ["Ofisiant", "waiter"],
    ["Mühafizəçi", "security guard"],
    ["Xadimə", "cleaner"],
    ["Anbardar", "storekeeper"],
    ["Tibb bacısı", "nurse"],
    ["Kuryer", "courier"],
  ];

  it.each(pairs)("matches %s with %s", (title, field) => {
    expect(matches(title, field)).toBe(true);
  });
});

describe("subject discrimination", () => {
  it("does not return a physics teacher for a music teacher search", () => {
    expect(matches("Fizika müəllimi", "music teacher")).toBe(false);
    expect(matches("Physics teacher", "musiqi müəllimi")).toBe(false);
  });

  it("keeps every school subject apart", () => {
    const subjects = [
      "Riyaziyyat müəllimi",
      "Kimya müəllimi",
      "Biologiya müəllimi",
      "Tarix müəllimi",
      "Coğrafiya müəllimi",
      "İngilis dili müəllimi",
      "Rus dili müəllimi",
      "Şahmat müəllimi",
      "Rəsm müəllimi",
    ];

    for (const title of subjects) {
      expect(matches(title, "music teacher")).toBe(false);
      expect(matches(title, "musiqi müəllimi")).toBe(false);
    }
  });

  it("still returns every teacher when no subject is given", () => {
    expect(matches("Fizika müəllimi", "müəllim")).toBe(true);
    expect(matches("Musiqi müəllimi", "teacher")).toBe(true);
    expect(matches("Primary school teacher", "müəllim")).toBe(true);
  });

  it("matches a multi-subject title when one subject is searched", () => {
    expect(matches("Riyaziyyat və fizika müəllimi", "fizika müəllimi")).toBe(true);
    expect(matches("Riyaziyyat və fizika müəllimi", "music teacher")).toBe(false);
  });

  it("matches instrument-level specialisations under music", () => {
    expect(matches("Piano müəllimi", "music teacher")).toBe(true);
    expect(matches("Musiqi müəllimi", "piano müəllimi")).toBe(false);
  });

  it("does not confuse language teachers", () => {
    expect(matches("Rus dili müəllimi", "english teacher")).toBe(false);
    expect(matches("Alman dili müəllimi", "ingilis dili müəllimi")).toBe(false);
  });
});

describe("technology discrimination", () => {
  it("keeps backend and frontend apart", () => {
    expect(matches("Frontend Developer", "backend developer")).toBe(false);
    expect(matches("Backend Developer", "frontend developer")).toBe(false);
  });

  it("treats a stack as a specialisation of its layer", () => {
    expect(matches("Java Developer", "backend developer")).toBe(true);
    expect(matches("React Developer", "frontend developer")).toBe(true);
    expect(matches("Flutter Developer", "mobile developer")).toBe(true);
    expect(matches("Backend Developer", "java developer")).toBe(false);
  });

  it("matches any developer for a plain developer search", () => {
    expect(matches("Senior Backend Developer (Node.js)", "developer")).toBe(true);
    expect(matches("Проqrammist", "developer")).toBe(false);
    expect(matches("Программист", "developer")).toBe(true);
  });

  it("does not match unrelated jobs", () => {
    expect(matches("Aşpaz", "backend developer")).toBe(false);
    expect(matches("Sürücü", "designer")).toBe(false);
    expect(matches("Anbardar", "hüquqşünas")).toBe(false);
    expect(matches("Satış meneceri", "music teacher")).toBe(false);
  });
});

describe("noisy titles", () => {
  const noisy: [string, string][] = [
    ["Senior Music Teacher (full-time, Baku)", "music teacher"],
    ["Musiqi müəllimi tələb olunur", "musiqi müəllimi"],
    ["MUSİQİ MÜƏLLİMİ / MUSIC TEACHER", "music teacher"],
    ["Vakansiya: Musiqi müəllimi - təcili", "music teacher"],
    ["Bakı şəhəri üzrə sürücü (tam iş günü)", "sürücü"],
    ["Satış üzrə mütəxəssis", "satış"],
    ["Müştəri xidmətləri üzrə mütəxəssis", "customer support"],
    ["Call center operatoru", "call center"],
    ["Baş mühasib (1C)", "mühasib"],
  ];

  it.each(noisy)("looks past the noise in %s", (title, field) => {
    expect(matches(title, field)).toBe(true);
  });

  it("ignores seniority and contract words in the search text", () => {
    expect(matches("Backend Developer", "senior backend developer")).toBe(true);
    expect(matches("Musiqi müəllimi", "musiqi müəllimi vakansiyası tam iş günü")).toBe(true);
  });
});

describe("azerbaijani suffixes", () => {
  const inflected: [string, string][] = [
    ["Müəllimə ehtiyac var", "müəllim"],
    ["Sürücülər tələb olunur", "sürücü"],
    ["Mühasibə tələbat", "mühasib"],
    ["Satış meneceri", "satış meneceri"],
    ["Satış menecerləri", "satış meneceri"],
  ];

  it.each(inflected)("handles %s", (title, field) => {
    expect(matches(title, field)).toBe(true);
  });
});

describe("multiple saved fields", () => {
  const fields = ["music teacher", "backend developer"];

  it("matches a vacancy that fits any field", () => {
    expect(matchesAnyField({ title: "Musiqi müəllimi" }, fields)).toBe(true);
    expect(matchesAnyField({ title: "Java Developer" }, fields)).toBe(true);
  });

  it("rejects a vacancy that fits none", () => {
    expect(matchesAnyField({ title: "Fizika müəllimi" }, fields)).toBe(false);
    expect(matchesAnyField({ title: "Ofisiant" }, fields)).toBe(false);
  });

  it("returns no match for an empty field list", () => {
    expect(matchesAnyField({ title: "Musiqi müəllimi" }, [])).toBe(false);
  });
});

describe("scoring", () => {
  it("ranks the tightest title first", () => {
    const exact = matchField({ title: "Musiqi müəllimi" }, "musiqi müəllimi").score;
    const looser = matchField({ title: "Musiqi və rəqs müəllimi, Bakı filialı" }, "musiqi müəllimi").score;

    expect(exact).toBeGreaterThan(looser);
  });

  it("reports the best score across fields", () => {
    const result = matchFields({ title: "Backend Developer" }, ["developer", "backend developer"]);

    expect(result.matched).toBe(true);
    expect(result.score).toBeGreaterThan(0);
  });
});

describe("empty input", () => {
  it("never matches an empty title", () => {
    expect(matches("", "music teacher")).toBe(false);
  });

  it("never matches an empty field", () => {
    expect(matches("Musiqi müəllimi", "   ")).toBe(false);
  });
});
