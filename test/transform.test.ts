import { describe, expect, it } from "vitest";
import { transformCode } from "../src/transform.js";

function transform(code: string, filename = "sample.ts", runtimeId?: string) {
    return transformCode(code, { filename, runtimeId });
}

describe("transformCode", () => {
    it("rewrites .let() in a module and injects a named import", () => {
        const result = transform("export const x = a.let(v => v + 1);");
        expect(result?.code).toBe(
            'import { letExt as __kt$let } from "kotlified-ts/runtime";\n' +
                "export const x = __kt$let(a, v => v + 1);"
        );
        expect(result?.helpers).toEqual(["__kt$let"]);
    });

    it("inlines the runtime for non-module scripts", () => {
        const result = transform("const x = a.let(v => v + 1);");
        expect(result?.code).toBe(
            "const __kt$let = (v, b) => b(v);\n" +
                "const x = __kt$let(a, v => v + 1);"
        );
    });

    it("supports all six extension functions", () => {
        const code = [
            "a.let(f);",
            "b.apply(g);",
            "c.run(h);",
            "d.also(i);",
            "e.takeIf(j);",
            "f.takeUnless(k);",
        ].join("\n");
        const result = transform(code);
        expect(result?.code).toContain("__kt$let(a, f);");
        expect(result?.code).toContain("__kt$apply(b, g);");
        expect(result?.code).toContain("__kt$run(c, h);");
        expect(result?.code).toContain("__kt$also(d, i);");
        expect(result?.code).toContain("__kt$takeIf(e, j);");
        expect(result?.code).toContain("__kt$takeUnless(f, k);");
    });

    it("leaves the native 2-argument Function.prototype.apply untouched", () => {
        expect(transform("fn.apply(null, [1, 2]);")).toBeNull();
        expect(transform("Array.prototype.push.apply(arr, items);")).toBeNull();
        expect(transform("fn.apply(thisArg, args);")).toBeNull();
    });

    it("rewrites a 1-argument .apply() as Kotlin apply", () => {
        expect(transform("fn.apply(block);")?.code).toContain(
            "__kt$apply(fn, block);"
        );
    });

    it("skips calls without exactly one argument", () => {
        expect(transform("a.let();")).toBeNull();
        expect(transform("a.let(x, y);")).toBeNull();
    });

    it("skips computed member access", () => {
        expect(transform("obj['let'](f);")).toBeNull();
    });

    it("rewrites value?.let() with the null-safe helper", () => {
        const result = transform("const y = b?.let(w => w);");
        expect(result?.code).toContain("const y = __kt$letOrNull(b, w => w);");
    });

    it("rewrites value.let?.() with the null-safe helper", () => {
        const result = transform("const y = b.let?.(w => w);");
        expect(result?.code).toContain("const y = __kt$letOrNull(b, w => w);");
    });

    it("uses the plain helper when only the receiver chain is optional", () => {
        const result = transform("const y = a?.b.let(c);");
        expect(result?.code).toContain("const y = __kt$let(a?.b, c);");
        expect(result?.code).not.toContain("OrNull");
    });

    it("strips non-null assertions on the receiver", () => {
        expect(transform("const z = c!.run(f);")?.code).toContain(
            "const z = __kt$run(c!, f);"
        );
    });

    it("rewrites chained calls", () => {
        const result = transform("a.let(f).also(g);");
        expect(result?.code).toContain("__kt$also(__kt$let(a, f), g);");
    });

    it("rewrites nested calls inside blocks", () => {
        const result = transform("a.let(x => { b.also(f); return x; });");
        expect(result?.code).toContain("__kt$let(a, x => {");
        expect(result?.code).toContain("__kt$also(b, f);");
    });

    it("rewrites calls inside async/await receivers", () => {
        const result = transform(
            "async function g() { return (await fetch(u)).let(r => r.status); }"
        );
        expect(result?.code).toContain(
            "return __kt$let(await fetch(u), r => r.status);"
        );
    });

    it("preserves TypeScript annotations", () => {
        const result = transform("const n: number = a.let(v => v + 1);");
        expect(result?.code).toContain(
            "const n: number = __kt$let(a, v => v + 1);"
        );
    });

    it("preserves comments inside the rewritten call", () => {
        const result = transform("a.let(/* hi */ f);");
        expect(result?.code).toContain("__kt$let(a, /* hi */f);");
    });

    it("combines helper imports into a single statement", () => {
        const result = transform(
            "export const x = a.let(f);\nexport const y = b.run(g);"
        );
        expect(result?.code).toContain(
            'import { letExt as __kt$let, runExt as __kt$run } from "kotlified-ts/runtime";'
        );
    });

    it("honors a custom runtimeId", () => {
        const result = transform(
            "export const x = a.let(f);",
            "sample.ts",
            "../src/runtime.ts"
        );
        expect(result?.code).toContain('from "../src/runtime.ts"');
    });

    it("returns null for files without candidates (fast path)", () => {
        expect(transform("const x = a.map(f).filter(g);")).toBeNull();
        expect(transform("")).toBeNull();
    });

    it("returns null on parse failures instead of crashing", () => {
        expect(transform("const x = <T>a;", "broken.tsx")).toBeNull();
        expect(transform("const x = a.let(f); ???", "broken.ts")).toBeNull();
    });

    describe("shadow heuristic", () => {
        it("warns when a class method shadows a rewritten call", () => {
            const code =
                "class A {\n  let(fn: (n: number) => number) { return fn(1); }\n}\nconst x = a.let(v => v + 1);\nexport {};";
            const result = transform(code);
            expect(result?.code).toContain("__kt$let(a, v => v + 1)");
            expect(result?.warnings).toHaveLength(1);
            expect(result?.warnings[0]).toContain("let");
            expect(result?.warnings[0]).toContain("line(s) 4");
        });

        it("warns for interface method signatures and object literal methods", () => {
            const code =
                "interface I { also(fn: () => void): void }\nconst o = { run(fn: () => void) {} };\nconst x = a.also(f);\nconst y = b.run(g);\nexport {};";
            const result = transform(code);
            expect(result?.warnings).toHaveLength(1);
            expect(result?.warnings[0]).toContain("also, run");
        });

        it("warns for function-valued properties", () => {
            const code =
                "const o = { takeIf: (p: boolean) => p };\nconst x = a.takeIf(p => p);\nexport {};";
            const result = transform(code);
            expect(result?.warnings).toHaveLength(1);
            expect(result?.warnings[0]).toContain("takeIf");
        });

        it("does not warn when no real member shadows the calls", () => {
            const code =
                "class A {\n  map(fn: (n: number) => number) { return fn(1); }\n}\nconst x = a.let(v => v + 1);\nexport {};";
            expect(transform(code)?.warnings).toHaveLength(0);
        });

        it("does not warn when the shadowed member is never called", () => {
            const code = "class A {\n  let(fn: () => void) {}\n}\nexport {};";
            expect(transform(code)).toBeNull();
        });

        it("can be silenced with shadowWarn: false", () => {
            const code =
                "class A {\n  let(fn: () => void) {}\n}\nconst x = a.let(v => v);\nexport {};";
            const result = transformCode(code, {
                filename: "sample.ts",
                shadowWarn: false,
            })!;
            expect(result.warnings).toHaveLength(0);
            expect(result.code).toContain("__kt$let(a, v => v)");
        });
    });
});
