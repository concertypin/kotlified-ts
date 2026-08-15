import { parse, type ParserPlugin } from '@babel/parser';
import { generate } from '@babel/generator';
import * as t from '@babel/types';

/**
 * Compile-time rewrite for Kotlin-style extension functions.
 *
 * Calls like `value.let(block)` are rewritten to direct calls of a tiny
 * runtime helper (`__kt$let(value, block)`) so nothing is ever added to
 * `Object.prototype`. The rest of the file is left byte-for-byte intact:
 * only the matched call expressions are surgically replaced.
 */

export interface TransformOptions {
  /** Original module id / filename. Used to pick the right parser plugins (.tsx vs .ts vs .js). */
  filename?: string;
  /** Import specifier injected for the runtime helpers. */
  runtimeId?: string;
  /** Label used in shadow warnings (defaults to `filename`). */
  fileLabel?: string;
  /**
   * Warn when this file declares a real method that shadows a rewritten
   * call (e.g. `class A { let(fn) {} }` + `x.let(fn)`). Default: true.
   */
  shadowWarn?: boolean;
}

export interface TransformResult {
  code: string;
  helpers: string[];
  /** Human-readable warnings for shadowed calls (already prefixed). */
  warnings: string[];
}

const METHOD_NAMES = new Set(['let', 'apply', 'run', 'also', 'takeIf', 'takeUnless']);

const HELPERS: Record<string, { base: string; orNull: string }> = {
  let: { base: '__kt$let', orNull: '__kt$letOrNull' },
  apply: { base: '__kt$apply', orNull: '__kt$applyOrNull' },
  run: { base: '__kt$run', orNull: '__kt$runOrNull' },
  also: { base: '__kt$also', orNull: '__kt$alsoOrNull' },
  takeIf: { base: '__kt$takeIf', orNull: '__kt$takeIfOrNull' },
  takeUnless: { base: '__kt$takeUnless', orNull: '__kt$takeUnlessOrNull' },
};

const RUNTIME_EXPORT: Record<string, string> = {
  __kt$let: 'letExt',
  __kt$letOrNull: 'letOrNull',
  __kt$apply: 'applyExt',
  __kt$applyOrNull: 'applyOrNull',
  __kt$run: 'runExt',
  __kt$runOrNull: 'runOrNull',
  __kt$also: 'alsoExt',
  __kt$alsoOrNull: 'alsoOrNull',
  __kt$takeIf: 'takeIfExt',
  __kt$takeIfOrNull: 'takeIfOrNull',
  __kt$takeUnless: 'takeUnlessExt',
  __kt$takeUnlessOrNull: 'takeUnlessOrNull',
};

/** Inline fallbacks for non-module scripts (no import/export available). */
const INLINE_RUNTIME: Record<string, string> = {
  __kt$let: '(v, b) => b(v)',
  __kt$letOrNull: '(v, b) => (v == null ? undefined : b(v))',
  __kt$apply: '(v, b) => (b.call(v), v)',
  __kt$applyOrNull: '(v, b) => (v == null ? undefined : (b.call(v), v))',
  __kt$run: '(v, b) => b.call(v)',
  __kt$runOrNull: '(v, b) => (v == null ? undefined : b.call(v))',
  __kt$also: '(v, b) => (b(v), v)',
  __kt$alsoOrNull: '(v, b) => (v == null ? undefined : (b(v), v))',
  __kt$takeIf: '(v, p) => (p(v) ? v : undefined)',
  __kt$takeIfOrNull: '(v, p) => (v == null ? undefined : (p(v) ? v : undefined))',
  __kt$takeUnless: '(v, p) => (p(v) ? undefined : v)',
  __kt$takeUnlessOrNull: '(v, p) => (v == null ? undefined : (p(v) ? undefined : v))',
};

