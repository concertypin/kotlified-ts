import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { build } from 'vite';
import kotlinExt from '../src/index.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const require = createRequire(import.meta.url);
const tsc = path.join(path.dirname(require.resolve('typescript/package.json')), 'bin/tsc');

function tempDir(prefix: string) {
  return mkdtempSync(path.join(tmpdir(), prefix));
}

describe('e2e: vite build', () => {
  it('bundles rewritten calls with the runtime', async () => {
    const dir = tempDir('kt-ext-e2e-');
    try {
      writeFileSync(
        path.join(dir, 'main.ts'),
        `
import { render } from './other.js';
const a = { n: 1 };
const x = a.let(v => v.n + 1).also(v => console.log(v));
const y: string | undefined = [1, 2, 3].takeIf(list => list.length > 1)?.join('/');
const z = (null as string | null)?.let(s => s.length);
render(x, y, z);
`,
      );
      writeFileSync(
        path.join(dir, 'other.js'),
        `
export function render(...args) { console.log(args); }
`,
      );
      const result = await build({
        root: dir,
        logLevel: 'silent',
        plugins: [kotlinExt({ runtimeId: path.join(root, 'src/runtime.ts') })],
        build: {
          write: false,
          minify: false,
          rollupOptions: { input: path.join(dir, 'main.ts') },
        },
      });
      const chunks = (result as unknown as { output: Array<{ code: string }> }).output;
      const code = chunks.map((c) => c.code).join('\n');
      // helpers are bundled from the runtime; no `.let(` style calls remain
      expect(code).toContain('letExt({ n: 1 }');
      expect(code).toContain('alsoExt(');
      expect(code).toContain('takeIfExt(');
      expect(code).toContain('letOrNull(null, (s) => s.length)');
      expect(code).not.toContain('.let(');
      expect(code).not.toContain('.also(');
      expect(code).not.toContain('.takeIf(');
      // runtime functions must be present in the bundle
      expect(code).toContain('function letExt');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('e2e: type checking with the global augmentation', () => {
  it('typechecks Kotlin-style calls and keeps native apply working', () => {
    const dir = tempDir('kt-ext-types-');
    try {
      const globalDts = path.join(root, 'src/global.d.ts');
      writeFileSync(
        path.join(dir, 'main.ts'),
        `
/// <reference path="${globalDts}" />
const a = { n: 1 };

// polymorphic this: block param is narrowed to the receiver type
const x: number = a.let(v => v.n + 1);

// apply returns the receiver; block binds this (no it param, like Kotlin)
const y: { n: number } = a.apply(function () { this.n = 2; });

// primitives work too
const len: number = "hello".let(s => s.length);
const twice: number = (2).run(function (this: number) { return this * 2; });

// takeIf returns receiver | undefined; optional chaining narrows
const w: number[] | undefined = [1, 2].takeIf(xs => xs.length > 0);
const w2: number = [1, 2].takeIf(xs => xs.length > 0)?.length ?? 0;

// also returns the receiver
const z: string = "s".also(s => console.log(s));

// native 2-argument Function.prototype.apply still typechecks
const arr: number[] = [1, 2];
const copy: number[] = ([] as number[]).concat.apply([], [arr]);
// 1-arg Kotlin apply on a function receiver: TS's CallableFunction.apply typing
// rejects it (thisArg: T) — runtime still rewrites it; prefer .run()/.also() there

void x; void y; void len; void twice; void w; void w2; void z; void copy;
`,
      );
      writeFileSync(
        path.join(dir, 'tsconfig.json'),
        JSON.stringify({
          compilerOptions: {
            strict: true,
            noEmit: true,
            target: 'ES2022',
            lib: ['ES2022', 'DOM'],
            module: 'ESNext',
            moduleResolution: 'Bundler',
            skipLibCheck: true,
          },
          include: ['main.ts'],
        }),
      );
      execFileSync(process.execPath, [tsc, '-p', path.join(dir, 'tsconfig.json')], {
        stdio: 'pipe',
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
