import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypeScript from 'eslint-config-next/typescript';

/**
 * Flat config. `eslint-config-next` exports flat-config arrays directly from its
 * subpaths, so no `FlatCompat` shim is needed.
 *
 * The two additions below are the code conventions in CLAUDE.md made
 * machine-checkable: `any` and non-null assertions are the two ways the type
 * checker gets silenced without an error, and a convention nothing enforces is a
 * convention that drifts.
 */
const config = [
  { ignores: ['.next/**', 'node_modules/**', 'next-env.d.ts'] },
  ...nextCoreWebVitals,
  ...nextTypeScript,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
    },
  },
];

export default config;
