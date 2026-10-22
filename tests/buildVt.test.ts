import { dlopen, FFIType } from 'bun:ffi';
import { expect, it } from 'bun:test';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const library = join(root, 'build/libkoja-vt.so');

it('builds a shim library that creates and frees a pane', () => {
  expect(existsSync(library)).toBe(true);

  const { symbols, close } = dlopen(library, {
    pane_new: { args: [FFIType.u16, FFIType.u16, FFIType.u64], returns: FFIType.ptr },
    pane_free: { args: [FFIType.ptr], returns: FFIType.void },
  });

  const pane = symbols.pane_new(80, 24, 0);

  expect(pane).not.toBeNull();

  symbols.pane_free(pane);
  close();
});

const patchFor = (file: string, before: string, after: string): string =>
  `--- a/${file}\n+++ b/${file}\n@@ -1 +1 @@\n-${before}\n+${after}\n`;

const fakeZig = `#!/usr/bin/env bash
if [[ "$1" == build ]]; then
  mkdir -p zig-out/lib
  touch zig-out/lib/libghostty-vt.a
elif [[ "$1" == cc ]]; then
  while [[ "$#" -gt 0 ]]; do
    if [[ "$1" == -o ]]; then touch "$2"; fi
    shift
  done
fi
`;

it('builds in a tree that holds only the current patches', () => {
  const work = mkdtempSync(join(tmpdir(), 'koja-build-vt-'));

  try {
    const scriptSource = readFileSync(join(root, 'scripts/buildVt.sh'), 'utf8');
    const commit = /^ghostty_commit=(\w+)$/m.exec(scriptSource)?.[1] ?? '';
    const project = join(work, 'project');
    const cache = join(work, 'cache');
    const source = join(cache, 'koja', `ghostty-${commit}-source`);
    const zigDirectory = join(cache, 'koja/zig-0.16.0');

    mkdirSync(join(project, 'scripts'), { recursive: true });
    mkdirSync(join(project, 'src/vt'), { recursive: true });
    mkdirSync(join(project, 'patches'), { recursive: true });
    mkdirSync(source, { recursive: true });
    mkdirSync(zigDirectory, { recursive: true });
    copyFileSync(join(root, 'scripts/buildVt.sh'), join(project, 'scripts/buildVt.sh'));
    copyFileSync(join(root, 'src/vt/shim.c'), join(project, 'src/vt/shim.c'));
    writeFileSync(join(project, 'patches/0001-one.patch'), patchFor('one.txt', 'one', 'ONE'));
    writeFileSync(join(project, 'patches/0002-two.patch'), patchFor('two.txt', 'two', 'TWO'));
    writeFileSync(join(source, 'one.txt'), 'one\n');
    writeFileSync(join(source, 'two.txt'), 'two\n');
    writeFileSync(join(zigDirectory, 'zig'), fakeZig, { mode: 0o755 });
    expect(Bun.spawnSync(['git', 'init', '-q', source]).exitCode).toBe(0);

    const build = (): { stdout: string; one: string; two: string } => {
      const run = Bun.spawnSync(['bash', join(project, 'scripts/buildVt.sh')], {
        cwd: project,
        env: { ...process.env, XDG_CACHE_HOME: cache },
      });

      expect(run.stderr.toString()).toBe('');
      expect(run.exitCode).toBe(0);

      const tree = join(project, 'build/ghostty');

      return {
        stdout: run.stdout.toString(),
        one: readFileSync(join(tree, 'one.txt'), 'utf8'),
        two: readFileSync(join(tree, 'two.txt'), 'utf8'),
      };
    };

    const first = build();

    expect(first.stdout).toContain('applied 0001-one.patch');
    expect(first.one).toBe('ONE\n');
    expect(first.two).toBe('TWO\n');

    rmSync(join(project, 'patches/0002-two.patch'));

    const second = build();

    expect(second.one).toBe('ONE\n');
    expect(second.two).toBe('two\n');

    const third = build();

    expect(third.stdout).not.toContain('applied');
    expect(third.two).toBe('two\n');
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}, 30_000);
