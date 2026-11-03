import { describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { PreviewSession } from './previewQueue.ts';

interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

const script = join(import.meta.dir, 'preview.sh');
const bash = Bun.which('bash') ?? '/bin/bash';

const run = async (args: string[], path?: string): Promise<RunResult> => {
  const child = Bun.spawn([bash, script, ...args], {
    ...(path === undefined ? {} : { env: { ...process.env, PATH: path } }),
    stdout: 'pipe',
    stderr: 'pipe',
  });

  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);

  return { code, stdout, stderr };
};

const withTemp = async <T>(body: (root: string) => Promise<T>): Promise<T> => {
  const root = await mkdtemp(join(tmpdir(), 'koja-preview-'));

  try {
    return await body(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
};

const makeFifo = async (path: string): Promise<void> => {
  const child = Bun.spawn(['mkfifo', path], { stdout: 'pipe', stderr: 'pipe' });

  if ((await child.exited) !== 0) {
    throw new Error(`mkfifo failed: ${await new Response(child.stderr).text()}`);
  }
};

// A PATH without GNU timeout, as on stock macOS. The script must use only POSIX tools.
const withoutTimeout = async (root: string): Promise<string> => {
  const bin = join(root, 'bin');

  await mkdir(bin);

  const sleep = Bun.which('sleep');

  if (sleep === null) {
    throw new Error('sleep not found');
  }

  await symlink(sleep, join(bin, 'sleep'));

  return bin;
};

const exists = (path: string): Promise<boolean> =>
  stat(path).then(
    () => true,
    () => false,
  );

const waitFor = async (ready: () => Promise<boolean>, milliseconds: number): Promise<boolean> => {
  const until = Date.now() + milliseconds;

  while (Date.now() < until) {
    if (await ready()) {
      return true;
    }

    await Bun.sleep(20);
  }

  return ready();
};

describe('preview.sh show', () => {
  test('writes the address to a FIFO without a GNU timeout command', async () => {
    await withTemp(async (root) => {
      const fifo = join(root, 'preview.fifo');

      await makeFifo(fifo);

      const path = await withoutTimeout(root);
      const reader = Bun.spawn(['head', '-n', '1', fifo], { stdout: 'pipe', stderr: 'pipe' });
      const result = await run(['show', fifo, 'testsession', '1', 'term-1'], path);

      reader.kill();

      const line = await new Response(reader.stdout).text();

      expect(result.code).toBe(0);
      expect(line.trim()).toBe('testsession 1 term-1');
    });
  });

  test('leaves no child holding its output after a successful write', async () => {
    await withTemp(async (root) => {
      const fifo = join(root, 'preview.fifo');

      await makeFifo(fifo);

      const reader = Bun.spawn(['head', '-n', '1', fifo], { stdout: 'pipe', stderr: 'pipe' });

      const child = Bun.spawn([bash, script, 'show', fifo, 'testsession', '1', 'term-1'], {
        stdout: 'pipe',
        stderr: 'pipe',
      });

      const started = Date.now();
      const code = await child.exited;

      await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text()]);

      const elapsed = Date.now() - started;

      reader.kill();
      await reader.exited;

      expect(code).toBe(0);
      expect(elapsed).toBeLessThan(500);
    });
  });

  test('bounds a write that has no reader', async () => {
    await withTemp(async (root) => {
      const fifo = join(root, 'preview.fifo');

      await makeFifo(fifo);

      const started = Date.now();
      const result = await run(['show', fifo, 'testsession', '1', 'term-1']);

      expect(result.code).not.toBe(0);
      expect(Date.now() - started).toBeLessThan(3_000);
    });
  });

  test('refuses a missing path without creating a file', async () => {
    await withTemp(async (root) => {
      const missing = join(root, 'missing.fifo');
      const result = await run(['show', missing, 'testsession', '1', 'term-1']);

      expect(result.code).not.toBe(0);
      expect(await exists(missing)).toBe(false);
    });
  });
});

const writeToFifo =
  (fifo: string) =>
  async (session: string, sequence: number, address: string | null): Promise<boolean> => {
    const result = await run(['show', fifo, session, String(sequence), address ?? '-']);

    return result.code === 0;
  };

