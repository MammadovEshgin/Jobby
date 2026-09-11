import js from "@eslint/js";
import tseslint from "typescript-eslint";
import security from "eslint-plugin-security";
import globals from "globals";
import cleanCode from "./eslint.clean-code.mjs";

export default tseslint.config(
  {
    ignores: ["node_modules/**", "dist/**", ".wrangler/**", "tests/fixtures/**"],
  },

  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,

  // The clean-code budget: complexity, depth, params, dead code, debug statements.
  ...cleanCode,

  {
    languageOptions: {
      parserOptions: {
        // scripts/ has its own tsconfig; the default project covers the flat-config files,
        // which belong to no tsconfig at all.
        projectService: {
          allowDefaultProject: ["eslint.config.mjs", "eslint.clean-code.mjs"],
        },
        tsconfigRootDir: import.meta.dirname,
      },
      globals: { ...globals.node },
    },
  },

  // The bot parses untrusted scraped HTML and serves a public webhook, so these stay on.
  security.configs.recommended,

  {
    files: ["**/*.ts"],
    rules: {
      // The base rule misreads TypeScript; the typed one replaces it.
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          args: "after-used",
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrors: "all",
        },
      ],
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/ban-ts-comment": [
        "error",
        { "ts-expect-error": "allow-with-description", "ts-ignore": true },
      ],
      "@typescript-eslint/no-unnecessary-type-assertion": "error",
      "@typescript-eslint/no-unsafe-argument": "error",
      "@typescript-eslint/no-unsafe-assignment": "error",
      "@typescript-eslint/no-unsafe-call": "error",
      "@typescript-eslint/no-unsafe-member-access": "error",
      "@typescript-eslint/no-unsafe-return": "error",
    },
  },

  // The lexicon is a vocabulary table with no functions in it. max-lines exists to stop logic
  // modules sprawling; splitting a word list across files would buy nothing.
  {
    files: ["src/matching/lexicon.ts"],
    rules: { "max-lines": "off" },
  },

  // The logging module is the one place console is the output, not a leftover debug statement.
  {
    files: ["src/utils/log.ts"],
    rules: { "no-console": "off" },
  },

  {
    files: ["tests/**/*.ts"],
    rules: {
      "no-console": "off",
      // vitest's expect.any() and the hand-written D1/fetch doubles are typed `any` by the
      // library, and the doubles satisfy async interfaces without awaiting. Neither says
      // anything about the source under test.
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/require-await": "off",
      "@typescript-eslint/no-base-to-string": "off",
      "security/detect-non-literal-fs-filename": "off",
    },
  },

  {
    files: ["scripts/**/*.ts"],
    rules: {
      "no-console": "off",
      "security/detect-non-literal-fs-filename": "off",
    },
  },

  // Flat-config files are ESM JavaScript; the typed rules have nothing to say about them.
  {
    files: ["**/*.mjs"],
    ...tseslint.configs.disableTypeChecked,
  },
);
