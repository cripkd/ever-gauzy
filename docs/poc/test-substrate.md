# Test substrate inventory

Read-only investigation of the existing build/test/e2e substrate in this repo (`ever-gauzy`), for planning a Playwright PoC. Cross-referenced with `docs/poc/workflow-inventory.md` where noted.

## Package manager and scripts

**Package manager: Yarn (classic, v1).** Evidence:
- `yarn.lock` exists at repo root (2.1MB); no `package-lock.json` or `pnpm-lock.yaml` found.
- Root `package.json` pins it explicitly:
  ```json
  "packageManager": "yarn@1.22.22+sha512.a6b2f7906b721bba3d67d4aff083df04dad64c399707841b7acf00f6b133b7ac24255f2652fa22ae3534329dc6180534e98d17432037ff6fd140556e2bb3137e"
  ```
- Root `package.json` declares Yarn workspaces: `apps/*`, `tools`, `packages/*`, `packages/plugins/*`.

Relevant root `package.json` scripts (exact strings):

| Script | Command |
|---|---|
| `build` | `yarn nx run-many -t build -c development -p api,gauzy` |
| `build:prod` | `yarn nx run-many -t build -c production -p api,gauzy` |
| `build:clean` | `yarn clean && yarn build` |
| `test` | `yarn run postinstall.web && yarn run config:dev && yarn ng test` |
| `lint` | `yarn run config:dev && yarn ng lint` |
| `e2e` | `yarn run postinstall.web && yarn run config:dev && yarn ng e2e --browser chrome` |
| `e2e:ci` | `yarn run postinstall.web && yarn run config:prod && yarn --frozen-lockfile --cache-folder ~/.cache/yarn ng:ci e2e -c=production --prod --headless` |
| `seed` | `yarn seed:base ./apps/api/src/seed.ts` |
| `seed:all` | `yarn seed:base ./apps/api/src/seed-all.ts` |
| `seed:ever` | `yarn seed:base ./apps/api/src/seed-ever.ts` |
| `seed:jobs` | `yarn seed:base ./apps/api/src/seed-jobs.ts` |
| `seed:base` | `cross-env NODE_OPTIONS=--max-old-space-size=12288 yarn run config:dev && yarn run build:package:api && yarn ts-node -r tsconfig-paths/register --project apps/api/tsconfig.app.json` |
| `start` | `yarn concurrently --raw --kill-others "yarn start:api" "yarn start:gauzy"` |
| `start:api` | `yarn ng serve api` |
| `start:gauzy` | `yarn run postinstall.web && yarn ng serve gauzy --open` |
| `ng` | `cross-env NODE_ENV=development NODE_OPTIONS=--max-old-space-size=12288 yarn nx` (i.e. `ng` is just an alias for `nx`) |
| `affected` | `yarn nx affected` |
| `affected:test` | `yarn nx affected:test` |
| `affected:build` | `yarn nx affected:build` |
| `affected:lint` | `yarn nx affected:lint` |
| `affected:e2e` | `yarn nx affected:e2e` |

Notes:
- `ng` is an alias to `yarn nx` (with memory flags), not the Angular CLI — so `yarn ng test`, `yarn ng lint`, `yarn ng e2e` above all resolve to `nx test`, `nx lint`, `nx e2e` against the **default project**, which `nx.json` sets to `"defaultProject": "gauzy"`.
- The `affected:*` scripts use the **old Nx CLI syntax** (`nx affected:test`, `nx affected:build`, etc. as subcommands). This syntax was removed in modern Nx (the installed version is Nx/`@nx/*` `^22.5.2` — a current major version); current Nx only supports `nx affected -t <target>`. These scripts are very likely stale/non-functional and are not referenced by any CI workflow (see "Nx specifics" below).
- This is a large monorepo — the root `package.json` has ~850 lines, with 100+ `build:package:*` scripts, one per app/library/plugin. Per-project `package.json` files exist too (e.g. `apps/gauzy-e2e/package.json`) but were not exhaustively diffed against the root; the root scripts above are representative of the actually-used build/test/lint/e2e entry points.

## Existing test setup

### Jest config

- Root `jest.config.ts` is just an Nx aggregator, not a real config:
  ```ts
  import { getJestProjectsAsync } from '@nx/jest';
  export default async () => ({
      projects: await getJestProjectsAsync()
  });
  ```
- Root `jest.preset.js` re-exports the Nx default preset with no repo-specific overrides:
  ```js
  const nxPreset = require('@nx/jest/preset').default;
  module.exports = { ...nxPreset };
  ```
