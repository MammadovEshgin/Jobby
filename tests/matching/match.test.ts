import { describe, expect, it } from "vitest";

import { CONCEPTS } from "../../src/matching/lexicon";
import { compile, compileAll, matchCompiled, matchTitle } from "../../src/matching/match";

function matches(title: string, field: string): boolean {
  return matchTitle(title, field).matched;
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

  it("ignores stray single letters and bare numbers in the search text", () => {
    expect(matches("Sürücü", "sürücü b")).toBe(true);
    expect(matches("Mühasib", "mühasib 2")).toBe(true);
  });
});

describe("azerbaijani suffixes", () => {
  const inflected: [string, string][] = [
    ["Müəllimə ehtiyac var", "müəllim"],
    ["Sürücülər tələb olunur", "sürücü"],
    ["Mühasibə tələbat", "mühasib"],
    ["Satış meneceri", "satış meneceri"],
    ["Satış menecerləri", "satış meneceri"],
    ["Məktəb müəllimlərinə ehtiyac var", "müəllim"],
  ];

  it.each(inflected)("handles %s", (title, field) => {
    expect(matches(title, field)).toBe(true);
  });
});

describe("multiple saved fields", () => {
  const fields = ["music teacher", "backend developer"];

  it("matches a vacancy that fits any field", () => {
    expect(matchTitle("Musiqi müəllimi", fields).matched).toBe(true);
    expect(matchTitle("Java Developer", fields).matched).toBe(true);
  });

  it("rejects a vacancy that fits none", () => {
    expect(matchTitle("Fizika müəllimi", fields).matched).toBe(false);
    expect(matchTitle("Ofisiant", fields).matched).toBe(false);
  });

  it("returns no match for an empty field list", () => {
    expect(matchTitle("Musiqi müəllimi", []).matched).toBe(false);
  });
});

describe("scoring", () => {
  it("ranks the tightest title first", () => {
    const exact = matchTitle("Musiqi müəllimi", "musiqi müəllimi").score;
    const looser = matchTitle("Musiqi və rəqs müəllimi, Bakı filialı", "musiqi müəllimi").score;

    expect(exact).toBeGreaterThan(looser);
  });

  it("ranks a title that adds fewer ideas above a busier one", () => {
    const plain = matchTitle("Musiqi müəllimi tələb olunur", "music teacher").score;
    const busier = matchTitle("Musiqi və rəqs müəllimi", "music teacher").score;

    expect(plain).toBeGreaterThan(busier);
  });

  it("reports the best score across fields", () => {
    const result = matchTitle("Backend Developer", ["developer", "backend developer"]);

    expect(result.matched).toBe(true);
    expect(result.score).toBeGreaterThan(0);
  });
});

describe("crowded titles", () => {
  // Aggregated "hiring for everything" posts are common on the local boards.
  const listing =
    "Satıcı, kassir, sürücü, aşpaz, ofisiant, mühafizəçi, xadimə, anbardar, kuryer, mühasib, " +
    "hüquqşünas, həkim, tibb bacısı, bərbər, dərzi, operator, menecer, dizayner, proqramçı, " +
    "rəssam, fotoqraf, tərcüməçi, musiqi müəllimi tələb olunur";

  it("still matches when the title stacks more extra ideas than the score can absorb", () => {
    expect(matches(listing, "music teacher")).toBe(true);
  });

  it("ranks a crowded title below a tight one instead of dropping it", () => {
    const tight = matchTitle("Musiqi müəllimi", "music teacher");
    const crowded = matchTitle(listing, "music teacher");

    expect(crowded.matched).toBe(true);
    expect(tight.score).toBeGreaterThan(crowded.score);
  });

  it("keeps rejecting a crowded title that is missing an idea", () => {
    expect(matches(listing, "fizika müəllimi")).toBe(false);
  });
});

