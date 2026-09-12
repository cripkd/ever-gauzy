# GitHub Actions Workflow Inventory

> Note: the task brief said there are 71 files in `.github/workflows/`. A directory listing
> (`ls`/`find`) at the time of this inventory found **70** `.yml` files, no `.yaml` files, and no
> hidden files. All 70 were read in full (or, for the many near-duplicate deploy/desktop-build
> files, read in full for triggers/jobs plus targeted content checks — see each section).

## Summary

**70 workflows total**: 10 in Group A (build/lint/test), 56 in Group B (deploy/release/publish/image
build), 4 in Group C (everything else).

Read end to end, this repository's CI is really two separate systems wearing one `.github/workflows/`
directory. The first is a genuine push/PR gate for the `ever-gauzy` monorepo: `build.yml` is the
serious one — a hand-tuned, heavily-commented pipeline that installs once on a self-hosted runner
pool, archives `node_modules` as a run-scoped artifact, and fans out to build the API, the Angular
web app, libraries (with strict template checking) and the Electron desktop app, plus Postgres
migration and integration tests — alongside lighter jobs for spelling (cspell), secret scanning
(TruffleHog), dependency vulnerabilities (Snyk), and non-blocking ESLint/tsc checks
(`static-checks.yml`). Unit tests (`test-unit.yml`) and the Playwright e2e suite
(`test_playwright.yml`) intentionally run only on `stage`/on demand, not on every PR, because they're
new/slow/flaky and the team doesn't want to block the fast loop on them yet. Two Cypress-based e2e
workflows (`test_currents.yml`, `test_cypress.yml`) and MegaLinter are effectively **dead code**: they
trigger on branches (`nope`, `lint`) that don't exist in normal use, left in place as superseded
history rather than deleted. The second system is a large, repetitive release/deploy machine: a
`develop → stage → master` promotion flow where each branch's push mints a GitHub Release (tag +
notes), which then triggers Docker image builds (API/webapp/worker/MCP/MCP-auth, each demo/stage/prod
= 9 files) pushed to DockerHub/GHCR/DigitalOcean, which in turn trigger `workflow_run`-chained
deployments to seven different targets (Civo, CoreWeave, DigitalOcean Kubernetes, DO App Platform, DO
Droplets via SSH, Fly.io, Render) — 26 deploy-*.yml files, mostly demo/stage/prod triplicates of the
same kubectl/doctl/flyctl/render pattern. On top of that, five desktop/server product lines (agent,
desktop-app, desktop-timer-app, server, server-api, server-mcp) each get demo/stage/prod build
workflows (15 files) plus 3 promotion-triggered "agent" packaging workflows that cross-compile
Electron/pkg binaries for Windows/Linux/Linux-arm64/macOS and publish them to GitHub Releases. Finally
a small tail of four operational/maintenance workflows (Group C) handle Actions-cache pruning, an
external (GitHub-hosted, deliberately off the homelab network) uptime prober with GitHub Issues
alerting, a one-off secret-harvesting job into OpenBao, and a scheduled mirror of desktop installers
into Cloudflare R2. Much of this reflects a young, actively-being-hardened setup: extensive inline
commentary throughout documents real incidents (timeouts, cache evictions, OOMs, cancelled runs
silently breaking release chains) and the fixes applied, rather than being aspirational design notes.

## Group A — build, lint, test on push or PR