/** Fast path: only bother parsing when a candidate call might exist. */
const CANDIDATE_RE = /\.\s*(?:let|apply|run|also|takeIf|takeUnless)\s*(?:\?\.)?\s*\(/;

interface Candidate {
  node: t.CallExpression | t.OptionalCallExpression;
  start: number;
  end: number;
  helper: string;
  method: string;
  line: number;
  object: t.Expression;
  block: t.ArgumentPlaceholder | t.SpreadElement | t.Expression;
}

function parserPlugins(filename?: string): ParserPlugin[] {
  const f = filename ?? '';
  if (f.endsWith('.tsx')) return ['typescript', 'jsx'];
  if (f.endsWith('.ts') || f.endsWith('.mts') || f.endsWith('.cts')) return ['typescript'];
  return ['jsx'];
}

function walk(node: unknown, visit: (n: any) => void): void {
  if (!node || typeof node !== 'object') return;
  const n = node as any;
  if (typeof n.type !== 'string') return;
  visit(n);
  for (const key of Object.keys(n)) {
    if (
      key === 'loc' ||
      key === 'start' ||
      key === 'end' ||
      key === 'extra' ||
      key === 'leadingComments' ||
      key === 'trailingComments' ||
      key === 'innerComments' ||
      key === 'comments'
    ) {
      continue;
    }
    const child = n[key];
    if (Array.isArray(child)) {
      for (const item of child) walk(item, visit);
    } else {
      walk(child, visit);
    }
  }
}

function isCallLike(n: any): n is t.CallExpression | t.OptionalCallExpression {
  return n?.type === 'CallExpression' || n?.type === 'OptionalCallExpression';
}

function isMemberLike(n: any): n is t.MemberExpression | t.OptionalMemberExpression {
  return n?.type === 'MemberExpression' || n?.type === 'OptionalMemberExpression';
}

/**
 * True when the `.let` / `.apply` / ... access itself is optional, i.e.
 * `value?.let(block)` or `value.let?.(block)`.
 *
 * `value?.nested.let(block)` is *not* optional here: the chain short-circuits
 * inside the receiver, so the plain `let` helper is used (Kotlin semantics:
 * `null?.nested.let { }` still runs the block with `null`).
 */
function isOptionalAccess(call: t.CallExpression | t.OptionalCallExpression): boolean {
  if (call.type === 'OptionalCallExpression' && call.optional) return true;
  const callee = call.callee as any;
  return callee?.type === 'OptionalMemberExpression' && callee.optional === true;
}

/** Node types that declare a real callable member (`key` is an Identifier). */
const SHADOW_METHOD_TYPES = new Set([
  'ClassMethod',
  'ObjectMethod',
  'TSDeclareMethod',
  'TSMethodSignature',
]);

/** Property-like nodes that can hold a function value (e.g. `{ let: (f) => f }`). */
const SHADOW_PROPERTY_TYPES = new Set(['ObjectProperty', 'ClassProperty', 'ClassAccessorProperty']);

/**
 * Names of the six extension functions that this file declares as *real*
 * members (class methods, object literal methods, interface signatures,
 * function-valued properties). Rewriting a call with the same name would
 * silently bypass such a member.
 */
function findShadowedNames(ast: t.File): Set<string> {
  const names = new Set<string>();
  walk(ast, (node) => {
    if (SHADOW_METHOD_TYPES.has(node.type)) {
      const key = node.key;
      if (t.isIdentifier(key) && METHOD_NAMES.has(key.name)) names.add(key.name);
      return;
    }
    if (SHADOW_PROPERTY_TYPES.has(node.type)) {
      const key = node.key;
      if (!t.isIdentifier(key) || !METHOD_NAMES.has(key.name)) return;
      const value = node.value;
      if (value && (t.isArrowFunctionExpression(value) || t.isFunctionExpression(value))) {
        names.add(key.name);
      }
    }
  });
  return names;
}

function findCandidates(ast: t.File): Candidate[] {
  const candidates: Candidate[] = [];
  walk(ast, (node) => {
    if (!isCallLike(node)) return;
    const callee = node.callee;
    if (!isMemberLike(callee)) return;
    if (callee.computed) return;
    const prop = callee.property;
    if (!t.isIdentifier(prop) || !METHOD_NAMES.has(prop.name)) return;
    if (node.arguments.length !== 1) return;
    const block = node.arguments[0];
    if (block === undefined) return;
    if (t.isSuper(callee.object)) return;
    const name = prop.name;
    const helper = isOptionalAccess(node) ? HELPERS[name]!.orNull : HELPERS[name]!.base;
    candidates.push({
      node,
      start: node.start ?? 0,
      end: node.end ?? 0,
      helper,
      method: name,
      line: node.loc?.start.line ?? 0,
      object: callee.object as t.Expression,
      block,
    });
  });
  return candidates;
}

function insertAtTop(code: string, text: string): string {
  if (code.startsWith('#!')) {
    const nl = code.indexOf('\n');
    return code.slice(0, nl + 1) + text + code.slice(nl + 1);
  }
  return text + code;
}

export function transformCode(code: string, options: TransformOptions = {}): TransformResult | null {
  if (!CANDIDATE_RE.test(code)) return null;

  let ast: t.File;
  try {
    ast = parse(code, {
      sourceType: 'unambiguous',
      plugins: parserPlugins(options.filename),
    });
  } catch (err) {
    // Files we cannot parse (e.g. exotic syntax) are left untouched.
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[vite-plugin-kotlin-ext] skipped ${options.filename ?? '<unknown>'}: ${message}`);
    return null;
  }

  const candidates = findCandidates(ast);
  if (candidates.length === 0) return null;

  // Root candidates = outermost calls. Nested candidates are rewritten as
  // part of the root's replacement text.
  const roots = candidates.filter(
    (c) => !candidates.some((o) => o !== c && o.start <= c.start && c.end <= o.end),
  );

  // Rewrite every candidate in place so generating a root subtree also
  // contains its rewritten descendants.
  for (const candidate of candidates) {
    const replacement = t.callExpression(t.identifier(candidate.helper), [
      candidate.object,
      candidate.block,
    ]);
    for (const key of Object.keys(replacement)) {
      (candidate.node as any)[key] = (replacement as any)[key];
    }
  }

  // Apply edits from the end of the file backwards.
  const edits = roots
    .map((root) => ({
      start: root.start,
      end: root.end,
      text: generate(root.node, { comments: true }).code,
    }))
    .sort((a, b) => b.start - a.start);

  let out = code;
  for (const edit of edits) {
    out = out.slice(0, edit.start) + edit.text + out.slice(edit.end);
  }

  const helpers = [...new Set(candidates.map((c) => c.helper))];
  if (helpers.length > 0) {
    if (ast.program.sourceType === 'module') {
      const runtimeId = options.runtimeId ?? 'vite-plugin-kotlin-ext/runtime';
      const specifiers = helpers.map((h) => `${RUNTIME_EXPORT[h]} as ${h}`).join(', ');
      out = insertAtTop(out, `import { ${specifiers} } from ${JSON.stringify(runtimeId)};\n`);
    } else {
      const definitions = helpers.map((h) => `const ${h} = ${INLINE_RUNTIME[h]};`).join('\n');
      out = insertAtTop(out, `${definitions}\n`);
    }
  }

  // Shadow heuristic: if this file declares a real member with one of the
  // six names, rewritten calls of that name silently bypass it. Warn.
  const warnings: string[] = [];
  const shadowed = findShadowedNames(ast);
  if (options.shadowWarn !== false && shadowed.size > 0) {
    const risky = candidates.filter((c) => shadowed.has(c.method));
    if (risky.length > 0) {
      const names = [...shadowed]
        .filter((n) => risky.some((c) => c.method === n))
        .sort()
        .join(', ');
      const lines = [...new Set(risky.map((c) => c.line))].sort((a, b) => a - b).join(', ');
      const label = options.fileLabel ?? options.filename ?? '<unknown>';
      warnings.push(
        `[vite-plugin-kotlin-ext] ${label}: real ${names} member(s) declared in this file, but ` +
          `${risky.length} matching call(s) were rewritten anyway (line(s) ${lines}). ` +
          `Use computed access (obj['name'](fn)) or rename to keep the real member.`,
      );
    }
  }

  return { code: out, helpers, warnings };
}