- Every app and package has its own `jest.config.ts` that extends the preset. Example, `apps/gauzy/jest.config.ts`:
  ```ts
  export default {
      displayName: 'gauzy',
      preset: '../../jest.preset.js',
      coverageDirectory: '../../coverage/apps/gauzy'
  };
  ```
  No custom `testEnvironment`, `transform`, or `moduleNameMapper` overrides are set at this level — those come from the shared `@nx/jest/preset` and per-project `tsConfig`/`setupFile` wired through the Nx executor (see below), not from the jest config file itself.
- 30+ `jest.config.ts` files exist across `apps/*` and `packages/*` (e.g. `apps/api`, `apps/gauzy`, `apps/worker`, `apps/desktop`, `packages/core`, `packages/ui-core`, `packages/plugins/*`, etc.) — one per Nx project, following the same thin-config-plus-preset pattern.
- Coverage output convention: `coverageDirectory: '../../coverage/apps/<project>'` (or `../../../coverage/packages/plugins/<project>` for nested plugin packages) — i.e. coverage always lands under a root `coverage/` directory mirroring the project's path.

### Test file location and naming

- Convention is **colocated `*.spec.ts` files next to the source file they test**, not a separate `__tests__` directory. Examples found:
  - `apps/gauzy/src/app/app.component.spec.ts`
  - `apps/gauzy/src/app/pages/goals/goals.component.spec.ts`
  - `apps/gauzy/src/app/pages/integrations/integrations.component.spec.ts`
  - `apps/gauzy/src/app/pages/reports/time-reports/time-reports/time-reports.component.spec.ts`
- `.github/workflows/test-unit.yml` states the repo has **~330 `*.spec.ts` files** across 20+ Nx projects.

### How tests run via Nx

- The Jest executor is `@nx/jest:jest`, wired per-project in each `project.json`. Example, `apps/gauzy/project.json`:
  ```json
  "test": {
      "executor": "@nx/jest:jest",
      "options": {
          "jestConfig": "apps/gauzy/jest.config.js",
          "setupFile": "apps/gauzy/src/test-setup.ts",
          "tsConfig": "apps/gauzy/tsconfig.spec.json"
      }
  }
  ```
- `nx.json` sets a `targetDefaults` entry for `@nx/jest:jest` that applies to every project using it:
  ```json
  "@nx/jest:jest": {
      "cache": true,
      "inputs": ["default", "^production", "{workspaceRoot}/jest.preset.js"],
      "options": { "passWithNoTests": true },
      "configurations": { "ci": { "ci": true, "codeCoverage": true } }
  }
  ```
  It also sets a generic `"test": { "cache": true }` default.
