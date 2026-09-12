# Inherited Agent Config

Inventory of every file in `AGENTS.md`, `.claude/`, `.cursor/`, and `.agents/workflows/` as of 2026-09-12. Read-only — nothing in the repo was changed to produce this.

## What exists

| Path | Purpose | Length |
|---|---|---|
| `AGENTS.md` | Root-level instructions for any coding agent working in this repo (Nx usage conventions + a Windows file-search workaround). Has an Nx-managed block (`<!-- nx configuration start/end -->`) plus a hand-written section. | 41 lines / 2.4 KB |
| `.claude/settings.local.json` | Claude Code permission allowlist for this project — which Bash command patterns run without a prompt. | 21 lines / 484 B |
| `.cursor/mcp.json` | Cursor MCP server registration. Currently `{"mcpServers": {}}` — empty, no servers configured. | 2 lines / 22 B |
| `.cursor/rules/angular.mdc` | **Not project-specific guidance** — this is a near-complete dump of the official Angular framework documentation (bootstrapping, components, forms, DI, SSR/hydration, testing, images, etc.) packaged as a single Cursor rule file. `alwaysApply: false`, so Cursor only pulls it in on relevant context/glob match rather than injecting it into every request. | 14,387 lines / 713 KB |
| `.agents/workflows/comprehensive-search.md` | A named "workflow" (agent playbook) for doing exhaustive code search on Windows. | 35 lines / 1.1 KB |

No other files exist under `.claude/`, `.cursor/`, or `.agents/` — no commands, hooks, subagents, or additional rules/workflows beyond the five files above.

## Rules imposed on an agent

Only two of the five files carry actual behavioral instructions (`AGENTS.md` and `.agents/workflows/comprehensive-search.md` — they're near-duplicates); `angular.mdc` is reference material, `mcp.json` is empty config, and `settings.local.json` is a permissions list, not instructions to follow.

### Tooling / how to run things (AGENTS.md)
- **Always go through Nx, never the underlying tool directly:**
  > "When running tasks (for example build, lint, test, e2e, etc.), always prefer running the task through `nx` (i.e. `nx run`, `nx run-many`, `nx affected`) instead of using the underlying tooling directly"
- **Use the Nx MCP server for workspace understanding:**
  > "When answering questions about the repository, use the `nx_workspace` tool first to gain an understanding of the workspace architecture where applicable."
  > "When working in individual projects, use the `nx_project_details` mcp tool to analyze and understand the specific project structure and dependencies"
- **Don't guess at Nx config — look it up:**
  > "For questions around nx configuration, best practices or if you're unsure, use the `nx_docs` tool to get relevant, up-to-date docs. Always use this instead of assuming things about nx configuration"
- **Check plugin docs when present:** "For Nx plugin best practices, check `node_modules/@nx/<plugin>/PLUGIN.md`. Not all plugins have this file - proceed without it if unavailable."

### Search methodology (AGENTS.md + comprehensive-search.md, duplicated content)
- **Distrust `grep_search` on Windows:**
  > "The built-in `grep_search` tool (ripgrep) can **silently miss files** on Windows, returning no results even for files that clearly contain the search term."
- **Mandated fallback tool and exact invocation:**
  > "Always use `findstr /S` for comprehensive code searches to ensure **all** files are covered" — with example invocations (`findstr /S /N "searchTerm" packages\*.ts`, case-insensitive variant with `/I`, multi-path variant).
- **Escalation rule, stated in both files:** use `grep_search`/ripgrep only for "quick searches where completeness is not critical"; use `findstr /S /N` when completeness matters — explicitly called out for "function/class usage references" (because gitignored plugin code may reference them) and "auditing for security-related patterns across the entire codebase."
- The workflow file adds a `// turbo-all` directive above its steps (a Cursor/agent marker meaning these steps can run without per-step confirmation) — not present in the AGENTS.md copy.

### Permissions, not instructions (`.claude/settings.local.json`)
Not a style/testing/architecture rule, but it does shape agent behavior by pre-approving these Bash patterns without a prompt: `find`, `grep`, `git checkout`, `git add`, `git commit -m *`, `git push`, `gh pr create`, `yarn install`, `yarn why`, `yarn list`, `ls`, `done`, a specific `xargs`/`head` one-liner, `yarn nx build`, `npx tsc`. Notably `git push` and `gh pr create` are pre-allowed — an agent here can push and open PRs without a per-action confirmation gate from this file.

### Code style / commits / testing / architecture: nothing found
There is no rule anywhere in these five files about code style, commit message format, testing strategy or coverage expectations, or architectural conventions. `angular.mdc` contains Angular's own documented best practices as prose (e.g. "Never use `ng` as a selector prefix", "Always use camelCase output names", hydration's server/client DOM-parity constraint) but these are framework documentation, not house rules the maintainers wrote, and the rule is `alwaysApply: false` so it isn't force-fed to every agent turn.

