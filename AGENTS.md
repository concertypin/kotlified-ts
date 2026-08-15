# vite-plugin-kotlin-ext

Compile-time Kotlin scope functions (`let`/`apply`/`run`/`also`/`takeIf`/`takeUnless`) for Vite.

## Layout

- `src/index.ts` — the Vite plugin (`enforce: 'pre'` transform hook, id filtering).
- `src/transform.ts` — Babel-based surgical rewriter: parses, rewrites only matched call
  expressions, leaves the rest of the file byte-for-byte intact, injects the runtime import.
- `src/runtime.ts` — plain helper functions (no prototype pollution); also importable directly.
- `src/global.d.ts` — opt-in global type augmentation (tsconfig `types` entry) with
  `this`-polymorphic block params.
- `test/` — vitest unit tests, vite-build e2e, and a `tsc --noEmit` check against the global d.ts.

## Commands

- `pnpm test` — vitest run (unit + e2e)
- `pnpm lint` — oxlint + `tsc --noEmit`
- `pnpm build` — emit `dist/` (ESM + declarations)

## Design constraints

- No prototype pollution: calls are rewritten to runtime helper invocations.
- Only calls with exactly one argument are rewritten (native 2-arg `Function.prototype.apply` stays).
- Babel 8 AST: optional chaining appears as `OptionalCallExpression`/`OptionalMemberExpression`
  (not aliases of the plain nodes) — handle both when touching candidate detection.
