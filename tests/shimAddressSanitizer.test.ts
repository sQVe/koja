import { expect, it } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

const ghosttyDirectory = (): string => {
  const script = readFileSync(join(root, 'scripts/buildVt.sh'), 'utf8');
  const commit = /^ghostty_commit=(\w+)$/m.exec(script)?.[1];

  if (commit === undefined) {
    throw new Error('scripts/buildVt.sh has no ghostty_commit line.');
  }

  const cache = process.env['XDG_CACHE_HOME'] ?? join(homedir(), '.cache');

  return join(cache, 'koja', `ghostty-${commit}`);
};

it('reads one row without an AddressSanitizer error', () => {
  const directory = ghosttyDirectory();
  const library = join(directory, 'zig-out/lib/libghostty-vt.a');

  expect(Bun.which('clang'), 'clang is missing from PATH').not.toBeNull();
  expect(existsSync(library), `${library} is missing; run bun run build:vt`).toBe(true);

  const work = mkdtempSync(join(tmpdir(), 'koja-asan-'));

  try {
    const executable = join(work, 'driver');
    const commit = directory.slice(directory.lastIndexOf('-') + 1);

    const compile = Bun.spawnSync(
      [
        'clang',
        '-g',
        '-fsanitize=address',
        `-I${join(directory, 'include')}`,
        `-DKOJA_GHOSTTY_COMMIT="${commit}"`,
        join(root, 'src/vt/shim.c'),
        join(root, 'tests/shimAddressSanitizer.c'),
        library,
        '-o',
        executable,
      ],
      { timeout: 20_000 },
    );

    expect(compile.stderr.toString()).toBe('');
    expect(compile.exitCode).toBe(0);

    const run = Bun.spawnSync([executable], { timeout: 20_000 });
    const stderr = run.stderr.toString();

    expect(stderr).not.toContain('AddressSanitizer');
    expect(run.stdout.toString()).toBe('rows=1\n');
    expect(run.exitCode).toBe(0);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}, 60_000);
