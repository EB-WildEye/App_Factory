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
    toBeGreaterThanOrEqual(expected: number): void;
    toBeLessThan(expected: number): void;
    toBeLessThanOrEqual(expected: number): void;
    toThrow(expected?: unknown): void;
    toMatch(expected: RegExp | string): void;
  }

  interface Expectation extends Matchers {
    readonly not: Matchers;
  }

  type TestBody = () => void | Promise<void>;

  /**
   * `skipIf` is what lets a test depend on something the machine may not have — the
   * gitignored production source, a Gali checkout — without either failing on a clean
   * clone or being deleted for the machines that do have it.
   */
  interface TestFunction {
    (label: string, body: TestBody): void;
    skipIf(condition: boolean): (label: string, body: TestBody) => void;
  }

  interface DescribeFunction {
    (label: string, body: () => void): void;
    skipIf(condition: boolean): (label: string, body: () => void) => void;
  }

  export function expect(actual: unknown): Expectation;
  export const describe: DescribeFunction;
  export const test: TestFunction;
  export const it: TestFunction;
}