| filename | trigger (`on:`) | jobs | what it runs |
|---|---|---|---|
| `build.yml` | `pull_request:` (all branches) and `push:` to `develop`, `stage`, `master` | `build-monorepo-root`, `build-libs`, `build-api`, `build-web`, `build-desktop`, `cleanup` | Main CI gate. Installs deps once, archives `node_modules`, then in parallel: builds every library with strict template checking, builds the NestJS API (with a real Postgres service, runs migration + integration tests), builds the Angular web app, and (only on `develop`/`stage`/`master` pushes) builds the Electron desktop app. Cleans up the run-scoped artifact at the end. |
| `static-checks.yml` | `push`/`pull_request` to `develop` | `typecheck-configs`, `lint` | `typecheck-configs` runs `tsc --noEmit` over every `jest.config.ts` (installs TypeScript standalone, no monorepo install). `lint` runs `nx run-many -t lint` across the workspace as a **non-blocking** report (large pre-existing ESLint backlog; job/step both use `continue-on-error`). |
| `test-unit.yml` | `push` to `stage`; `workflow_dispatch` | `unit-tests` | Runs `nx run-many -t test` (Jest unit tests) against the restored dependency tree. Deliberately not run on PRs/`develop` and not a required check yet — suites have never run in CI before, so a red result here is informational for now. |
| `test_currents.yml` | `push` to branch `nope` (**dormant** — no such branch is used) | `prepare`, `e2e-tests` (2-way matrix) | Legacy Cypress e2e suite recorded to the Currents.dev dashboard, run on a Windows self-hosted runner. Effectively dead: the trigger branch doesn't exist in the normal flow, so this never runs automatically. Superseded by `test_playwright.yml` per that file's own header comment. |
| `test_cypress.yml` | `push` to branch `nope` (**dormant**) | `e2e-tests-setup`, `e2e-tests` (2-way matrix) | Same legacy Cypress suite, recorded to the original Cypress Dashboard instead of Currents. Also dormant for the same reason. |
| `test_playwright.yml` | `push` to `stage`; `workflow_dispatch` | `deps`, `build`, `e2e-playwright` (4-way shard matrix), `cleanup` | The real, current e2e suite. Installs once, builds API + Angular web bundles once, then 4 shards each boot a fresh sqlite-backed API + static web server and run a slice of the Playwright/BDD suite. Deliberately not run on every push to `develop` or on PRs — only `stage` pushes and manual dispatch, because it's long and DB-flaky. |
| `mega-linter.yml` | `push`/`pull_request` to branch `lint` (**effectively dormant** — no ordinary branch named `lint`) | `build` | Runs the MegaLinter Docker action (many linters at once, spell/copy-paste checks disabled) and can auto-open a PR or auto-commit fixes. Filename suggests a general lint gate, but the `on:` block restricts it to a branch that isn't part of the normal `develop→stage→master` flow, so in practice it doesn't run unless someone deliberately pushes to/PRs a branch literally called `lint`. |
| `typos.yml` | `push`/`pull_request` to `develop` | `spellcheck` | Runs cspell (`streetsidesoftware/cspell-action`) with `strict: true` against `.cspell.json`. |
| `snyk-analysis.yml` | `push`/`pull_request` to `develop` | `analyze` | Runs Snyk's Node vulnerability scan and uploads the SARIF result to GitHub Code Scanning. `continue-on-error: true` on the Snyk step so the SARIF upload always runs. |
| `secrets-analysis.yml` | `push` to `develop`; `pull_request` (any branch) | `TruffleHog` | Runs TruffleHog OSS (`--only-verified`) over the full checkout history (`fetch-depth: 0`) to catch verified live secrets. |

## Group B — deploy, release, publish, image build