describe('preview.sh serve', () => {
  test('accepts the first selection of a later session', async () => {
    await withTemp(async (root) => {
      const fifo = join(root, 'preview.fifo');
      const log = join(root, 'accepted.log');

      const child = Bun.spawn([bash, script, 'serve', fifo], {
        env: { ...process.env, KOJA_PREVIEW_LOG: log },
        stdout: 'pipe',
        stderr: 'pipe',
      });

      await waitFor(() => exists(fifo), 2_000);

      const first = new PreviewSession(writeToFifo(fifo), () => 'sessionone');

      first.show('term-one');
      await first.settled();
      await first.close(async () => {});

      const second = new PreviewSession(writeToFifo(fifo), () => 'sessiontwo');

      second.show('term-two');
      await second.settled();

      const accepted = await waitFor(async () => {
        const text = await readFile(log, 'utf8').catch(() => '');

        return text.includes('term-two');
      }, 2_000);

      child.kill();
      await child.exited;

      const text = await readFile(log, 'utf8');

      expect(accepted).toBe(true);
      expect(text).toContain('term-one');
      expect(text).toContain('term-two');
    });
  });

  test('creates the FIFO folder and the FIFO', async () => {
    await withTemp(async (root) => {
      const fifo = join(root, 'cache', 'preview.fifo');
      const child = Bun.spawn([bash, script, 'serve', fifo], { stdout: 'pipe', stderr: 'pipe' });

      const made = await waitFor(() => exists(fifo), 2_000);

      child.kill();
      await child.exited;

      expect(made).toBe(true);
      expect((await stat(fifo)).isFIFO()).toBe(true);
    });
  });

  test('ignores a selection older than the clear', async () => {
    await withTemp(async (root) => {
      const fifo = join(root, 'preview.fifo');
      const log = join(root, 'accepted.log');

      const child = Bun.spawn([bash, script, 'serve', fifo], {
        env: { ...process.env, KOJA_PREVIEW_LOG: log },
        stdout: 'pipe',
        stderr: 'pipe',
      });

      await waitFor(() => exists(fifo), 2_000);

      // The clear carries a higher sequence than the selection that arrives after it.
      await run(['show', fifo, 'testsession', '2', '-']);
      await run(['show', fifo, 'testsession', '1', 'term-old']);
      await run(['show', fifo, 'testsession', '3', 'term-new']);

      const accepted = await waitFor(async () => {
        const text = await readFile(log, 'utf8').catch(() => '');

        return text.includes('term-new');
      }, 2_000);

      child.kill();
      await child.exited;

      const text = await readFile(log, 'utf8');

      expect(accepted).toBe(true);
      expect(text).toContain('-\n');
      expect(text).toContain('term-new');
      expect(text).not.toContain('term-old');
    });
  });

  test('ignores a late write from a retired session', async () => {
    await withTemp(async (root) => {
      const fifo = join(root, 'preview.fifo');
      const log = join(root, 'accepted.log');

      const child = Bun.spawn([bash, script, 'serve', fifo], {
        env: { ...process.env, KOJA_PREVIEW_LOG: log },
        stdout: 'pipe',
        stderr: 'pipe',
      });

      await waitFor(() => exists(fifo), 2_000);

      await run(['show', fifo, 'sessionone', '1', 'term-one']);
      await run(['show', fifo, 'sessionone', '2', '-']);
      await run(['show', fifo, 'sessiontwo', '1', 'term-two']);
      await run(['show', fifo, 'sessionone', '9', 'term-late']);

      const accepted = await waitFor(async () => {
        const text = await readFile(log, 'utf8').catch(() => '');

        return text.includes('term-two');
      }, 2_000);

      child.kill();
      await child.exited;

      const text = await readFile(log, 'utf8');

      expect(accepted).toBe(true);
      expect(text).toContain('term-one');
      expect(text).toContain('term-two');
      expect(text).not.toContain('term-late');
    });
  });

  test('refuses a plain file and leaves it alone', async () => {
    await withTemp(async (root) => {
      const path = join(root, 'plain.fifo');

      await writeFile(path, 'keep\n');

      const result = await run(['serve', path]);

      expect(result.code).not.toBe(0);
      expect(await readFile(path, 'utf8')).toBe('keep\n');
    });
  });
});
