/**
 * Jest config for the api workspace.
 *
 * Only unit tests live here: they construct services with stub repositories and
 * never touch the database or a running server. That is why the `test` task in
 * turbo.json deliberately does not depend on `build` — `npm test` must stay
 * fast and safe to run while `npm run dev` is up.
 */
module.exports = {
  testEnvironment: "node",
  roots: ["<rootDir>/src"],
  testMatch: ["**/__tests__/**/*.spec.ts"],
  moduleFileExtensions: ["js", "json", "ts"],
  moduleNameMapper: {
    // @kanban/shared is consumed as raw TS with no build step — mirror the
    // tsconfig path mapping here, since jest does not read tsconfig paths.
    "^@kanban/shared$": "<rootDir>/../../packages/shared/src/index.ts",
  },
  transform: {
    "^.+\\.ts$": ["ts-jest", { tsconfig: "<rootDir>/tsconfig.json" }],
  },
  // entities use decorators, which need the reflect-metadata polyfill
  setupFiles: ["reflect-metadata"],
  clearMocks: true,
};
