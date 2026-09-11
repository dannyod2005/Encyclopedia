/** @type {import('tailwindcss').Config} */
module.exports = {
  // #431 — index.html moved from public/index.html to the project root as
  // part of the CRA -> Vite migration; updated to match.
  content: ['./src/**/*.{js,jsx,ts,tsx}', './index.html'],
  // #104 — Preflight (Tailwind's base CSS reset) is off on purpose. This
  // app is 100% inline `style={{}}` today, with its own small `.ks-*`
  // class layer and no reliance on Tailwind's reset conventions anywhere
  // yet. Turning Preflight on would reset default margins/list-style/etc.
  // on every element across the ENTIRE app — including the many screens
  // this phase of #104 doesn't touch — which is a real risk of visual
  // regressions with no practical way to check every screen at once.
  // Utilities (spacing, flex, grid, and responsive sm:/md:/lg: prefixes)
  // work identically either way; only the reset layer is skipped. Revisit
  // this once more of the app has been verified against Tailwind.
  corePlugins: {
    preflight: false,
  },
  theme: {
    extend: {
      // Mapped straight to the CSS custom properties already defined in
      // src/styles/global.css, so Tailwind classes (bg-ink, text-gold,
      // border-line, etc.) always match the existing design tokens
      // instead of duplicating hex values in a second place.
      colors: {
        ink: 'var(--ink)',
        'ink-70': 'var(--ink-70)',
        paper: 'var(--paper)',
        'paper-2': 'var(--paper-2)',
        gold: 'var(--gold)',
        'gold-dark': 'var(--gold-dark)',
        'gold-tint': 'var(--gold-tint)',
        slate: 'var(--slate)',
        'slate-light': 'var(--slate-light)',
        line: 'var(--line)',
        success: 'var(--success)',
        'success-tint': 'var(--success-tint)',
        coral: 'var(--coral)',
        'coral-tint': 'var(--coral-tint)',
        // #392 — added during the #385 rebrand (logo-icon accent) but
        // never mapped into Tailwind's color config until now, so
        // bg-blue/text-blue-dark/etc. weren't usable as utility classes.
        blue: 'var(--blue)',
        'blue-dark': 'var(--blue-dark)',
        'blue-tint': 'var(--blue-tint)',
      },
      fontFamily: {
        // #392 — these previously hardcoded a font stack that duplicated
        // (and, for `display`, drifted from) the actual values in
        // global.css: `display` still said Fraunces here after #385
        // swapped --font-display to Poppins. Referencing the CSS custom
        // properties directly (same pattern as `colors` above) means
        // this can't go stale again — global.css stays the single
        // source of truth.
        display: ['var(--font-display)'],
        body: ['var(--font-body)'],
        mono: ['var(--font-mono)'],
      },
    },
  },
  plugins: [],
};
