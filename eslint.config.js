import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/out/**",
      "**/node_modules/**",
      "**/.vite/**",
      "apps/desktop/src/preload/preload.cjs"
    ]
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "no-undef": "off"
    }
  }
);
