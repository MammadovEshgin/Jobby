import { normalize } from "./normalize";

const RAW_SYNONYMS: Record<string, string[]> = {
  "software developer": [
    "backend",
    "backend developer",
    "backend engineer",
    "frontend",
    "frontend developer",
    "front end developer",
    "fullstack",
    "full stack",
    "developer",
    "software engineer",
    "programmer",
    "proqramci",
    "proqram teminati",
    "node js",
    "nodejs",
    "javascript developer",
    "typescript developer",
    "php developer",
    "java developer",
    "python developer",
    "dotnet developer",
    ".net developer",
    "api developer",
    "server side",
    "golang developer",
    "go developer",
  ],
  "mobile developer": [
    "android",
    "android developer",
    "ios",
    "ios developer",
    "flutter",
    "react native",
    "mobile engineer",
    "mobil developer",
    "mobil tertibatci",
  ],
  "data scientist": [
    "data analyst",
    "data analytics",
    "business intelligence",
    "bi analyst",
    "ml engineer",
    "machine learning",
    "ai engineer",
    "data engineer",
    "sql analyst",
    "analitik",
    "data governance",
  ],
  "product manager": [
    "project manager",
    "program manager",
    "product owner",
    "layihe meneceri",
    "mehsul meneceri",
    "texniki layihe meneceri",
    "scrum master",
    "agile",
  ],
  "designer": [
    "ui ux",
    "ui designer",
    "ux designer",
    "product designer",
    "graphic designer",
    "qrafik dizayner",
    "web dizayner",
    "motion designer",
  ],
  "marketing": [
    "smm",
    "social media",
    "digital marketing",
    "marketinq",
    "kontent menecer",
    "content manager",
    "seo",
    "reklam",
    "brand manager",
    "pr",
  ],
  "sales": [
    "satis",
    "sales",
    "sales manager",
    "satis meneceri",
    "satis mutexessisi",
    "satis meslehetcisi",
    "musteri meneceri",
    "account manager",
    "business development",
    "biznes inkisaf",
  ],
  "finance": [
    "muhasib",
    "accountant",
    "maliyye",
    "finance",
    "auditor",
    "audit",
    "kredit mutexessisi",
    "financial analyst",
    "1c",
    "vergi",
  ],
  "hr": [
    "human resources",
    "insan resurslari",
    "recruiter",
    "recruitment",
    "talent acquisition",
    "ise qebul",
    "hr mutexessisi",
    "hr generalist",
  ],
  "legal": ["huquqsunas", "vekil", "jurist", "lawyer", "compliance", "komplayens", "legal counsel"],
  "teacher": [
    "muellim",
    "teacher",
    "repetitor",
    "tedris",
    "trainer",
    "telimci",
    "instructor",
    "tutor",
    "education",
  ],
  "customer support": [
    "call center",
    "contact center",
    "cagri merkezi",
    "operator",
    "support",
    "customer service",
    "musteri xidmeti",
    "musteri destek",
  ],
  "logistics": ["logistika", "logistics", "supply chain", "satinalma", "procurement", "anbar", "warehouse"],
  "driver": ["surucu", "driver", "kuryer", "courier", "catdirilma"],
  "medical": ["hekim", "doctor", "tibb bacisi", "nurse", "eczaci", "pharmacist", "tibb"],
  "engineering": ["muhendis", "engineer", "texnik", "technical", "site engineer", "energetik", "memar", "architect"],
};

export const synonyms: Record<string, string[]> = buildSynonymIndex();

export function getSynonyms(field: string): string[] {
  return synonyms[normalize(field)] ?? [];
}

function buildSynonymIndex(): Record<string, string[]> {
  const index: Record<string, string[]> = {};

  for (const [field, values] of Object.entries(RAW_SYNONYMS)) {
    const terms = unique([field, ...values].map((value) => normalize(value)).filter((value) => value.length > 0));

    for (const term of terms) {
      index[term] = unique([...(index[term] ?? []), ...terms.filter((value) => value !== term)]);
    }
  }

  return index;
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}