- `agent-demo.yml` — builds the Windows Electron "Gauzy Agent" desktop app on push to `local-apps`, versioned from the release tag `Release Demo` created; publishes to GitHub Releases.
- `agent-prod.yml` — builds the "Gauzy Agent" app for Linux (x64 + arm64), macOS (signed/notarized) and Windows on push to `apps`; publishes to `ever-co/ever-gauzy-agent` GitHub Releases.
- `agent-stage.yml` — same Agent app build for Linux/macOS/Windows, triggered by push to `stage-apps` or `temp` (ad-hoc), prerelease build.
- `deploy-civo-demo.yml` — on completion of the demo Docker image build (branch `civo`), applies k8s manifests and rolling-restarts `gauzy-demo-api`/`webapp` on the Civo Kubernetes cluster.
- `deploy-civo-prod.yml` — same, production Civo Kubernetes cluster.
- `deploy-civo-stage.yml` — same, stage Civo Kubernetes cluster.
- `deploy-cw-demo.yml` — same pattern on the CoreWeave Kubernetes cluster (demo).
- `deploy-cw-prod.yml` — CoreWeave Kubernetes, production.
- `deploy-cw-stage.yml` — CoreWeave Kubernetes, stage.
- `deploy-do-app-platform-demo.yml` — deploys the demo image to DigitalOcean App Platform via `doctl apps create/update --spec .do/app.yaml`, branch `appplatform`.
- `deploy-do-app-platform-prod.yml` — same, production DO App Platform.
- `deploy-do-app-platform-stage.yml` — same, stage DO App Platform.
- `deploy-do-demo.yml` — deploys demo images (api/webapp/worker) to the DigitalOcean-managed `k8s-gauzy` Kubernetes cluster.
- `deploy-do-droplet-demo.yml` — after the "Pre" job stages files, SCPs docker-compose/nginx config to the demo DigitalOcean Droplet over SSH and restarts containers.
- `deploy-do-droplet-pre-demo.yml` — push-to-`droplets` job that generates TLS secrets and copies compose/nginx files to the demo Droplet host as a precursor step.
- `deploy-do-droplet-pre-prod.yml` — same precursor staging step for the production Droplet.
- `deploy-do-droplet-pre-stage.yml` — same precursor staging step for the stage Droplet.
- `deploy-do-droplet-prod.yml` — SSH-deploys the production image to the DigitalOcean Droplet.
- `deploy-do-droplet-stage.yml` — SSH-deploys the stage image to the DigitalOcean Droplet.
- `deploy-do-prod.yml` — deploys production images to the DigitalOcean Kubernetes cluster (`master` branch chain).
- `deploy-do-stage.yml` — deploys stage images to the DigitalOcean Kubernetes cluster.
- `deploy-fly-demo.yml` — runs `flyctl deploy` for the API and webapp apps on Fly.io (demo only).
- `deploy-mcp-auth-demo.yml` — deploys the MCP-Auth service image to DigitalOcean Kubernetes (demo).
- `deploy-mcp-auth-prod.yml` — same, production.
- `deploy-mcp-auth-stage.yml` — same, stage.
- `deploy-mcp-demo.yml` — deploys the Gauzy MCP service image to DigitalOcean Kubernetes (demo).
- `deploy-mcp-prod.yml` — same, production.
- `deploy-mcp-stage.yml` — same, stage.
- `deploy-render-demo.yml` — deploys the demo blueprint to Render.com via the Render CLI (demo only, no stage/prod equivalents exist).
- `desktop-app-demo.yml` — builds the packaged Electron desktop app (Windows) on push to `local-apps`; publishes to GitHub Releases.
- `desktop-app-prod.yml` — builds the desktop app for Linux/macOS/Windows on push to `apps`; publishes to GitHub Releases.
- `desktop-app-stage.yml` — same, stage prerelease build on push to `stage-apps`/`temp`.
- `desktop-timer-app-demo.yml` — builds the packaged "Timer" desktop app variant (Windows) on push to `local-apps`.
- `desktop-timer-app-prod.yml` — builds the Timer desktop app for Linux/macOS/Windows on push to `apps`.
- `desktop-timer-app-stage.yml` — same, stage.
- `docker-build-publish-demo.yml` — after "Release Demo" tags a release, builds and pushes `gauzy-api`, `gauzy-webapp`, `gauzy-worker` Docker images (tagged with the release version) to DockerHub, GHCR, and DigitalOcean Container Registry.
- `docker-build-publish-mcp-auth-demo.yml` — builds and publishes the `gauzy-mcp-auth` image on push to `develop`/`temp`.
- `docker-build-publish-mcp-auth-prod.yml` — same, on push to `master`.
- `docker-build-publish-mcp-auth-stage.yml` — same, on push to `stage`.
- `docker-build-publish-mcp-demo.yml` — builds and publishes the `gauzy-mcp` image on push to `develop`/`temp`.
- `docker-build-publish-mcp-prod.yml` — same, on push to `master`.
- `docker-build-publish-mcp-stage.yml` — same, on push to `stage`.
- `docker-build-publish-prod.yml` — builds and publishes `gauzy-api`/`gauzy-webapp`/`gauzy-worker` production images on push to `master`.
- `docker-build-publish-stage.yml` — same, on push to `stage`.
- `release-demo.yml` — on push to `develop`/`temp`, computes the next semver tag and creates a prerelease GitHub Release (this is what triggers `docker-build-publish-demo.yml` via `workflow_run`).
- `release-prod.yml` — same release-tagging job on push to `master` (production release).
- `release-stage.yml` — same release-tagging job on push to `stage`.
- `server-api-demo.yml` — builds/packages the standalone API server binary for Windows on push to `local-apps`.
- `server-api-prod.yml` — builds the API server binary for Linux/macOS/Windows on push to `apps`.
- `server-api-stage.yml` — same, stage.
- `server-demo.yml` — builds/packages the standalone "Server" (Gauzy server) binary for Windows on push to `local-apps`.
- `server-mcp-demo.yml` — builds/packages the standalone MCP server binary for Windows on push to `local-apps`.
- `server-mcp-prod.yml` — builds the MCP server binary for Linux/macOS/Windows on push to `apps`.
- `server-mcp-stage.yml` — same, stage.
- `server-prod.yml` — builds the Server binary for Linux/macOS/Windows on push to `apps`.
- `server-stage.yml` — same, stage.

