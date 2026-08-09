export default [
  {
    ignores: [".next/**", "coverage/**", "node_modules/**", "audit.json"]
  },
  {
    files: ["**/*.{js,mjs}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } }
    },
    linterOptions: { reportUnusedDisableDirectives: "error" },
    rules: {
      "constructor-super": "error",
      "for-direction": "error",
      "getter-return": "error",
      "no-async-promise-executor": "error",
      "no-class-assign": "error",
      "no-compare-neg-zero": "error",
      "no-const-assign": "error",
      "no-constant-binary-expression": "error",
      "no-debugger": "error",
      "no-dupe-args": "error",
      "no-dupe-class-members": "error",
      "no-dupe-else-if": "error",
      "no-dupe-keys": "error",
      "no-duplicate-case": "error",
      "no-empty-character-class": "error",
      "no-ex-assign": "error",
      "no-fallthrough": "error",
      "no-func-assign": "error",
      "no-import-assign": "error",
      "no-loss-of-precision": "error",
      "no-new-native-nonconstructor": "error",
      "no-obj-calls": "error",
      "no-self-assign": "error",
      "no-setter-return": "error",
      "no-shadow-restricted-names": "error",
      "no-sparse-arrays": "error",
      "no-this-before-super": "error",
      "no-undef": "error",
      "no-unexpected-multiline": "error",
      "no-unreachable": "error",
      "no-unreachable-loop": "error",
      "no-unsafe-finally": "error",
      "no-unsafe-negation": "error",
      "no-unsafe-optional-chaining": "error",
      "no-unused-labels": "error",
      "no-useless-backreference": "error",
      "no-useless-catch": "error",
      "no-useless-escape": "error",
      "no-with": "error",
      "require-yield": "error",
      "use-isnan": "error",
      "valid-typeof": "error"
    }
  },
  {
    files: ["pages/**/*.{js,mjs}"],
    languageOptions: {
      globals: {
        document: "readonly",
        window: "readonly"
      }
    }
  },
  {
    files: ["**/*.{js,mjs}"],
    languageOptions: {
      globals: {
        AbortController: "readonly", Buffer: "readonly", Response: "readonly", btoa: "readonly",
        TextEncoder: "readonly", URL: "readonly", URLSearchParams: "readonly",
        clearTimeout: "readonly", console: "readonly", crypto: "readonly",
        fetch: "readonly", global: "readonly", process: "readonly", setTimeout: "readonly"
      }
    }
  }
]
