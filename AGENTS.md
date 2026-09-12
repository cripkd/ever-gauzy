<!-- nx configuration start-->
<!-- Leave the start & end comments to automatically receive updates. -->

## General Guidelines for working with Nx

- For navigating/exploring the workspace, invoke the `nx-workspace` skill first - it has patterns for querying projects, targets, and dependencies
- When running tasks (for example build, lint, test, e2e, etc.), always prefer running the task through `nx` (i.e. `nx run`, `nx run-many`, `nx affected`) instead of using the underlying tooling directly
- Prefix nx commands with the workspace's package manager (e.g., `pnpm nx build`, `npm exec nx test`) - avoids using globally installed CLI
- You have access to the Nx MCP server and its tools, use them to help the user
- For Nx plugin best practices, check `node_modules/@nx/<plugin>/PLUGIN.md`. Not all plugins have this file - proceed without it if unavailable.
- NEVER guess CLI flags - always check nx_docs or `--help` first when unsure

## Scaffolding & Generators

- For scaffolding tasks (creating apps, libs, project structure, setup), ALWAYS invoke the `nx-generate` skill FIRST before exploring or calling MCP tools

## When to use nx_docs

- USE for: advanced config options, unfamiliar flags, migration guides, plugin configuration, edge cases
- DON'T USE for: basic generator syntax (`nx g @nx/react:app`), standard commands, things you already know
- The `nx-generate` skill handles generator discovery internally - don't call nx_docs just to look up generator syntax

<!-- nx configuration end-->

# File Search on Windows

> **IMPORTANT**: The built-in `grep_search` tool (ripgrep) can **silently miss files** on Windows, returning no results even for files that clearly contain the search term. This may be related to workspace paths with spaces, long paths, or other Windows-specific issues. Always verify critical searches with `findstr /S`.

## Recommended Approach

Always use `findstr /S` for comprehensive code searches to ensure **all** files are covered:

```powershell
# Search recursively in all .ts files under packages/
findstr /S /N "searchTerm" packages\*.ts

# Search with case-insensitivity
findstr /S /N /I "searchterm" packages\*.ts

# Search across all source files
findstr /S /N "searchTerm" packages\*.ts apps\*.ts
```

## When to Use Each Tool

| Tool            | Use When                                                           |
| --------------- | ------------------------------------------------------------------ |
| `grep_search`   | Quick searches — but always verify critical results with `findstr` |
| `findstr /S /N` | **Comprehensive searches** where completeness is essential         |
| `find_by_name`  | Finding files by name/pattern                                      |
