// vitest의 expect 미니 대체 — node:test + node:assert 기반.
// kotlified-ts 테스트에 실제로 쓰이는 매처만 구현한다.
import assert from "node:assert/strict";

export function expect(actual: unknown) {
    return {
        toBe(expected: unknown) {
            assert.equal(actual, expected);
        },
        toBeNull() {
            assert.equal(actual, null);
        },
        toEqual(expected: unknown) {
            assert.deepEqual(actual, expected);
        },
        toContain(substring: string) {
            assert.ok(
                String(actual).includes(substring),
                `expected ${JSON.stringify(actual)} to contain ${JSON.stringify(substring)}`
            );
        },
        toHaveLength(length: number) {
            assert.equal((actual as { length: number }).length, length);
        },
        get not() {
            return {
                toContain(substring: string) {
                    assert.ok(
                        !String(actual).includes(substring),
                        `expected ${JSON.stringify(actual)} not to contain ${JSON.stringify(substring)}`
                    );
                },
            };
        },
    };
}
