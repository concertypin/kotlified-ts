# kotlified-ts

Compile-time [Kotlin extension functions](https://kotlinlang.org/docs/scope-functions.html) for Vite projects: `let`, `apply`, `run`, `also`, `takeIf`, `takeUnless`.

Write Kotlin-style scope functions in TypeScript/JavaScript, and the plugin rewrites the calls into direct runtime helper invocations at build time. **Nothing is ever added to `Object.prototype`** — the `let`/`apply`/... you call are compiled away, not monkey-patched in.

```ts
// source
const label = users
  .filter(u => u.active)
  .let(list => list.map(u => u.name).join(', '))
  .also(console.log);

const el = document.querySelector('#app').apply(node => {
  node.dataset.ready = '1';
});
```

```js
// output (approximately — only the matched calls are replaced)
import { letExt as __kt$let, alsoExt as __kt$also, applyExt as __kt$apply } from 'kotlified-ts/runtime';

const label = __kt$also(
  __kt$let(users.filter(u => u.active), list => list.map(u => u.name).join(', ')),
  console.log,
);

const el = __kt$apply(document.querySelector('#app'), node => {
  node.dataset.ready = '1';
});
```

## Install

```bash
pnpm add -D kotlified-ts
```

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import kotlify from 'kotlified-ts';

export default defineConfig({
  plugins: [kotlify()],
});
```

### Editor types

The plugin ships a global type augmentation so the calls type-check on any value with proper `this`-polymorphic block parameters:

```json
{
  "compilerOptions": {
    "types": ["kotlified-ts/global"]
  }
}
```

## Supported functions

| Call | Receiver | Block receives | Returns |
| --- | --- | --- | --- |
| `value.let(block)` | — | `it` | block result |
| `value.apply(block)` | `this` | — | `value` |
| `value.run(block)` | `this` | — | block result |
| `value.also(block)` | — | `it` | `value` |
| `value.takeIf(predicate)` | — | `it` | `value` or `undefined` |
| `value.takeUnless(predicate)` | — | `it` | `value` or `undefined` |

`value?.let(block)` and `value.let?.(block)` use null-safe helpers — the block is skipped when the receiver is `null`/`undefined`. A chain like `a?.b.let(block)` does *not*: the short-circuit lives inside the receiver, so the plain `let` helper is used (matching Kotlin).

## How it works

1. `transform` hook runs `enforce: 'pre'` on `.ts/.tsx/.js/.jsx/.mjs/.cjs/.mts/.cts` files and SFC script blocks (`.vue`/`.svelte`/`.astro` `type=script`).
2. A fast regex pre-check skips files without candidate calls, then the file is parsed with `@babel/parser`.
3. Every `obj.method(block)` call where `method` is one of the six names **and has exactly one argument** is rewritten in place to `__kt$helper(obj, block)`. Only matched calls are touched — the rest of the file stays byte-for-byte identical (no reprinting, no reformatting churn).
4. A single `import { ... } from 'kotlified-ts/runtime'` is injected for the used helpers (non-module scripts get tiny inline `const` definitions instead).
5. Nothing is added to any prototype; the runtime helpers are plain exported functions that bundlers tree-shake per helper.

## Semantics notes

- **One-argument rule**: only calls with exactly one argument are rewritten. In particular the native `Function.prototype.apply(thisArg, argsArray)` (2 arguments) is never touched, while a 1-argument `fn.apply(block)` is treated as Kotlin `apply`. (Typing note: `fn.apply(block)` on a *function* receiver doesn't type-check — `CallableFunction.apply` types `thisArg` as the function's `this` type, so prefer `.run()`/`.also()` for functions, or `.apply()` on objects.)
- **Shadow heuristic**: when a file declares a real member with one of the six names (`class A { let(fn) {} }`, interface method signatures, object literal methods, function-valued properties), the plugin warns about rewritten calls of that name — they would silently bypass the real member. The rewrite still happens; use computed access `obj['let'](fn)` to keep the real method, or pass `shadowWarn: false` to silence.
- **Computed access** (`obj['let'](...)`) is left alone.
- **`super.let(...)`** is left alone.
- TypeScript positions (`typeof x.let`, type annotations) are never rewritten.
- The injected helper identifiers (`__kt$let`, `__kt$apply`, ...) are reserved — don't declare your own bindings with those names in transformed files.
- Files that fail to parse (exotic syntax) are skipped with a warning and left untouched.

## Options

```ts
kotlify({
  include: /\/src\//,      // extra include filter (default: all transformable files)
  exclude: /\.spec\.ts$/,  // exclude filter
  runtimeId: 'my-scope/runtime', // import specifier for the runtime (default: kotlified-ts/runtime)
  shadowWarn: false,       // silence shadow warnings (default: true)
})
```

## Using the runtime directly (no Vite)

```ts
import { letExt, applyExt, runExt } from 'kotlified-ts/runtime';

const x = letExt({ n: 1 }, v => v.n + 1);
```

## Development

```bash
pnpm test      # unit + e2e (vite build + tsc type-check against the global d.ts)
pnpm lint      # oxlint + typecheck
pnpm build     # emit dist/ (ESM + .d.ts)
```
