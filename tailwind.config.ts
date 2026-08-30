import type { Config } from 'tailwindcss';

/**
 * Deliberately minimal. The only theme extension is the font pairing, which is
 * inherited from Gali (Assistant for UI, Frank Ruhl Libre for display) and wired
 * to the CSS variables `next/font` emits in `app/layout.tsx`.
 *
 * No colour scale, no shadow system, no radii yet: per the build plan, the Gali
 * components are read and the inherited conventions reported before anything
 * here is styled.
 */
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-ui)', 'system-ui', 'sans-serif'],
        serif: ['var(--font-display)', 'Georgia', 'serif'],
      },
    },
  },
  plugins: [],
};

export default config;
