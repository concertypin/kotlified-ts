import { describe, expect, it } from "vitest";
import { shouldTransformId } from "../src/index.js";

describe("shouldTransformId", () => {
    it("transforms ts/js family files", () => {
        expect(shouldTransformId("/src/main.ts")).toBe(true);
        expect(shouldTransformId("/src/main.tsx")).toBe(true);
        expect(shouldTransformId("/src/main.js")).toBe(true);
        expect(shouldTransformId("/src/main.jsx")).toBe(true);
        expect(shouldTransformId("/src/main.mts")).toBe(true);
        expect(shouldTransformId("/src/main.cts")).toBe(true);
        expect(shouldTransformId("/src/main.mjs")).toBe(true);
        expect(shouldTransformId("/src/main.cjs")).toBe(true);
    });

    it("skips non-transformable files", () => {
        expect(shouldTransformId("/src/style.css")).toBe(false);
        expect(shouldTransformId("/src/main.vue")).toBe(false);
        expect(shouldTransformId("/src/types.d.ts")).toBe(false);
        expect(shouldTransformId("/node_modules/foo/index.js")).toBe(false);
        expect(shouldTransformId("/src/data.json")).toBe(false);
    });

    it("transforms SFC script blocks", () => {
        expect(
            shouldTransformId("/src/App.vue?vue&type=script&setup=true&lang.ts")
        ).toBe(true);
        expect(
            shouldTransformId("/src/App.svelte?svelte&type=script&lang=ts")
        ).toBe(true);
    });

    it("skips raw/url/worker module queries", () => {
        expect(shouldTransformId("/src/data.ts?raw")).toBe(false);
        expect(shouldTransformId("/src/worker.ts?worker")).toBe(false);
        expect(shouldTransformId("/src/logo.svg?url")).toBe(false);
    });

    it("honors include/exclude filters", () => {
        const opts = { include: /\/src\//, exclude: /\.spec\.ts$/ };
        expect(shouldTransformId("/src/main.ts", opts)).toBe(true);
        expect(shouldTransformId("/lib/main.ts", opts)).toBe(false);
        expect(shouldTransformId("/src/main.spec.ts", opts)).toBe(false);
    });
});