## Group C — everything else

- `cache-janitor.yml` — scheduled (every 6h) + manual job that prunes duplicate GitHub Actions cache entries (keeps one copy per key, preferring the default branch's) to stay under the repo's 10 GB cache budget.
- `external-uptime-monitor.yml` — scheduled (every 15 min), deliberately GitHub-hosted (not self-hosted) probe of production/stage URLs from outside the team's homelab network; opens/updates/closes a GitHub Issue on sustained failures.
- `harvest-secrets-to-openbao.yml` — manual-dispatch-only job (pilot for `ever-teams`, generalized by repo) that copies this repo's GitHub secrets/vars into HashiCorp OpenBao via OIDC, with an isolation self-check before writing.
- `mirror-releases-to-r2.yml` — scheduled (every 6h) + manual job that mirrors desktop-app installers from GitHub Releases into a Cloudflare R2 bucket backing `downloads.ever.co`, since the old DigitalOcean Spaces CDN died.

## Reusable detail from Group A

### `build.yml`

**Node version pinned:**
```yaml
      - uses: actions/setup-node@v4
        with:
          node-version: 24
```
(same pin repeated in every job: `build-monorepo-root`, `build-libs`, `build-api`, `build-web`, `build-desktop`)

**Package manager and install command:**
```yaml
      - name: Install dependencies
        if: steps.cache.outputs.cache-hit != 'true'
        run: yarn install --network-timeout 1000000 --frozen-lockfile --ignore-scripts
```
Downstream jobs (`build-libs`, `build-api`, `build-web`, `build-desktop`) don't run `yarn install` directly — they restore the dependency tree the first job produced:
```yaml
      - name: Restore node_modules
        shell: bash
        run: .github/scripts/restore-node-modules.sh
```

**Services:**
```yaml
    services:
      postgres:
        image: postgres:18-alpine@sha256:d3e1620b530c944afa6e887d22eb899824da68e19c52024bf98f5220c88a65b2
        env:
          POSTGRES_USER: migration_test
          POSTGRES_PASSWORD: migration_test
          POSTGRES_DB: migration_test
        ports:
          - 5432/tcp
        options: >-
          --health-cmd "pg_isready -U migration_test -d migration_test"
          --health-interval 5s --health-timeout 5s --health-retries 12
```
(only in `build-api`; the other jobs have no `services:` block)

**Build/lint/test commands:**
```yaml
      - name: Test PostgreSQL migrations
        run: yarn nx run core:test-postgres-migrations
```
```yaml
      - name: Test Ever Async integration boundary
        run: yarn nx run plugin-integration-ever-async:test-integration
```
```yaml
      - name: Build API
        run: yarn build:api:prod:ci
```
```yaml
      - name: Build web
        run: yarn build:gauzy:prod:ci
```
```yaml
      - name: Build desktop
        run: yarn build:desktop
```
```yaml
      - name: Build packages
        run: yarn build:package:all
```

**Caching:**
```yaml
      - name: Restore node_modules archive
        id: cache
        uses: actions/cache/restore@v4
        with:
          path: ${{ env.NODE_MODULES_ARCHIVE }}
          key: ${{ runner.os }}-${{ runner.arch }}-node-modules-${{ hashFiles('yarn.lock', 'package.json', 'patches/**', '.scripts/postinstall.js') }}
```
```yaml
      - name: Save node_modules archive
        if: steps.cache.outputs.cache-hit != 'true'
        uses: actions/cache/save@v4
        continue-on-error: true
        with:
          path: ${{ env.NODE_MODULES_ARCHIVE }}
          key: ${{ steps.cache.outputs.cache-primary-key }}
```
Plus a run-scoped `actions/upload-artifact@v7` / `actions/download-artifact@v8` handoff of the same archive between jobs (the primary mechanism; the cache above is a best-effort cross-run optimization).

---

### `static-checks.yml`

**Node version pinned:**
```yaml
      - uses: actions/setup-node@v4
        with:
          node-version: 24
```
(both `typecheck-configs` and `lint` jobs)

**Package manager and install command:**
`typecheck-configs` installs no monorepo dependencies at all — only a standalone TypeScript:
```yaml
      - name: Install TypeScript
        run: npm install --no-save --no-package-lock --ignore-scripts --prefix "$RUNNER_TEMP/tsc" typescript@5.9.3
```
`lint` restores the shared dependency tree rather than running `yarn install` itself:
```yaml
      - name: Restore node_modules
        shell: bash
        run: .github/scripts/restore-node-modules.sh
```

**Services:** None.

**Build/lint/test commands:**
```yaml
      - name: Type-check every jest.config.ts
        run: |
          "$RUNNER_TEMP/tsc/node_modules/.bin/tsc" -p tools/tsconfig.jest-configs.json
```
```yaml
      - name: Run ESLint (report only)
        id: eslint
        continue-on-error: true
        run: yarn nx run-many -t lint --nxBail=false --parallel=2
```

**Caching:**
```yaml
      - name: Restore node_modules archive
        uses: actions/cache/restore@v4
        continue-on-error: true
        with:
          path: ${{ env.NODE_MODULES_ARCHIVE }}
          key: ${{ runner.os }}-${{ runner.arch }}-node-modules-${{ hashFiles('yarn.lock', 'package.json', 'patches/**', '.scripts/postinstall.js') }}
```
(`typecheck-configs` job uses no cache at all — it has no dependency install to cache.)

---

### `test-unit.yml`

**Node version pinned:**
```yaml
      - uses: actions/setup-node@v4
        with:
          node-version: 24
```

**Package manager and install command:** No direct `yarn install`/`npm install` step — dependencies are restored from the shared archive/cache:
```yaml
      - name: Restore node_modules
        shell: bash
        run: .github/scripts/restore-node-modules.sh
```

**Services:** None.

**Build/lint/test commands:**
```yaml
      - name: Run unit tests
        run: yarn nx run-many -t test --nxBail=false --parallel=2
```

**Caching:**
```yaml
      - name: Restore node_modules archive
        uses: actions/cache/restore@v4
        continue-on-error: true
        with:
          path: ${{ env.NODE_MODULES_ARCHIVE }}
          key: ${{ runner.os }}-${{ runner.arch }}-node-modules-${{ hashFiles('yarn.lock', 'package.json', 'patches/**', '.scripts/postinstall.js') }}
```

---

### `test_currents.yml`

*(Dormant: `on: push: branches: [nope]` — this workflow does not run in the normal branch flow.)*

**Node version pinned:** None — no `actions/setup-node` step is present anywhere in this file. It assumes Node/Yarn are already installed on the Windows self-hosted runner (the job explicitly re-adds Yarn to `PATH`: `run: echo "C:\Users\Evereq\AppData\Roaming\npm" | Out-File -FilePath $env:GITHUB_PATH -Encoding utf8 -Append`).

**Package manager and install command:**
```yaml
      - name: Install Packages & Bootstrap
        run: yarn bootstrap
```

**Services:** None (`services:` block not present — the API and UI are started as local background processes instead, via `forever`).

**Build/lint/test commands:**
```yaml
      - name: Build all packages
        run: yarn build:package:all
```
```yaml
      - name: Currents Cypress run
        run: |
          echo 'Starting Cypress Tests ...'
          cd apps/gauzy-e2e
          cy2 run --parallel --record --key ${{ secrets.CURRENTS_CYPRESS_RECORD_KEY }} --ci-build-id ${{ needs.prepare.outputs.uuid }} -C cypress.json -c "projectId=${{ secrets.CURRENTS_CYPRESS_PROJECT_ID }}" --group "1 - all e2e tests"
```

**Caching:**
```yaml
      - uses: actions/cache@v5
        id: yarn-cache
        with:
          path: ${{ steps.yarn-cache-dir-path.outputs.dir }}
          key: ${{ runner.os }}-${{ runner.arch }}-yarn-${{ hashFiles('yarn.lock') }}
          restore-keys: |
            ${{ runner.os }}-${{ runner.arch }}-yarn-
```

---

### `test_cypress.yml`

*(Dormant: `on: push: branches: [nope]` — same as above, does not run in the normal branch flow.)*

**Node version pinned:** None — no `actions/setup-node` step; same self-hosted-Windows assumption as `test_currents.yml`.

**Package manager and install command:**
```yaml
      - name: Install Packages & Bootstrap
        run: yarn bootstrap
```

**Services:** None.

**Build/lint/test commands:**
```yaml
      - name: Build all packages
        run: yarn build:package:all
```
```yaml
      - name: Cypress run
        uses: cypress-io/github-action@v5
        id: cypress
        continue-on-error: true
        with:
          install: false
          record: true
          parallel: true
          group: '1 - all e2e tests'
          working-directory: 'apps/gauzy-e2e'
          wait-on: 'http://localhost:3000/api,http://localhost:4200'
          wait-on-timeout: 1200
          browser: chrome
          headless: true
          config-file: cypress.json
```

**Caching:**
```yaml
      - uses: actions/cache@v5
        id: yarn-cache
        with:
          path: ${{ steps.yarn-cache-dir-path.outputs.dir }}
          key: ${{ runner.os }}-${{ runner.arch }}-yarn-${{ hashFiles('yarn.lock') }}
          restore-keys: |
            ${{ runner.os }}-${{ runner.arch }}-yarn-
```

---

### `test_playwright.yml`

**Node version pinned:** None found — no `actions/setup-node` step in any job (`deps`, `build`, `e2e-playwright`). Like the two Cypress workflows, this relies on the self-hosted runner already having Node/Yarn.

**Package manager and install command:**
```yaml
      - name: Install Packages & Bootstrap
        shell: bash
        run: |
          yarn bootstrap \
            || { echo "::warning::yarn bootstrap failed — retry 1"; yarn bootstrap; }
```

**Services:** None (`services:` block not used). The API and static web server are started as local background processes with `forever` inside the `e2e-playwright` job, e.g.:
```yaml
      - name: Run API in background
        run: forever start dist/apps/api/main.js
```

**Build/lint/test commands:**
```yaml
      - name: Build all packages
        run: |
          yarn build:package:all --parallel=1 \
            || { echo "::warning::build:package:all failed — retry 1 (nx cache skips built projects)"; yarn build:package:all --parallel=1; }
```
```yaml
      - name: Build API (bundle) for the test jobs
        run: |
          yarn nx build api -c development --parallel=1 \
            || { echo "::warning::api build failed — retry 1 (nx cache skips built deps)"; yarn nx build api -c development --parallel=1; }
```
```yaml
          build() { node --max-old-space-size=$heap_mb ./node_modules/nx/bin/nx.js build gauzy -c ci; }
          build || { echo "::warning::gauzy build failed — retry 1 (nx cache skips done deps)"; build; }
```
```yaml
        run: npx bddgen && npx playwright test --shard=${{ matrix.shard }}/${{ strategy.job-total }}
```

**Caching:** None. Explicitly documented in the file:
```yaml
      # NO actions/cache here, deliberately — see the archive step below. The budget is full of
      # caches that other workflows genuinely need, and writing this one would evict them.
```
Dependencies instead travel between jobs as a run-scoped `actions/upload-artifact`/`download-artifact` archive (`e2e-node-modules`), not an `actions/cache` entry.

---

### `mega-linter.yml`

*(Effectively dormant in normal use: `on: push`/`pull_request: branches: [lint]` — not part of the `develop`/`stage`/`master` flow.)*

**Node version pinned:** None — this workflow runs the `oxsecurity/megalinter@v6` container action, which brings its own toolchain; there is no `actions/setup-node` step and no repository dependency install.

**Package manager and install command:** None. The only "install"-like step is the linter action itself:
```yaml
      - name: MegaLinter
        id: ml
        uses: oxsecurity/megalinter@v6
        env:
          VALIDATE_ALL_CODEBASE: ${{ github.event_name == 'push' && github.ref == 'refs/heads/master' }}
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          DISABLE: COPYPASTE,SPELL
```

**Services:** None.

**Build/lint/test commands:** No standalone `run:` build/test commands — linting happens inside the MegaLinter action call above. The remaining `run:` steps are for auto-fix delivery:
```yaml
      - name: Prepare commit
        run: sudo chown -Rc $UID .git/
```

**Caching:** None.

---

### `typos.yml`

**Node version pinned:** None.

**Package manager and install command:** None — no dependency install; the action itself is the tool:
```yaml
      - uses: streetsidesoftware/cspell-action@v2
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          strict: true
          config: '.cspell.json'
```

**Services:** None.

**Build/lint/test commands:** The cspell action call above is the entire check; no separate `run:` command.

**Caching:** None.

---

### `snyk-analysis.yml`

**Node version pinned:** None (the `snyk/actions/node@master` action bundles its own Node/Snyk CLI).

**Package manager and install command:** None.

**Services:** None.

**Build/lint/test commands:**
```yaml
      - name: Run Snyk to check for vulnerabilities
        uses: snyk/actions/node@master
        continue-on-error: true # To make sure that SARIF upload gets called
        env:
          SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}
        with:
          args: --sarif-file-output=snyk.sarif
```

**Caching:** None.

---

### `secrets-analysis.yml`

**Node version pinned:** None.

**Package manager and install command:** None.

**Services:** None.

**Build/lint/test commands:**
```yaml
      - name: Secret Scanning (TruffleHog OSS)
        uses: trufflesecurity/trufflehog@v3.63.4
        with:
          path: ./
          extra_args: --only-verified
```

**Caching:** None.
