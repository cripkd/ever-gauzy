import * as path from 'path';
import { defineConfig, devices } from '@playwright/test';

/**
 * Minimal Playwright config for the poc-e2e spike.
 *
 * Run via `nx e2e poc-e2e` against an already-running app on baseURL
 * (e.g. `nx serve gauzy` in another terminal) — mirrors gauzy-e2e's
 * approach of not managing the dev server from the Playwright config itself.
 *
 * Output paths are anchored to this file's own directory with path.join(__dirname,
 * ...), not left as bare relative strings. The @nx/playwright:playwright executor
 * runs Playwright with cwd = the Nx workspace root (verified against
 * node_modules/@nx/playwright/src/executors/playwright/playwright.impl.js), while
 * testDir/outputDir resolve relative to *this config file's* directory instead —
 * a bare 'test-results/results.json' would land at the workspace root while
 * traces/screenshots landed under apps/poc-e2e/, a silent split that would make the
 * CI upload steps in poc-e2e.yml archive nothing. Anchoring removes the ambiguity.
 */
export default defineConfig({
	testDir: './tests',
	outputDir: path.join(__dirname, 'test-results'),
	// Single worker, single spec — no shared-state concerns to parallelize around yet.
	workers: 1,
	// 'list' for human-readable CI logs (unchanged from before); 'json' is what
	// agent-react-to-e2e.yml parses programmatically for failing test names/errors —
	// far more robust than scraping colored terminal text; 'html' is Playwright's own
	// self-contained, browsable, filterable report for a human to actually look at.
	reporter: [
		['list'],
		['json', { outputFile: path.join(__dirname, 'test-results', 'results.json') }],
		['html', { open: 'never', outputFolder: path.join(__dirname, 'playwright-report') }]
	],
	use: {
		baseURL: 'http://localhost:4200',
		// Evidence for a failed run, not a passing one — keeps everyday CI output small.
		screenshot: 'only-on-failure',
		trace: 'retain-on-failure',
		...devices['Desktop Chrome']
	}
});
