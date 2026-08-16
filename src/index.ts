import type { Plugin } from "vite";
import { transformCode } from "./transform.ts";

/**
 * kotlified-ts
 *
 * Compile-time Kotlin extension functions for Vite projects.
 * `.let()`, `.apply()`, `.run()`, `.also()`, `.takeIf()` and `.takeUnless()`
 * calls are rewritten to direct runtime helper calls — no prototype pollution.
 */
export interface KotlifyOptions {
    /** Extra include filter applied to the full module id (default: all transformable files). */
    include?: RegExp;
    /** Exclude filter applied to the full module id. */
    exclude?: RegExp;
    /** Import specifier for the injected runtime import. Defaults to `kotlified-ts/runtime`. */
    runtimeId?: string;
    /**
     * Warn when a rewritten call could shadow a real member declared in the
     * same file (e.g. `class A { let(fn) {} }` + `x.let(fn)`). Default: true.
     * Set to false to silence (computed access `obj['let'](fn)` is the
     * per-call escape hatch that skips rewriting entirely).
     */
    shadowWarn?: boolean;
}

const FILE_RE = /\.(?:[cm]?[jt]sx?)$/;
const RAW_QUERY_RE = /(?:^|&)(?:raw|url|worker|inline)(?:&|$)/;

/** Normalizes a module id so the parser picks the right syntax mode. */
function parserFilename(id: string): string {
    const [path = "", query] = id.split("?");
    if (query?.includes("type=script")) {
        const lang = /(?:^|&)lang=([^&]+)/.exec(query)?.[1];
        if (lang === "tsx") return `${path}.tsx`;
        if (lang === "ts") return `${path}.ts`;
        if (lang === "jsx") return `${path}.jsx`;
        return `${path}.js`;
    }
    return path;
}

export function shouldTransformId(
    id: string,
    options: Pick<KotlifyOptions, "include" | "exclude"> = {}
): boolean {
    if (id.includes("/node_modules/")) return false;
    if (/\.d\.[cm]?ts$/.test(id)) return false;
    const [path = "", query] = id.split("?");
    if (query && RAW_QUERY_RE.test(query)) return false;
    const isFile = FILE_RE.test(path);
    const isScriptBlock = Boolean(query?.includes("type=script"));
    if (!isFile && !isScriptBlock) return false;
    if (options.include && !options.include.test(id)) return false;
    if (options.exclude && options.exclude.test(id)) return false;
    return true;
}

export default function kotlify(options: KotlifyOptions = {}): Plugin {
    // Dedupe shadow warnings so dev-server rebuilds don't spam the console.
    const warned = new Set<string>();
    // vite의 Plugin.apply와 전역 Object.apply 오거멘테이션(코틀린 헬퍼)이
    // 이름이 겹쳐 리터럴이 Plugin에 직접 할당되지 않는다. apply는 선택 필드라
    // undefined로 명시해두면 할당 검사를 통과한다 (실행 시 undefined = 전체 적용).
    const plugin: Plugin = {
        name: "kotlify",
        enforce: "pre",
        apply: undefined,
        transform(code: string, id: string) {
            if (!shouldTransformId(id, options)) return null;
            const result = transformCode(code, {
                filename: parserFilename(id),
                fileLabel: id,
                runtimeId: options.runtimeId,
                shadowWarn: options.shadowWarn,
            });
            if (!result) return null;
            for (const warning of result.warnings) {
                if (!warned.has(warning)) {
                    warned.add(warning);
                    console.warn(warning);
                }
            }
            return { code: result.code };
        },
    };
    return plugin;
}
