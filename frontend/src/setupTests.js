// #431 — CRA -> Vite migration: previously provided implicitly by
// react-scripts' built-in Jest config (which auto-imported jest-dom
// matchers). Vitest needs this wired explicitly via vite.config.js's
// test.setupFiles — see that file's comment.
import '@testing-library/jest-dom';
