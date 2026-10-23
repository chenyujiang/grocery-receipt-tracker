import { existsSync, globSync, readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import js from "@eslint/js";
import tseslint from "typescript-eslint";

const root = dirname(fileURLToPath(import.meta.url));

// Every file Vercel loads at runtime: the serverless functions in api/, plus
// every file they import, transitively — which reaches into src/. These run
// under Node's own ESM loader (package.json is "type": "module"), not Vite,
// so their imports have to resolve there. Computed rather than listed, so a
// new import from api/ is covered the moment it's written. See CLAUDE.md
// "Code /api loads at runtime".
function filesVercelLoads() {
  const runtimeImport = /^\s*(?:import|export)\s+(?!type\b)[^;]*?from\s+"([^"]+)"/gm;
  const pending = globSync("api/**/*.ts", { cwd: root })
    .filter((file) => !file.endsWith(".test.ts"))
    .map((file) => resolve(root, file));
  const seen = new Set(pending);
  while (pending.length > 0) {
    const file = pending.pop();
    for (const [, specifier] of readFileSync(file, "utf8").matchAll(runtimeImport)) {
      if (!specifier.startsWith(".")) continue;
      // An import missing its ".js" is the very mistake the rule below
      // reports, so follow it anyway rather than losing its subtree.
      const base = resolve(dirname(file), specifier).replace(/\.js$/, "");
      const target = [`${base}.ts`, `${base}/index.ts`].find((path) => existsSync(path));
      if (!target || seen.has(target)) continue;
      seen.add(target);
      pending.push(target);
    }
  }
  return [...seen].map((file) => relative(root, file).replaceAll("\\", "/"));
}

// spec Section 7: fixed UI chrome follows the language toggle, so anything
// the user reads goes through t() rather than a literal. Only text with a
// word in it counts: the separators between values (· — × $ %) read the
// same in both languages.
const words = "/[A-Za-z\u4e00-\u9fff]/";
const untranslatedText = [
  `JSXText[value=${words}]`,
  `:matches(JSXElement, JSXFragment) > JSXExpressionContainer > Literal[value=${words}]`,
  "JSXAttribute[name.name=/^(aria-label|title|placeholder|alt)$/] > Literal",
];

export default tseslint.config(
  { ignores: ["dist", "node_modules", "supabase", "**/*.tsbuildinfo"] },
  {
    files: ["**/*.{ts,tsx}"],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    rules: {
      // tsc already checks these, with the project's own settings.
      "no-undef": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  {
    files: ["src/**/*.{ts,tsx}", "api/**/*.ts"],
    ignores: ["**/*.test.{ts,tsx}", "src/test/**"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          // CLAUDE.md "Error handling": a PostgrestError isn't an Error.
          selector: "BinaryExpression[operator='instanceof'][right.name='Error']",
          message: "A PostgrestError isn't an Error: use errorMessage(err, t(\"errors.…\")) instead.",
        },
        {
          selector: "CallExpression[callee.name='errorMessage'] > :matches(Literal, TemplateLiteral).arguments:nth-child(2)",
          message: "Pass errorMessage's fallback as t(\"errors.…\"), so it follows the language toggle.",
        },
        ...untranslatedText.map((selector) => ({
          selector,
          message: "User-visible text goes through t() (src/lib/i18n.ts).",
        })),
      ],
    },
  },
  {
    files: filesVercelLoads(),
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/*"],
              allowTypeImports: true,
              message: "Vercel loads this file under Node, where \"@/\" doesn't resolve: import it relatively (\"./x.js\").",
            },
            {
              regex: "^\\.\\.?/(?!.*\\.js$)",
              allowTypeImports: true,
              message: "Vercel loads this file under Node's ESM loader, which needs the exact file: end the import in \".js\" (\"./x.js\", \"./dir/index.js\").",
            },
          ],
        },
      ],
    },
  }
);
