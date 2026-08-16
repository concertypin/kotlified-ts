import { defineConfig } from "oxlint";
import oxlintConfig from "@concertypin/config/oxlint";

export default defineConfig({
    $schema: "./node_modules/oxlint/configuration_schema.json",
    plugins: ["typescript", "unicorn", "import", "promise"],
    env: {
        builtin: true,
    },
    ignorePatterns: [
        "**/node_modules/**",
        "**/dist/**",
        "**/dist-ts/**",
        "**/coverage/**",
        "**/.cache/**",
        "**/.vscode/**",
        "**/.git/**",
    ],
    options: {
        denyWarnings: true,
        reportUnusedDisableDirectives: "error",
        typeAware: true,
        typeCheck: true,
    },
    extends: [oxlintConfig],
    rules: {
        // == null은 null/undefined 동시 체크 의도 (Kotlin null-safe 시맨틱)
        eqeqeq: ["error", "smart"],
    },
    overrides: [
        {
            files: ["src/transform.ts"],
            rules: {
                // Babel AST 워커라 동적 노드 접근이 의도적
                "no-explicit-any": "off",
                "no-unsafe-assignment": "off",
                "no-unsafe-member-access": "off",
                "no-unsafe-argument": "off",
            },
        },
        {
            files: ["test/**/*.ts"],
            rules: {
                // node:test의 describe/it은 Promise를 반환해서 평범한 호출이 전부 floating으로 잡힌다
                "no-floating-promises": "off",
            },
        },
    ],
});
