/**
 * Runtime helpers for `kotlified-ts`.
 *
 * The Vite plugin rewrites Kotlin-style scope-function calls into direct
 * calls of these functions, so nothing is ever attached to
 * `Object.prototype`. You normally never import this module yourself —
 * the plugin injects the import automatically.
 */

/** Kotlin `let`: runs `block` with the receiver as `it`, returns the block's result. */
export function letExt<T, R>(value: T, block: (it: T) => R): R {
  return block(value);
}

/** Null-safe variant: skips the block when `value` is `null`/`undefined`. */
export function letOrNull<T, R>(value: T, block: (it: NonNullable<T>) => R): R | undefined {
  return value == null ? undefined : block(value);
}

/** Kotlin `apply`: runs `block` with `this` = receiver, returns the receiver. */
export function applyExt<T>(value: T, block: (this: T) => void): T {
  block.call(value);
  return value;
}

/** Null-safe variant of `applyExt`. */
export function applyOrNull<T>(value: T, block: (this: NonNullable<T>) => void): T | undefined {
  if (value == null) return undefined;
  block.call(value);
  return value;
}

/** Kotlin `run`: runs `block` with `this` = receiver, returns the block's result. */
export function runExt<T, R>(value: T, block: (this: T) => R): R {
  return block.call(value);
}

/** Null-safe variant of `runExt`. */
export function runOrNull<T, R>(value: T, block: (this: NonNullable<T>) => R): R | undefined {
  return value == null ? undefined : block.call(value);
}

/** Kotlin `also`: runs `block` with the receiver as `it`, returns the receiver. */
export function alsoExt<T>(value: T, block: (it: T) => void): T {
  block(value);
  return value;
}

/** Null-safe variant of `alsoExt`. */
export function alsoOrNull<T>(value: T, block: (it: NonNullable<T>) => void): T | undefined {
  if (value == null) return undefined;
  block(value);
  return value;
}

/** Kotlin `takeIf`: returns the receiver when `predicate` is true, else `undefined`. */
export function takeIfExt<T>(value: T, predicate: (it: T) => boolean): T | undefined {
  return predicate(value) ? value : undefined;
}

/** Null-safe variant of `takeIfExt`. */
export function takeIfOrNull<T>(value: T, predicate: (it: NonNullable<T>) => boolean): T | undefined {
  return value == null ? undefined : predicate(value) ? value : undefined;
}

/** Kotlin `takeUnless`: returns the receiver when `predicate` is false, else `undefined`. */
export function takeUnlessExt<T>(value: T, predicate: (it: T) => boolean): T | undefined {
  return predicate(value) ? undefined : value;
}

/** Null-safe variant of `takeUnlessExt`. */
export function takeUnlessOrNull<T>(value: T, predicate: (it: NonNullable<T>) => boolean): T | undefined {
  return value == null ? undefined : predicate(value) ? undefined : value;
}
