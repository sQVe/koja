import { dlopen, FFIType } from 'bun:ffi';
import { expect, it } from 'bun:test';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

interface BuildFixture {
  cache: string;
  project: string;
  source: string;
  build: (path?: string) => { stdout: string; tree: string };
}

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

const createFixture = (work: string, patches: Record<string, string>): BuildFixture => {
  const scriptSource = readFileSync(join(root, 'scripts/buildVt.sh'), 'utf8');
  const commit = /^ghostty_commit=(\w+)$/m.exec(scriptSource)?.[1] ?? '';
  const project = join(work, 'project');
  const cache = join(work, 'cache/koja');
  const source = join(cache, `ghostty-${commit}-source`);
  const zigDirectory = join(cache, 'zig-0.16.0');

  mkdirSync(join(project, 'scripts'), { recursive: true });
  mkdirSync(join(project, 'src/vt'), { recursive: true });
  mkdirSync(join(project, 'patches'), { recursive: true });
  mkdirSync(zigDirectory, { recursive: true });
  copyFileSync(join(root, 'scripts/buildVt.sh'), join(project, 'scripts/buildVt.sh'));
  copyFileSync(join(root, 'src/vt/shim.c'), join(project, 'src/vt/shim.c'));
  writeFileSync(join(zigDirectory, 'zig'), fakeZig, { mode: 0o755 });

  for (const [name, patch] of Object.entries(patches)) {
    writeFileSync(join(project, 'patches', name), patch);
  }

  const build = (path = process.env.PATH ?? ''): { stdout: string; tree: string } => {
    const run = Bun.spawnSync(['bash', join(project, 'scripts/buildVt.sh')], {
      cwd: project,
      env: { ...process.env, PATH: path, XDG_CACHE_HOME: join(work, 'cache') },
    });

    expect(run.stderr.toString()).toBe('');
    expect(run.exitCode).toBe(0);

    return { stdout: run.stdout.toString(), tree: join(project, 'build/ghostty') };
  };

  return { cache, project, source, build };
};

const writeSource = (directory: string): void => {
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, 'one.txt'), 'one\n');
  writeFileSync(join(directory, 'two.txt'), 'two\n');
  expect(Bun.spawnSync(['git', 'init', '-q', directory]).exitCode).toBe(0);
};

const realGit = Bun.which('git') ?? 'git';

// The fake git runs the body before the real git. A body publishes a target, the -C directory
// without its mktemp suffix, as a concurrent build would.
const pathWithFakeGit = (work: string, body: string): string => {
  const bin = join(work, 'bin');

  mkdirSync(bin, { recursive: true });

  writeFileSync(
    join(bin, 'git'),
    `#!/usr/bin/env bash
target="\${2%.*}"
${body}
exec ${realGit} "$@"
`,
    { mode: 0o755 },
  );

  return `${bin}:${process.env.PATH ?? ''}`;
};

const temporaryEntries = (cache: string): string[] =>
  readdirSync(cache).filter((entry) => /^ghostty-.*\.\w{6}$/.test(entry));

const read = (tree: string, file: string): string => readFileSync(join(tree, file), 'utf8');

it('builds in a tree that holds only the current patches', () => {
  const work = mkdtempSync(join(tmpdir(), 'koja-build-vt-'));

  try {
    const fixture = createFixture(work, {
      '0001-one.patch': patchFor('one.txt', 'one', 'ONE'),
      '0002-two.patch': patchFor('two.txt', 'two', 'TWO'),
    });

    writeSource(fixture.source);

    const first = fixture.build();

    expect(first.stdout).toContain('applied 0001-one.patch');
    expect(read(first.tree, 'one.txt')).toBe('ONE\n');
    expect(read(first.tree, 'two.txt')).toBe('TWO\n');

    rmSync(join(fixture.project, 'patches/0002-two.patch'));

    const second = fixture.build();

    expect(read(second.tree, 'one.txt')).toBe('ONE\n');
    expect(read(second.tree, 'two.txt')).toBe('two\n');

    const third = fixture.build();

    expect(third.stdout).not.toContain('applied');
    expect(read(third.tree, 'two.txt')).toBe('two\n');
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}, 30_000);

it('builds an unpatched tree when the last patch is removed', () => {
  const work = mkdtempSync(join(tmpdir(), 'koja-build-vt-'));

  try {
    const fixture = createFixture(work, { '0001-one.patch': patchFor('one.txt', 'one', 'ONE') });

    writeSource(fixture.source);
    fixture.build();
    rmSync(join(fixture.project, 'patches/0001-one.patch'));

    const unpatched = fixture.build();

    expect(unpatched.stdout).not.toContain('applied');
    expect(read(unpatched.tree, 'one.txt')).toBe('one\n');
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}, 30_000);

it('uses the tree another build published first', () => {
  const work = mkdtempSync(join(tmpdir(), 'koja-build-vt-'));

  try {
    const fixture = createFixture(work, { '0001-one.patch': patchFor('one.txt', 'one', 'ONE') });

    writeSource(fixture.source);

    const path = pathWithFakeGit(
      work,
      'if [[ "$3" == apply ]]; then mkdir -p "$target" && echo published > "$target/marker"; fi',
    );

    const raced = fixture.build(path);

    expect(read(raced.tree, 'marker')).toBe('published\n');
    expect(temporaryEntries(fixture.cache)).toEqual([]);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}, 30_000);

it('uses the source another build fetched first', () => {
  const work = mkdtempSync(join(tmpdir(), 'koja-build-vt-'));

  try {
    const fixture = createFixture(work, { '0001-one.patch': patchFor('one.txt', 'one', 'ONE') });

    const path = pathWithFakeGit(
      work,
      `if [[ "$3" == fetch ]]; then
  mkdir -p "$target" && echo one > "$target/one.txt" && echo two > "$target/two.txt"
  exit 0
elif [[ "$3" == checkout ]]; then
  exit 0
fi`,
    );

    const raced = fixture.build(path);

    expect(read(raced.tree, 'one.txt')).toBe('ONE\n');
    expect(readdirSync(fixture.source).toSorted()).toEqual(['one.txt', 'two.txt']);
    expect(temporaryEntries(fixture.cache)).toEqual([]);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}, 30_000);
