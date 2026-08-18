import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["node_modules/", "out/", "dist/"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["course-engine/**/*.mjs", "scripts/**/*.mjs"],
    languageOptions: {
      globals: {
        Buffer: "readonly",
        console: "readonly",
        process: "readonly",
        setTimeout: "readonly",
      },
    },
    rules: { "@typescript-eslint/no-unused-vars": "off" },
  },
  {
    files: ["**/*.tsx"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "error",
    },
  },
  prettier,
);
