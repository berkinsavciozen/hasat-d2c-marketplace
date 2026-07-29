import js from "@eslint/js";
import eslintPluginPrettier from "eslint-plugin-prettier/recommended";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", ".output", ".vinxi"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "server-only",
              message:
                "TanStack Start does not use the Next.js `server-only` package. Rename the module to `*.server.ts` or mark it with `@tanstack/react-start/server-only`.",
            },
            {
              name: "@/integrations/supabase/types",
              message:
                "Bu Lovable'ın yeniden ürettiği bayat scaffold dosyasıdır (M1-b'de silindi, Lovable tekrar üretebilir). DB tipleri için `@/lib/core/db/types` kullan — kural #105/#106 (hasat-vault Build/Shared-Architecture.md).",
            },
          ],
        },
      ],
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
  {
    files: ["src/integrations/supabase/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["./types", "./types.js", "./types.ts"],
              message:
                "Bu Lovable'ın yeniden ürettiği bayat scaffold dosyasıdır (M1-b'de silindi, Lovable tekrar üretebilir). DB tipleri için `@/lib/core/db/types` kullan — kural #105/#106 (hasat-vault Build/Shared-Architecture.md).",
            },
          ],
        },
      ],
    },
  },
  eslintPluginPrettier,
);
