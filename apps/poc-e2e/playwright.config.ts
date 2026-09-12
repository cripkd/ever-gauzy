import { defineConfig, devices } from '@playwright/test';

/**
 * Minimal Playwright config for the poc-e2e spike.
 *
 * Run via `nx e2e poc-e2e` against an already-running app on baseURL
 * (e.g. `nx serve gauzy` in another terminal) — mirrors gauzy-e2e's
 * approach of not managing the dev server from the Playwright config itself.
 */
export default defineConfig({
	testDir: './tests',
	// Single worker, single spec — no shared-state concerns to parallelize around yet.
	workers: 1,
	use: {
		baseURL: 'http://localhost:4200',
		...devices['Desktop Chrome']
	}
});