describe("decomposed characters", () => {
  it("matches a title whose letters arrive decomposed", () => {
    expect(matches("Musiqi müəllimi".normalize("NFD"), "music teacher")).toBe(true);
  });

  it("matches a saved field whose letters arrive decomposed", () => {
    expect(matches("Music Teacher", "musiqi müəllimi".normalize("NFD"))).toBe(true);
  });
});

describe("compiled matching", () => {
  it("matches a title compiled once against fields compiled once", () => {
    const title = compile("Musiqi müəllimi");

    expect(matchCompiled(title, compileAll(["backend developer", "music teacher"])).matched).toBe(
      true,
    );
    expect(matchCompiled(title, compileAll(["backend developer"])).matched).toBe(false);
  });

  it("reports the score of the tightest matching field", () => {
    const title = compile("Backend Developer");
    const loose = matchCompiled(title, compileAll(["developer"]));
    const tight = matchCompiled(title, compileAll(["developer", "backend developer"]));

    expect(tight.score).toBeGreaterThan(loose.score);
  });
});

describe("searches the lexicon does not know", () => {
  it("requires an unknown search word to appear in the title", () => {
    expect(matches("Zumba təlimçisi", "zumba müəllim")).toBe(true);
    expect(matches("Şahmat müəllimi", "zumba müəllim")).toBe(false);
  });

  it("falls back to literal words when the search carries no concept at all", () => {
    expect(matches("Satış üzrə mütəxəssis", "mütəxəssis")).toBe(true);
    expect(matches("Sürücü", "mütəxəssis")).toBe(false);
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

describe("symbol-bearing technology names", () => {
  // normalize() used to strip the "#", leaving the bare letter "c" as a term of the dotnet
  // concept, so every title carrying a stray C matched a user following C# or .NET.
  it.each([
    ["Sürücü (B, C kateqoriyalı)", "C#"],
    ["Hepatit C üzrə həkim", "C#"],
    ["C vitamini üzrə satış təmsilçisi", "C#"],
    ["Sürücü (B, C kateqoriyalı)", "dotnet"],
    ["Sürücü (B, C kateqoriyalı)", ".NET"],
  ])("does not offer %j to someone following %j", (title, field) => {
    expect(matchTitle(title, field).matched).toBe(false);
  });

  it.each([
    ["Backend developer (C#, .NET)", "C#"],
    [".NET Developer", "C#"],
    ["C# proqramçı", "dotnet"],
    ["ASP.NET developer", "dotnet"],
  ])("still offers %j to someone following %j", (title, field) => {
    expect(matchTitle(title, field).matched).toBe(true);
  });

  it("keeps C++ apart from C#", () => {
    expect(matchTitle("C++ developer", "C#").matched).toBe(false);
    expect(matchTitle("C# developer", "C++").matched).toBe(false);
  });
});

describe("technology terms never reach an unrelated vacancy", () => {
  // Offering a driver job to someone following C# costs the bot the user's trust, so the whole
  // technology vocabulary is swept rather than the one term that was found broken.
  const NON_TECH = [
    "Sürücü (B, C kateqoriyalı)",
    "Hepatit C üzrə həkim",
    "C vitamini üzrə satış təmsilçisi",
    "Musiqi müəllimi",
    "Aşpaz köməkçisi",
    "Mühafizəçi",
    "Satıcı-kassir",
    "Anbardar",
    "Bərbər",
    "Xadimə",
    "Tikişçi",
    "Fəhlə",
    "Ofisiant",
    "Bağban",
    "Kuryer (piyada)",
    "Stomatoloq",
    "Hüquqşünas",
    "Mühasib köməkçisi",
    "Fizika müəllimi",
    "Gözəllik salonuna usta",
  ];

  const techTerms = CONCEPTS.filter((concept) => concept.kind === "tech").flatMap((concept) =>
    concept.terms.map((term) => [concept.id, term] as const),
  );

  it.each(NON_TECH)("offers no technology vacancy to %j", (title) => {
    const offered = techTerms.filter(([, term]) => matchTitle(title, term).matched);

    expect(offered).toEqual([]);
  });
});
