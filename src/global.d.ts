/**
 * Global type augmentation for Kotlin-style extension functions.
 *
 * These declarations make `.let()`, `.apply()`, `.run()`, `.also()`,
 * `.takeIf()` and `.takeUnless()` type-check on any value — with the block
 * parameters narrowed to the receiver's actual type via `this: T` generics.
 *
 * They only describe calls that `kotlified-ts` rewrites at build
 * time into direct runtime helper calls. Nothing is ever added to any
 * prototype; if you see `value.let(...)` in shipped code, the plugin is
 * not running.
 *
 * Enable by adding the package to your tsconfig:
 *
 *   {
 *     "compilerOptions": {
 *       "types": ["kotlified-ts/global"]
 *     }
 *   }
 */

declare global {
    interface Object {
        /** Kotlin `let`: runs `block` with the receiver as `it`, returns the block's result. */
        let<T, R>(this: T, block: (it: NoInfer<T>) => R): R;
        /** Kotlin `apply`: runs `block` with `this` = receiver, returns the receiver. */
        apply<T>(this: T, block: (this: NoInfer<T>) => void): T;
        /** Kotlin `run`: runs `block` with `this` = receiver, returns the block's result. */
        run<T, R>(this: T, block: (this: NoInfer<T>) => R): R;
        /** Kotlin `also`: runs `block` with the receiver as `it`, returns the receiver. */
        also<T>(this: T, block: (it: NoInfer<T>) => void): T;
        /** Kotlin `takeIf`: returns the receiver when `predicate` is true, else `undefined`. */
        takeIf<T>(
            this: T,
            predicate: (it: NoInfer<T>) => boolean
        ): T | undefined;
        /** Kotlin `takeUnless`: returns the receiver when `predicate` is false, else `undefined`. */
        takeUnless<T>(
            this: T,
            predicate: (it: NoInfer<T>) => boolean
        ): T | undefined;
    }

    interface String {
        let<T, R>(this: T, block: (it: NoInfer<T>) => R): R;
        apply<T>(this: T, block: (this: NoInfer<T>) => void): T;
        run<T, R>(this: T, block: (this: NoInfer<T>) => R): R;
        also<T>(this: T, block: (it: NoInfer<T>) => void): T;
        takeIf<T>(
            this: T,
            predicate: (it: NoInfer<T>) => boolean
        ): T | undefined;
        takeUnless<T>(
            this: T,
            predicate: (it: NoInfer<T>) => boolean
        ): T | undefined;
    }

    interface Number {
        let<T, R>(this: T, block: (it: NoInfer<T>) => R): R;
        apply<T>(this: T, block: (this: NoInfer<T>) => void): T;
        run<T, R>(this: T, block: (this: NoInfer<T>) => R): R;
        also<T>(this: T, block: (it: NoInfer<T>) => void): T;
        takeIf<T>(
            this: T,
            predicate: (it: NoInfer<T>) => boolean
        ): T | undefined;
        takeUnless<T>(
            this: T,
            predicate: (it: NoInfer<T>) => boolean
        ): T | undefined;
    }

    interface Boolean {
        let<T, R>(this: T, block: (it: NoInfer<T>) => R): R;
        apply<T>(this: T, block: (this: NoInfer<T>) => void): T;
        run<T, R>(this: T, block: (this: NoInfer<T>) => R): R;
        also<T>(this: T, block: (it: NoInfer<T>) => void): T;
        takeIf<T>(
            this: T,
            predicate: (it: NoInfer<T>) => boolean
        ): T | undefined;
        takeUnless<T>(
            this: T,
            predicate: (it: NoInfer<T>) => boolean
        ): T | undefined;
    }

    interface BigInt {
        let<T, R>(this: T, block: (it: NoInfer<T>) => R): R;
        apply<T>(this: T, block: (this: NoInfer<T>) => void): T;
        run<T, R>(this: T, block: (this: NoInfer<T>) => R): R;
        also<T>(this: T, block: (it: NoInfer<T>) => void): T;
        takeIf<T>(
            this: T,
            predicate: (it: NoInfer<T>) => boolean
        ): T | undefined;
        takeUnless<T>(
            this: T,
            predicate: (it: NoInfer<T>) => boolean
        ): T | undefined;
    }

    interface Symbol {
        let<T, R>(this: T, block: (it: NoInfer<T>) => R): R;
        apply<T>(this: T, block: (this: NoInfer<T>) => void): T;
        run<T, R>(this: T, block: (this: NoInfer<T>) => R): R;
        also<T>(this: T, block: (it: NoInfer<T>) => void): T;
        takeIf<T>(
            this: T,
            predicate: (it: NoInfer<T>) => boolean
        ): T | undefined;
        takeUnless<T>(
            this: T,
            predicate: (it: NoInfer<T>) => boolean
        ): T | undefined;
    }
}

export {};
