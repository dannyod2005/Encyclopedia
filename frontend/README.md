# Encyclopedia

This project is a LMS for Encyclopedia.

## Getting started

Built with [Vite](https://vite.dev/) (migrated from Create React App in #431 — CRA was unmaintained and was the source of most of the high-severity `npm audit` findings on this app).

Requires a `.env` file in this directory with:

```
VITE_API_URL=<backend base URL, e.g. http://localhost:3001>
VITE_SUPABASE_URL=<your Supabase project URL>
VITE_SUPABASE_ANON_KEY=<your Supabase anon/public key>
```

(`.env` is gitignored — ask a teammate for the values, or check the shared credentials doc.)

## Available scripts

In the project directory, you can run:

### `npm run dev` (or `npm start`)

Runs the app in development mode with hot module reload. Open [http://localhost:3000](http://localhost:3000) to view it — Vite's dev server defaults to port 5173, but this project pins it to 3000 to match prior tooling/docs (see `vite.config.js` if that ever needs to change).

### `npm test`

Runs the test suite once via [Vitest](https://vitest.dev/). Use `npm run test:watch` for interactive watch mode.

### `npm run build`

Builds the app for production into the `dist` folder (was `build` under CRA — see `.gitignore`).

### `npm run preview`

Serves the production build from `dist` locally, for a final sanity check before deploying.

## Learn more

- [Vite documentation](https://vite.dev/guide/)
- [Vitest documentation](https://vitest.dev/guide/)
- [React documentation](https://react.dev/)