## Conflicts and gaps for my POC

POC plan: add Playwright e2e tests, require `data-testid` on any Angular element a test touches, and write your own `CLAUDE.md`.

**Contradicts:**
- Nothing directly contradicts the plan. The one thing to reconcile: `AGENTS.md` says to always invoke tasks "through `nx`" — so any new Playwright suite should be wired up as an Nx target/executor (`nx run <project>:e2e` or similar) rather than invoked as a bare `npx playwright test`, or it'll be going around the one hard rule these files state.

**Already covers it:**
- Nothing. There is no existing e2e framework rule, no `data-testid`/selector convention, and no existing project `CLAUDE.md` — `.claude/` currently holds only the permissions file, so there's no prior file to merge with or overwrite. Also worth checking whether Nx itself already has an e2e project/target configured elsewhere in the workspace (e.g. Cypress, per `test_cypress.yml` from the earlier workflow inventory) before adding a second, competing e2e setup — that's outside these five files but is a real adjacent gap.

**Would surprise an agent pointed at this repo:**
- `.cursor/rules/angular.mdc` is 713 KB / 14,387 lines of generic Angular docs masquerading as a "rule" — an agent that loads Cursor rules eagerly, or a human skimming `.cursor/rules/` expecting house conventions, would be surprised to find the entire framework manual instead of a testid/selector policy. Worth knowing this file will not stop you from doing anything nonstandard with `data-testid`, since it has no opinion on the topic.
- `.claude/settings.local.json` pre-approves `git push` and `gh pr create` with no scope restriction — an agent operating under Claude Code in this repo can push branches and open PRs without a confirmation prompt from this config (other guardrails outside these files may still apply). Worth being deliberate about before pointing a new agent here for the POC.
- The Windows-`findstr` guidance (in both `AGENTS.md` and the workflow file) is platform-specific and irrelevant on macOS/Linux, but it's the only "always"/"never" methodology rule in the whole set — an agent skimming `AGENTS.md` for "how do I search this repo" gets a Windows-only answer with no equivalent macOS/Linux guidance.
- There is currently no `CLAUDE.md` anywhere in the repo (confirmed: `.claude/` contains only `settings.local.json`), so writing one is additive, not an overwrite — but also means an agent has had zero Claude-specific guidance until now; don't assume undocumented conventions exist that a fresh `CLAUDE.md` needs to preserve.

## What the maintainers appear to already automate with agents

Very little is captured in these five files specifically:
- **Nx-aware assistance**: the repo expects agents to use the Nx MCP server (`nx_workspace`, `nx_project_details`, `nx_docs`) rather than reasoning about the monorepo structure from scratch — implying Nx is treated as the canonical source of truth for project graph/config over manual inspection.
- **A named, reusable "workflow"**: `.agents/workflows/comprehensive-search.md` is written as a step-by-step playbook (with a `// turbo-all` no-confirmation marker) an agent can be pointed at by name for one recurring job — exhaustive search — suggesting the maintainers have started codifying repeatable agent procedures as discrete workflow files rather than one long instructions doc, even though only one such workflow exists today.
- No CI/agent automation, no automated review/commit conventions, and no MCP servers are wired up yet (`.cursor/mcp.json` is empty) — whatever agent automation exists beyond these two conventions is not recorded in `AGENTS.md`/`.claude/`/`.cursor/`/`.agents/workflows/` and would live elsewhere (e.g. the `.github/workflows/` CI inventory already produced separately).
