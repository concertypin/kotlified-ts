import type { Plugin } from 'vite';
import { transformCode } from './transform.js';

/**
 * vite-plugin-kotlin-ext
 *
 * Compile-time Kotlin extension functions for Vite projects.
 * `.let()`, `.apply()`, `.run()`, `.also()`, `.takeIf()` and `.takeUnless()`
 * calls are rewritten to direct runtime helper calls — no prototype pollution.
 */
export interface KotlinExtOptions {
  /** Extra include filter applied to the full module id (default: all transformable files). */
  include?: RegExp;
  /** Exclude filter applied to the full module id. */
  exclude?: RegExp;
  /** Import specifier for the injected runtime import. Defaults to `vite-plugin-kotlin-ext/runtime`. */
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
  const [path = '', query] = id.split('?');
  if (query?.includes('type=script')) {
    const lang = /(?:^|&)lang=([^&]+)/.exec(query)?.[1];
    if (lang === 'tsx') return `${path}.tsx`;
    if (lang === 'ts') return `${path}.ts`;
    if (lang === 'jsx') return `${path}.jsx`;
    return `${path}.js`;
  }
  return path;
}

export function shouldTransformId(id: string, options: Pick<KotlinExtOptions, 'include' | 'exclude'> = {}): boolean {
  if (id.includes('/node_modules/')) return false;
  if (/\.d\.[cm]?ts$/.test(id)) return false;
  const [path = '', query] = id.split('?');
  if (query && RAW_QUERY_RE.test(query)) return false;
  const isFile = FILE_RE.test(path);
  const isScriptBlock = Boolean(query?.includes('type=script'));
  if (!isFile && !isScriptBlock) return false;
  if (options.include && !options.include.test(id)) return false;
  if (options.exclude && options.exclude.test(id)) return false;
  return true;
}

export default function kotlinExt(options: KotlinExtOptions = {}): Plugin {
  // Dedupe shadow warnings so dev-server rebuilds don't spam the console.
  const warned = new Set<string>();
  // NOTE: the global `Object.apply` augmentation makes fresh object literals
  // look like they have an `apply` member, which conflicts with vite's
  // `Plugin.apply`. The double assertion sidesteps that assignability check.
  return {
    name: 'vite-plugin-kotlin-ext',
    enforce: 'pre',
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
  } as unknown as Plugin;
}
