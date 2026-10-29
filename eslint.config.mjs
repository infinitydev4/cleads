import { defineConfig } from "eslint/config";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

export default defineConfig([{
    extends: [...nextCoreWebVitals, ...nextTypescript],

    rules: {
        "react/no-unescaped-entities": "off",

        "@typescript-eslint/no-unused-vars": ["warn", {
            argsIgnorePattern: "^_",
            varsIgnorePattern: "^_",
            caughtErrorsIgnorePattern: "^_",
        }],

        "@typescript-eslint/no-empty-interface": "off",
        "@typescript-eslint/no-explicit-any": "warn",

        "prefer-const": ["warn", {
            destructuring: "all",
        }],

        "no-console": ["warn", {
            allow: ["warn", "error"],
        }],

        "@next/next/no-img-element": "off",
        "react/display-name": "off",
        "@typescript-eslint/no-implicit-any": "off",
        "react/no-unknown-property": "off",
        "@typescript-eslint/no-non-null-assertion": "off",
        "@typescript-eslint/no-empty-function": "off",
    },
}]);