- **In actual CI**, `.github/workflows/test-unit.yml` runs unit tests with:
  ```
  yarn nx run-many -t test --nxBail=false --parallel=2
  ```
  (comment in that workflow: `--nxBail=false` so one failing project doesn't stop the others; `--parallel=2` chosen because Jest already forks per project). This is the authoritative "how tests actually run" command, not `nx affected`.

### Existing e2e setup — Playwright is already live here

Contrary to a "nothing exists yet" assumption, **Playwright e2e is already set up, wired into Nx, and actively maintained** in this repo:

- **Location:** `apps/gauzy-e2e/` — a dedicated Nx project (`apps/gauzy-e2e/project.json`, `name: "gauzy-e2e"`, `projectType: "application"`).
- **Config:** `apps/gauzy-e2e/playwright.config.ts`. It uses `@playwright/test` plus `playwright-bdd` for a Gherkin/Cucumber layer, targets `baseURL: http://localhost:4200` (the `gauzy` dev-server URL), pins `workers: 1` (shared sqlite DB + shared login account), and configures CI-only JUnit/HTML reporters.
- **Nx wiring** (`apps/gauzy-e2e/project.json`):
  ```json
  "targets": {
      "e2e": { "executor": "@nx/playwright:playwright", "options": { "config": "apps/gauzy-e2e/playwright.config.ts" } },
      "playwright": { "executor": "@nx/playwright:playwright", "options": { "config": "apps/gauzy-e2e/playwright.config.ts" } },
      "lint": { "executor": "@nx/eslint:lint" }
  }
  ```
  `@nx/playwright` (`^22.5.2`) and `@playwright/test` (`^1.61.0`) are already in root `package.json` devDependencies, along with `playwright-bdd` (`^9.1.0`).
- **Test content:** 1 plain `*.spec.ts` file (`apps/gauzy-e2e/tests/login.smoke.spec.ts`) plus **79 `.feature` files** under `apps/gauzy-e2e/tests/bdd/features/**` with step definitions in `apps/gauzy-e2e/tests/bdd/steps/**` and a page-object layer under `apps/gauzy-e2e/tests/support/pages/*.po.ts`. This is a substantial, real suite, not a stub.
- **Alive/dead verdict: ALIVE.** `git log -1` on `apps/gauzy-e2e/playwright.config.ts` shows it was last touched 2026-07-31 by commit `0c803cab5d` ("fix(e2e): 24 failures → 7 — ... "), i.e. actively debugged recently. It's wired into CI via `.github/workflows/test_playwright.yml`, which runs it sharded 4 ways (`npx bddgen && npx playwright test --shard=N/4`) after building the API and Angular web bundles, and uploads Playwright HTML/JUnit reports as artifacts. Per `docs/poc/workflow-inventory.md` (line 51): *"`test_playwright.yml` ... The real, current e2e suite ... Deliberately not run on every push to `develop` or on PRs — only `stage` pushes and manual dispatch, because it's long and DB-flaky."*
- **Cypress — DEAD/legacy, being replaced by the above.** The Playwright config's own header comment says: *"Migration target replacing Cypress (see cypress.json)."* Evidence of Cypress presence: `@nx/cypress`, `cypress`, `cypress-cucumber-preprocessor`, `cypress-file-upload`, `eslint-plugin-cypress` in root `package.json` devDependencies; a `cypress.json` referenced by workflows (config file itself not found via search — likely removed already, only the workflow references remain) under `apps/gauzy-e2e`. Two workflows still reference it: `.github/workflows/test_cypress.yml` and `.github/workflows/test_currents.yml` (the latter records results to Currents.dev, the former to the original Cypress Dashboard). Per `docs/poc/workflow-inventory.md` (lines 22-23, 49-50): both are triggered only on `push` to a branch literally named `nope`, which doesn't exist in normal flow — **dormant/dead code**, explicitly superseded by `test_playwright.yml` per that file's own header comment.
- No Protractor found anywhere (`protractor` appears only as a devDependency in root `package.json`, likely a transitive/legacy leftover — no `protractor.conf.*` file exists in the repo).

## Nx specifics

- **In practice, CI and package.json scripts use `nx run-many` and `nx run`, not `nx affected`.** Concrete evidence:
  - `.github/workflows/test-unit.yml`: `yarn nx run-many -t test --nxBail=false --parallel=2`
  - `.github/workflows/static-checks.yml`: `yarn nx run-many -t lint --nxBail=false --parallel=2`
  - `.github/workflows/build.yml`: uses `yarn nx run core:test-postgres-migrations` and `yarn nx run plugin-integration-ever-async:test-integration` (single-project `nx run`).
  - `.github/workflows/test_playwright.yml`: uses `npx playwright test` directly (not even through `nx e2e`), after Nx builds the API/web bundles separately.
  - A grep of every `.github/workflows/*.yml` for `nx affected` returned **zero matches**.
  - Root `package.json` has `affected`, `affected:test`, `affected:build`, `affected:lint`, `affected:e2e`, `affected:apps`, `affected:libs`, `affected:dep-graph` scripts, but (a) they use old, likely-broken Nx v1-style subcommand syntax (`nx affected:test` rather than `nx affected -t test`) given the installed Nx is `^22.5.2`, and (b) none of them are invoked by any workflow.
  - `AGENTS.md` recommends `nx run` / `nx run-many` / `nx affected` generically, but only the first two are what's actually exercised in this repo's CI today.
- **Conclusion: `nx affected` is not actually used anywhere in this repo right now** — CI always runs the full `run-many` set for `test` and `lint`, and `build`/`e2e` are invoked in other ad hoc ways.
- **Target names confirmed to exist:** `build`, `test`, `lint`, `e2e` are all defined as `targetDefaults` in `nx.json`, and concretely present in project.json files (`apps/gauzy/project.json` has `build`/`serve`/`test`; `apps/gauzy-e2e/project.json` has `e2e`/`playwright`/`lint`). `nx.json`'s `"defaultBase": "develop"` confirms `develop` is the intended affected-comparison base branch.
- **Proposed minimal "build and test only what changed" command**, based on what actually exists here:
  ```
  yarn nx affected -t lint,test,build --base=origin/develop --parallel=2
  ```
  This uses the modern (`^22.5.2`-compatible) `nx affected -t <targets>` syntax rather than the stale `affected:*` package.json scripts; targets `lint`, `test`, `build` all have real executor wiring per project; `--base=origin/develop` matches `nx.json`'s own `defaultBase`; `--parallel=2` mirrors what CI already uses for `run-many -t test`/`run-many -t lint` to avoid resource contention. `e2e` was deliberately left out of this proposal since the real Playwright suite is intentionally kept off the normal PR/push path (see above) and needs a built API + served web app first, not a bare `nx affected -t e2e`.

## Angular conventions

- **Component layout:** each component gets its own folder (for top-level page components) or lives colocated at its route folder, with four sibling files: `<name>.component.ts`, `<name>.component.html`, `<name>.component.scss`, `<name>.component.spec.ts`. Example, `apps/gauzy/src/app/pages/goals/`:
  ```
  goals.component.ts
  goals.component.html
  goals.component.scss
  goals.component.spec.ts
  goals.module.ts
  goals-routing.module.ts
  goals-components.module.ts
  ```
  Sub-features live in nested folders (`edit-keyresults/`, `goal-details/`, `keyresult-update/`, etc.), each following the same pattern with their own `.module.ts`.
- **NgModules, not standalone components, is the dominant pattern.** A repo-wide grep found only 4 files with `standalone: true` in `apps/gauzy/src/app`, versus 446 files using `@NgModule`/`standalone: false`. Top-level app bootstrap is also module-based (`apps/gauzy/src/app/app.module.ts`, `bootstrap.module.ts`), not `bootstrapApplication`.
- Example paths: `apps/gauzy/src/app/app.component.ts` (root component, module-based) and `apps/gauzy/src/app/pages/goals/goals.component.ts` (feature page component with its own `goals.module.ts`).

### `data-testid` / test-selector attribute grep (whole repo, excluding `node_modules`, `dist`, `.git`)

- `data-testid`: **1 match** — `apps/gauzy-e2e/src/support/Base/pageobjects/DocumentsHubPageObject.ts:58`, and it's a *comment*, not a real attribute:
  > `// anything language-independent — a `data-testid` would have to be threaded through Nebular's own ...`
- `data-test-id`: **0 matches**
- `data-cy`: **0 matches**
- `data-qa`: **0 matches**

So effectively **zero real test-selector attributes exist anywhere in the app source.** The existing Playwright/Cypress page-object layer (`apps/gauzy-e2e/tests/support/pages/*.po.ts`) selects elements via CSS classes, Nebular component selectors (e.g. `nb-stepper [formcontrolname="name"]`), `.cdk-overlay-backdrop`, text content (`hasText`), and similar structural/semantic selectors — not dedicated test IDs.

## What I'd need to add for Playwright

Since Playwright e2e already exists and is wired into Nx (`apps/gauzy-e2e`, `@nx/playwright:playwright` executor, `nx e2e gauzy-e2e` / `nx playwright gauzy-e2e`), a PoC would build on it rather than bootstrap from scratch. What's still missing or worth adding:

- No `data-testid`-style selectors exist anywhere in app source — the existing suite works around this with CSS/Nebular/text selectors; a more robust PoC would want to introduce test IDs on key elements (a real app-code change, not just e2e-side config).
- The Playwright suite is currently gated to `push: stage` and manual `workflow_dispatch` only (`test_playwright.yml`) — it does not run on `develop` pushes or PRs. Adding a PR-triggered/opt-in workflow (or a `workflow_dispatch`/label-triggered job) would be needed if the goal is PR-level feedback.
- No `nx affected`-based e2e selection exists — `test_playwright.yml` always runs the whole sharded suite; if the PoC's goal is "only e2e-test what changed," that logic doesn't exist yet and would need to be built (e.g. via `nx affected -t e2e` or a custom diff against `apps/gauzy-e2e`/affected pages).
- CI currently starts the API and web app as background `forever` processes with a pinned base URL (`http://localhost:4200`) via `apps/gauzy-e2e/tools/serve-web.js` — any new/parallel scenario (e.g. testing a different app than `gauzy`) would need its own serve/build wiring and `E2E_BASE_URL` override, since the existing config only points at the `gauzy` app.
- `package-lock`/dependency installs in CI for this job travel as a custom `actions/upload-artifact`/`download-artifact` archive rather than `actions/cache`; a new or parallel e2e job would need to follow (or deliberately diverge from) that pattern.
- The suite's `workers: 1` / shared-DB / shared-login design (documented at length in `playwright.config.ts`'s comments) is load-bearing for the existing specs; anything added to a PoC needs to either respect that constraint or get its own isolated data/account, not assume parallel-safe defaults.
- No `nx affected`/target wiring problem exists for e2e itself (the `e2e` target and its executor are already defined) — so for a narrow PoC, the main remaining "setup" work is CI-trigger scope and (optionally) test-ID instrumentation, not tooling installation.
