// scripts/lib/self-check.mjs
import { existsSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export function resolveChangedProjects(changedFiles) {
  const pairs = [];
  for (const file of changedFiles) {
    if (!file) continue;
    let dir = dirname(file);
    while (dir !== '.' && !existsSync(`${dir}/project.json`)) {
      dir = dirname(dir);
    }
    if (existsSync(`${dir}/project.json`)) {
      const name = JSON.parse(readFileSync(`${dir}/project.json`, 'utf8')).name;
      pairs.push({ project: name, file });
    }
    // A file resolving to no project.json ancestor (e.g. under openspec/) is silently
    // skipped — matches agent-implement.yml's own behavior exactly (Review Focus item:
    // this is exercised on every real run, since every ticket touches openspec/ files).
  }
  const projects = [...new Set(pairs.map((p) => p.project))];
  return { pairs, projects };
}

// Integration-only — not unit-testable without actually running Nx against the real
// workspace. Ports agent-implement.yml:739-844: typecheck/build run-many across every
// changed project at once, then lint per-project scoped to only that project's own
// changed, still-existing files.
export async function runSelfCheck(pairs, projects, { defaultBranch = 'develop', outputLines = [] } = {}) {
  if (projects.length === 0) {
    return { passed: true, failureClass: null, output: outputLines.join('\n') };
  }

  const projectsCsv = projects.join(',');
  let buildExit = 0;
  try {
    await execFileAsync(
      'node',
      ['--max-old-space-size=8192', './node_modules/nx/bin/nx.js', 'run-many', '--target=typecheck,build', `--projects=${projectsCsv}`],
      { maxBuffer: 1024 * 1024 * 500 }
    );
  } catch (err) {
    outputLines.push('::warning::self-check build/typecheck failed — retrying once (nx cache skips finished deps)');
    outputLines.push(err.stdout ?? '', err.stderr ?? '');
    try {
      await execFileAsync(
        'node',
        ['--max-old-space-size=8192', './node_modules/nx/bin/nx.js', 'run-many', '--target=typecheck,build', `--projects=${projectsCsv}`],
        { maxBuffer: 1024 * 1024 * 500 }
      );
    } catch (err2) {
      buildExit = err2.code ?? 1;
      outputLines.push(err2.stdout ?? '', err2.stderr ?? '');
    }
  }

  let lintExit = 0;
  for (const project of projects) {
    let hasLintTarget = false;
    try {
      const { stdout } = await execFileAsync('npx', ['nx', 'show', 'project', project, '--json']);
      const parsed = JSON.parse(stdout);
      hasLintTarget = Boolean(parsed.targets && 'lint' in parsed.targets);
    } catch { /* treat as no lint target */ }

    if (!hasLintTarget) {
      outputLines.push(`Skipping ${project}:lint — this project defines no lint target.`);
      continue;
    }

    const files = pairs.filter((p) => p.project === project).map((p) => p.file).filter((f) => existsSync(f));
    if (files.length === 0) {
      outputLines.push(`Skipping ${project}:lint — its only changed file(s) were deletions.`);
      continue;
    }

    const lintArgs = ['nx', 'run', `${project}:lint`, ...files.map((f) => `--lintFilePatterns=${f}`)];
    try {
      await execFileAsync('npx', lintArgs, { maxBuffer: 1024 * 1024 * 500 });
    } catch (err) {
      lintExit = err.code ?? 1;
      outputLines.push(err.stdout ?? '', err.stderr ?? '');
    }
  }

  if (buildExit !== 0 || lintExit !== 0) {
    return {
      passed: false,
      failureClass: buildExit !== 0 ? 'self-check-build' : 'self-check-lint',
      output: outputLines.join('\n'),
    };
  }
  return { passed: true, failureClass: null, output: outputLines.join('\n') };
}
