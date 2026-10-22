import { expect, onTestFinished } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface LintRun {
  status: number | null;
  signal: NodeJS.Signals | null;
  error: Error | undefined;
  stdout: string;
}

export interface LintDiagnostic {
  path: string;
  line: number;
  rule: string;
}

interface LintFixture {
  file: string;
  lines: string[];
}

export interface LintProjectRun extends LintRun {
  project: string;
  diagnostics: LintDiagnostic[];
}

interface LintProjectOptions {
  project: string;
  script: string;
  files: LintFixture[];
  rules: string[];
  env?: Record<string, string>;
}

const root = fileURLToPath(new URL('../', import.meta.url));

export const runLint = (
  script: string,
  target: string,
  options: { args?: string[]; env?: Record<string, string> } = {},
): LintRun => {
  const result = spawnSync(process.execPath, ['run', script, target, ...(options.args ?? [])], {
    cwd: root,
    env: { ...process.env, ...options.env },
    encoding: 'utf8',
    timeout: 20_000,
  });

  return {
    status: result.status,
    signal: result.signal,
    error: result.error,
    stdout: result.stdout,
  };
};

// The linter prints a path relative to its working directory when the file sits below it.
const parseDiagnostic = (line: string, rules: string[]): LintDiagnostic | undefined => {
  const rule = rules.find((candidate) => line.includes(candidate));
  const [, path, lineNumber] = line.match(/^(.+?):(\d+):\d+:/) ?? [];

  if (rule === undefined) {
    return undefined;
  }

  // A matching line without a location stays a diagnostic, so no count or edge comparison skips it.
  if (path === undefined || lineNumber === undefined) {
    return { path: line, line: 0, rule };
  }

  return { path: resolve(root, path), line: Number(lineNumber), rule };
};

// Returns the project root, which sits in a temporary directory below the given directories. The
// temporary directory is removed when the test finishes.
export const temporaryProject = async (...subpath: string[]): Promise<string> => {
  const directory = await mkdtemp(join(tmpdir(), 'koja-lint-'));
  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const project = join(directory, ...subpath);
  await mkdir(project, { recursive: true });

  return project;
};

export const lintProject = async (options: LintProjectOptions): Promise<LintProjectRun> => {
  const { project } = options;
  await writeFile(join(project, 'package.json'), '{}\n');

  for (const { file, lines } of options.files) {
    const path = join(project, file);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, `${lines.join('\n')}\n`);
  }

  // The linter picks its default output format from the environment. One line per diagnostic keeps
  // the paths readable.
  const run = runLint(options.script, project, {
    args: ['--format', 'unix'],
    ...(options.env === undefined ? {} : { env: options.env }),
  });

  const diagnostics = run.stdout
    .split('\n')
    .map((line) => parseDiagnostic(line, options.rules))
    .filter((diagnostic) => diagnostic !== undefined);

  return { ...run, project, diagnostics };
};

export const expectDiagnosticCounts = (
  run: LintProjectRun,
  counts: Record<string, number>,
): void => {
  for (const [file, count] of Object.entries(counts)) {
    const found = run.diagnostics.filter(
      (diagnostic) => diagnostic.path === join(run.project, file),
    );

    expect({ file, diagnostics: found.length }).toEqual({ file, diagnostics: count });
  }
};
