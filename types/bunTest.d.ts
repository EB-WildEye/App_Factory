/**
 * Minimal ambient declaration for `bun:test`.
 *
 * The test runner is Bun test, with no new dependency and no extra config — so
 * `bun-types` is not installed, and without this file `tsc --noEmit` cannot resolve
 * the `bun:test` module and the typecheck gate fails on every test file.
 *
 * Deliberately narrow: it declares the surface the tests in this repo actually use,
 * typed loosely on the matcher arguments because a test asserting on `unknown` is
 * still a test. If a test needs a matcher that is missing, add it here rather than
 * reaching for `any`.
 */
declare module 'bun:test' {
  interface Matchers {
    toBe(expected: unknown): void;
    toEqual(expected: unknown): void;
    toBeInstanceOf(expected: unknown): void;
    toContain(expected: unknown): void;
    toHaveLength(expected: number): void;
    toBeGreaterThan(expected: number): void;
    toBeLessThanOrEqual(expected: number): void;
    toThrow(expected?: unknown): void;
    toMatch(expected: RegExp | string): void;
  }

  interface Expectation extends Matchers {
    readonly not: Matchers;
  }

  export function expect(actual: unknown): Expectation;
  export function describe(label: string, body: () => void): void;
  export function test(label: string, body: () => void | Promise<void>): void;
  export function it(label: string, body: () => void | Promise<void>): void;
}
