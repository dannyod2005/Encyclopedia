import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// #431 — replaces react-scripts (Create React App), which was the root
// cause of most of the high-severity npm audit vulnerabilities on the
// frontend: CRA is unmaintained and hadn't picked up patched versions of
// its own build-tooling dependencies (nth-check, postcss, serialize-
// javascript, uuid). Vite is actively maintained, so those transitive
// vulnerabilities go away at the source instead of needing a workaround.
//
// This app has no CRA-specific surface beyond REACT_APP_* env vars and
// %PUBLIC_URL% in index.html (both handled elsewhere in this migration) —
// no SVG-as-component imports, no dev-server proxy (REACT_APP_API_URL is
// always a full URL, never a relative path), no service worker. So this
// config stays close to Vite's own defaults rather than needing much
// CRA-equivalent configuration.
//
// .mjs extension (not .js): package.json has no "type": "module", so
// Node would otherwise load this as CommonJS and Vite has to fall back to
// a bundling shim to handle the ESM import/export syntax below — harmless
// today but flagged as deprecated behavior. The extension makes this
// file's module type explicit without changing how postcss.config.js /
// tailwind.config.js (still plain CommonJS) are loaded.
export default defineConfig({
  plugins: [react()],
  // #431 — pinned to CRA's old default (Vite's own default is 5173)
  // rather than switching it: the backend's CORS allow-list is driven by
  // a FRONTEND_URL env var (see backend/src/main.ts), which almost
  // certainly already points at localhost:3000 locally. Keeping the port
  // the same means this migration doesn't also require updating that
  // separately.
  server: {
    port: 3000,
  },
  // #431 — `vite preview` (serving the real production build locally)
  // defaults to its own port (4173) rather than inheriting server.port
  // above, which meant a preview run's origin didn't match the backend's
  // FRONTEND_URL CORS allow-list even though `npm run dev` did. Pinned to
  // the same 3000 for the same reason as server.port — you won't run dev
  // and preview at once, so there's no actual conflict.
  preview: {
    port: 3000,
  },
  // #431 — Vitest config lives here (same file Vite itself reads) rather
  // than a separate vitest.config.js, since there's no reason for the two
  // to diverge on plugins/resolve config for this app. There were no
  // existing tests under CRA (react-scripts test had nothing to run) —
  // this scaffolds a working test runner going forward; see
  // src/setupTests.js and src/lib/userDisplay.test.js for the first real
  // test using it.
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/setupTests.js'],
    globals: true,
  },
});
