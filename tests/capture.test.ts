import { describe, expect, test } from 'bun:test';
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';

import type { Box, CaptureContext, Images, Size } from '../scripts/capture.ts';
import {
  capture,
  cropBox,
  cropFits,
  cropGeometry,
  publishCapture,
  runUnderLock,
} from '../scripts/capture.ts';
import { sceneReadyLine } from '../src/mods/koja-mocks/catalog.ts';

interface FakeSandboxOptions {
  images?: Images;
  logs?: string[] | ((read: number) => string);
  onShot?: (path: string) => Promise<void> | void;
  waitMilliseconds?: number;
}

type Overlays = string[] | (() => string[]);

const runCapture = async (args: string[]) => {
  const script = join(import.meta.dir, '..', 'scripts', 'capture.ts');

  const child = Bun.spawn([process.execPath, script, ...args], {
    stdout: 'pipe',
    stderr: 'pipe',
  });

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);

  return { exitCode, output: stdout + stderr };
};

const fileExists = async (path: string): Promise<boolean> =>
  stat(path).then(
    () => true,
    () => false,
  );

const outputFiles = ['shot.png', 'crop.png', 'capture.json'];

const failureMessageOf = (run: Promise<void>): Promise<string> =>
  run.then(
    () => 'no error',
    (error: unknown) => (error instanceof Error ? error.message : String(error)),
  );

const anyOutputExists = async (folder: string): Promise<boolean> => {
  const existing = await Promise.all(outputFiles.map((file) => fileExists(join(folder, file))));

  return existing.includes(true);
};

const writeCaptureFiles = async (folder: string, label: string): Promise<void> => {
  await mkdir(folder, { recursive: true });

  await Promise.all(outputFiles.map((file) => writeFile(join(folder, file), `${label} ${file}`)));
};

const readCaptureFiles = async (folder: string): Promise<Record<string, Buffer>> =>
  Object.fromEntries(
    await Promise.all(
      outputFiles.map(async (file) => [file, await readFile(join(folder, file))] as const),
    ),
  );

const expectSameCapture = (
  actual: Record<string, Buffer>,
  expected: Record<string, Buffer>,
): void => {
  for (const file of outputFiles) {
    const current = actual[file];
    const original = expected[file];

    if (current === undefined || original === undefined) {
      throw new Error(`The ${file} capture file is missing.`);
    }

    expect(current.equals(original)).toBe(true);
  }
};

const stagingFolder = async (folder: string): Promise<string> => {
  const parent = dirname(folder);

  await mkdir(parent, { recursive: true });

  return mkdtemp(join(parent, `.${basename(folder)}-staging-`));
};

const siblingFolders = async (folder: string, label: string): Promise<string[]> => {
  const parent = dirname(folder);
  const prefix = `.${basename(folder)}-${label}-`;
  const entries = await readdir(parent);

  return entries.filter((entry) => entry.startsWith(prefix)).map((entry) => join(parent, entry));
};

const defaultShotSize: Size = { width: 800, height: 600 };

const fakeImages = (shot: Size = defaultShotSize) => {
  const crops: { box: Box; target: string }[] = [];

  const images: Images = {
    size: async () => shot,
    crop: async (_shot, box, target) => {
      crops.push({ box, target });
      await writeFile(target, `crop ${cropGeometry(box)}`);
    },
  };

  return { crops, images };
};

const fakeContext = (overlays: Overlays = [], options: FakeSandboxOptions = {}) => {
  const commands: string[][] = [];
  let logReads = 0;
  let statusReads = 0;

  const readLog = (): string => {
    const source = options.logs;
    const read = logReads;

    logReads += 1;

    if (typeof source === 'function') {
      return source(read);
    }

    return source?.[read] ?? '';
  };

  const context: CaptureContext = {
    sandbox: {
      run: async (args) => {
        commands.push(args);

        if (args[0] === 'log') {
          return readLog();
        }

        if (args[0] === 'shot') {
          await options.onShot?.(args[1] ?? '');
        }

        return '';
      },
      status: async () => {
        statusReads += 1;

        return {
          zoom: 1,
          overlays: typeof overlays === 'function' ? overlays() : overlays,
        };
      },
    },
    pickerSettleMilliseconds: 0,
    waitMilliseconds: options.waitMilliseconds ?? 0,
    images: options.images ?? fakeImages().images,
  };

  return { commands, context, logReads: () => logReads, statusReads: () => statusReads };
};

const statusSequence = (...states: string[][]): (() => string[]) => {
  let index = 0;

  return () => {
    const state = states[Math.min(index, states.length - 1)] ?? [];

    index += 1;

    return state;
  };
};

const writeShot = async (path: string): Promise<void> => {
  await writeFile(path, 'shot bytes');
};

const herdrLogPrefix =
  '\u001b[2m2026-11-23T07:35:27.254072Z\u001b[0m \u001b[32m INFO\u001b[0m \u001b[2mgpui_shell::script\u001b[0m\u001b[2m:\u001b[0m ';

const successContext = (options: FakeSandboxOptions = {}) => {
  const ready = sceneReadyLine('sidebar');

  return fakeContext(statusSequence([], ['koja-mocks'], ['koja-mocks'], [], []), {
    logs: ['earlier\n', `earlier\n${herdrLogPrefix}${ready}\n`],
    ...options,
  });
};

const sceneOrigin = { x: 20, y: 40 };
const sidebarSize = { width: 250, height: 512 };

describe('mock:capture', () => {
  test('a scene runs the capture script under the sandbox lock with the lock held', async () => {
    const root = await mkdtemp(join(tmpdir(), 'koja-capture-'));
    const recorded = join(root, 'recorded.txt');
    const sandbox = join(root, 'sandbox');
    const folder = join(root, 'judge', 'sidebar');

    await writeFile(
      sandbox,
      `#!/bin/sh\nprintf '%s\\n' "$@" > '${recorded}'\nprintf 'held=%s\\n' "$KOJA_CAPTURE_LOCK_HELD" >> '${recorded}'\n`,
    );

    await chmod(sandbox, 0o755);

    try {
      const exitCode = await runUnderLock(['sidebar', folder], sandbox);
      const lines = (await readFile(recorded, 'utf8')).trim().split('\n');
      const captureScript = join(import.meta.dir, '..', 'scripts', 'capture.ts');

      expect(exitCode).toBe(0);
      expect(lines).toEqual(['lock', process.execPath, captureScript, 'sidebar', folder, 'held=1']);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test('an unknown scene name exits 1, names the scene, and creates no folder', async () => {
    const root = await mkdtemp(join(tmpdir(), 'koja-capture-'));
    const folder = join(root, 'judge', 'no-such-scene');

    try {
      const result = await runCapture(['no-such-scene', folder]);

      expect(result.exitCode).toBe(1);
      expect(result.output).toContain('no-such-scene');

      expect(await fileExists(folder)).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test('an already open koja-mocks overlay fails the capture and sends no mod.open and writes no file', async () => {
    const root = await mkdtemp(join(tmpdir(), 'koja-capture-'));
    const folder = join(root, 'judge', 'sidebar');
    const { commands, context } = fakeContext(['koja-mocks']);

    try {
      const message = await failureMessageOf(capture(['sidebar', folder], context));

      expect(message).toContain('already open');

      expect(commands).toEqual([]);

      expect(await anyOutputExists(folder)).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test('a picker that never opens fails the capture, sends no Escape, and writes no file', async () => {
    const root = await mkdtemp(join(tmpdir(), 'koja-capture-'));
    const folder = join(root, 'judge', 'sidebar');
    const { commands, context } = fakeContext([]);

    try {
      const message = await failureMessageOf(capture(['sidebar', folder], context));

      expect(message).toContain('did not open');

      expect(commands).toContainEqual(['do', 'mod.open', '--name', 'koja-mocks']);
      expect(commands).not.toContainEqual(['key', 'Escape']);

      expect(await anyOutputExists(folder)).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test('a successful capture replaces all three files as a set and names the requested scene', async () => {
    const root = await mkdtemp(join(tmpdir(), 'koja-capture-'));
    const folder = join(root, 'judge', 'sidebar');
    const { crops, images } = fakeImages();
    const { commands, context } = successContext({ images, onShot: writeShot });

    try {
      await mkdir(folder, { recursive: true });

      await Promise.all(outputFiles.map((file) => writeFile(join(folder, file), `old ${file}`)));

      await capture(['sidebar', folder], context);

      const record = JSON.parse(await readFile(join(folder, 'capture.json'), 'utf8')) as {
        scene: string;
      };

      expect(record.scene).toBe('sidebar');

      for (const file of outputFiles) {
        const content = await readFile(join(folder, file));

        expect(content.equals(Buffer.from(`old ${file}`))).toBe(false);
      }

      const shotPath = commands.find(([command]) => command === 'shot')?.[1];

      if (shotPath === undefined) {
        throw new Error('The capture took no shot.');
      }

      expect(dirname(shotPath)).not.toBe(folder);
      expect(crops.map((crop) => crop.box)).toEqual([{ x: 20, y: 40, width: 250, height: 512 }]);
      expect(dirname(crops[0]?.target ?? '')).not.toBe(folder);
      expect((await readdir(folder)).toSorted()).toEqual([...outputFiles].toSorted());
      expect(await readdir(dirname(folder))).toEqual(['sidebar']);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test('a capture with no ready line fails, names the scene, closes the overlay, and leaves earlier files and no staging folder', async () => {
    const root = await mkdtemp(join(tmpdir(), 'koja-capture-'));
    const folder = join(root, 'judge', 'sidebar');

    const { commands, context } = fakeContext(
      statusSequence([], ['koja-mocks'], ['koja-mocks'], []),
      { logs: ['earlier\n', 'earlier\n'] },
    );

    try {
      await mkdir(folder, { recursive: true });

      await Promise.all(outputFiles.map((file) => writeFile(join(folder, file), `old ${file}`)));

      const before = await Promise.all(
        outputFiles.map(async (file) => [file, await readFile(join(folder, file))] as const),
      );

      const message = await failureMessageOf(capture(['sidebar', folder], context));

      expect(message).toContain('sidebar');
      expect(commands).toContainEqual(['key', 'Escape']);
      expect(commands.filter(([command]) => command === 'shot')).toEqual([]);

      for (const [file, original] of before) {
        expect((await readFile(join(folder, file))).equals(original)).toBe(true);
      }

      expect(await readdir(dirname(folder))).toEqual(['sidebar']);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test('a ready line written on a later poll satisfies the wait', async () => {
    const root = await mkdtemp(join(tmpdir(), 'koja-capture-'));
    const folder = join(root, 'judge', 'sidebar');
    const ready = sceneReadyLine('sidebar');

    const { context } = successContext({
      logs: (read) => (read === 0 ? 'earlier\n' : `earlier\n${herdrLogPrefix}${ready}\n`),
      onShot: writeShot,
      waitMilliseconds: 2000,
    });

    try {
      await capture(['sidebar', folder], context);

      expect(await fileExists(join(folder, 'capture.json'))).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test('a ready line for sidebar-inbox does not satisfy a wait for sidebar', async () => {
    const root = await mkdtemp(join(tmpdir(), 'koja-capture-'));
    const folder = join(root, 'judge', 'sidebar');
    const otherReady = sceneReadyLine('sidebar-inbox');

    const { commands, context } = fakeContext(
      statusSequence([], ['koja-mocks'], ['koja-mocks'], []),
      { logs: ['earlier\n', `earlier\n${herdrLogPrefix}${otherReady}\n`] },
    );

    try {
      const message = await failureMessageOf(capture(['sidebar', folder], context));

      expect(message).toContain('sidebar');
      expect(commands.filter(([command]) => command === 'shot')).toEqual([]);
      expect(await fileExists(folder)).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test('a ready line written before the baseline does not satisfy the wait', async () => {
    const root = await mkdtemp(join(tmpdir(), 'koja-capture-'));
    const folder = join(root, 'judge', 'sidebar');
    const ready = sceneReadyLine('sidebar');

    const { commands, context } = fakeContext(
      statusSequence([], ['koja-mocks'], ['koja-mocks'], []),
      { logs: [`earlier\n${ready}\n`, `earlier\n${ready}\n`] },
    );

    try {
      const message = await failureMessageOf(capture(['sidebar', folder], context));

      expect(message).toContain('sidebar');
      expect(commands.filter(([command]) => command === 'shot')).toEqual([]);
      expect(await fileExists(folder)).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test('a non-file at each output name fails before driving the sandbox and leaves no staging folder', async () => {
    for (const blockedFile of outputFiles) {
      const root = await mkdtemp(join(tmpdir(), 'koja-capture-'));
      const folder = join(root, 'judge', 'sidebar');

      try {
        await mkdir(folder, { recursive: true });

        const blocked = join(folder, blockedFile);

        await mkdir(blocked);
        await writeFile(join(blocked, 'keep.txt'), 'keep');

        const { commands, context, logReads, statusReads } = successContext({
          onShot: writeShot,
        });

        const message = await failureMessageOf(capture(['sidebar', folder], context));

        expect(message).toContain(blocked);
        expect(commands).toEqual([]);
        expect(logReads()).toBe(0);
        expect(statusReads()).toBe(0);
        expect(await siblingFolders(folder, 'staging')).toEqual([]);
        expect(await readFile(join(blocked, 'keep.txt'), 'utf8')).toBe('keep');
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    }
  });
});

describe('publishCapture', () => {
  test('a failed rename restores the earlier capture files and removes the staging and backup folders', async () => {
    for (const failedFile of outputFiles) {
      const root = await mkdtemp(join(tmpdir(), 'koja-publish-'));
      const folder = join(root, 'judge', 'sidebar');

      try {
        await writeCaptureFiles(folder, 'old');

        const staging = await stagingFolder(folder);

        await writeCaptureFiles(staging, 'new');

        const before = await readCaptureFiles(folder);

        const failure = await failureMessageOf(
          publishCapture(staging, folder, async (from, to) => {
            if (from === join(staging, failedFile) && to === join(folder, failedFile)) {
              throw new Error('publish failed');
            }

            await rename(from, to);
          }),
        );

        expect(failure).toContain('publish failed');
        expectSameCapture(await readCaptureFiles(folder), before);
        expect(await readdir(dirname(folder))).toEqual(['sidebar']);
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    }
  });

  test('a failed rename leaves no capture files when the folder had none before', async () => {
    for (const failedFile of outputFiles) {
      const root = await mkdtemp(join(tmpdir(), 'koja-publish-'));
      const folder = join(root, 'judge', 'sidebar');

      try {
        const staging = await stagingFolder(folder);

        await writeCaptureFiles(staging, 'new');

        const failure = await failureMessageOf(
          publishCapture(staging, folder, async (from, to) => {
            if (from === join(staging, failedFile) && to === join(folder, failedFile)) {
              throw new Error('publish failed');
            }

            await rename(from, to);
          }),
        );

        expect(failure).toContain('publish failed');
        expect(await anyOutputExists(folder)).toBe(false);
        expect(await readdir(dirname(folder))).toEqual(['sidebar']);
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    }
  });

  test('a failed backup rename leaves every earlier capture file in place', async () => {
    for (const failedFile of outputFiles) {
      const root = await mkdtemp(join(tmpdir(), 'koja-publish-'));
      const folder = join(root, 'judge', 'sidebar');

      try {
        await writeCaptureFiles(folder, 'old');

        const staging = await stagingFolder(folder);
        const backupPrefix = `.${basename(folder)}-backup-`;

        await writeCaptureFiles(staging, 'new');

        const before = await readCaptureFiles(folder);

        const failure = await failureMessageOf(
          publishCapture(staging, folder, async (from, to) => {
            const targetFolder = basename(dirname(to));

            if (basename(from) === failedFile && targetFolder.startsWith(backupPrefix)) {
              throw new Error('backup failed');
            }

            await rename(from, to);
          }),
        );

        expect(failure).toContain('backup failed');
        expectSameCapture(await readCaptureFiles(folder), before);
        expect(await readdir(dirname(folder))).toEqual(['sidebar']);
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    }
  });

  test('a non-file at an output name is refused without moving or deleting anything', async () => {
    for (const blockedFile of outputFiles) {
      const root = await mkdtemp(join(tmpdir(), 'koja-publish-'));
      const folder = join(root, 'judge', 'sidebar');

      try {
        await writeCaptureFiles(folder, 'old');

        const blocked = join(folder, blockedFile);

        await rm(blocked);
        await mkdir(blocked);
        await writeFile(join(blocked, 'keep.txt'), 'keep');

        const staging = await stagingFolder(folder);

        await writeCaptureFiles(staging, 'new');

        const failure = await failureMessageOf(publishCapture(staging, folder));

        expect(failure).toContain(blocked);
        expect(await readFile(join(blocked, 'keep.txt'), 'utf8')).toBe('keep');

        for (const file of outputFiles) {
          if (file !== blockedFile) {
            expect(await readFile(join(folder, file), 'utf8')).toBe(`old ${file}`);
          }
        }

        expect(await siblingFolders(folder, 'staging')).toEqual([]);
        expect(await siblingFolders(folder, 'backup')).toEqual([]);
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    }
  });

  test.skipIf(process.getuid?.() === 0)(
    'a read-only target folder leaves the earlier capture and removes staging and backup',
    async () => {
      const root = await mkdtemp(join(tmpdir(), 'koja-publish-'));
      const folder = join(root, 'judge', 'sidebar');

      try {
        await writeCaptureFiles(folder, 'old');

        const before = await readCaptureFiles(folder);

        await chmod(folder, 0o555);

        const { context } = successContext({ onShot: writeShot });
        const failure = await failureMessageOf(capture(['sidebar', folder], context));

        expect(failure).toContain(folder);
        expectSameCapture(await readCaptureFiles(folder), before);
        expect(await siblingFolders(folder, 'staging')).toEqual([]);
        expect(await siblingFolders(folder, 'backup')).toEqual([]);
      } finally {
        await chmod(folder, 0o755).catch(() => undefined);
        await rm(root, { recursive: true, force: true });
      }
    },
  );

  test('a failed restore keeps both folders and names them in the error', async () => {
    const root = await mkdtemp(join(tmpdir(), 'koja-publish-'));
    const folder = join(root, 'judge', 'sidebar');

    try {
      await writeCaptureFiles(folder, 'old');

      const staging = await stagingFolder(folder);
      const backupPrefix = `.${basename(folder)}-backup-`;

      await writeCaptureFiles(staging, 'new');

      const failure = await failureMessageOf(
        publishCapture(staging, folder, async (from, to) => {
          if (from === join(staging, 'crop.png') && to === join(folder, 'crop.png')) {
            throw new Error('publish failed');
          }

          const parent = basename(dirname(from));

          if (parent.startsWith(backupPrefix) && basename(from) === 'shot.png') {
            throw new Error('restore failed');
          }

          await rename(from, to);
        }),
      );

      const backups = await siblingFolders(folder, 'backup');
      const backup = backups[0];

      if (backup === undefined) {
        throw new Error('The backup folder was removed.');
      }

      expect(failure).toContain(backup);
      expect(failure).toContain(staging);
      expect(failure).toContain('restore failed');
      expect(await fileExists(join(backup, 'shot.png'))).toBe(true);
      expect(await fileExists(join(staging, 'crop.png'))).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe('cropBox', () => {
  test('scales the scene point and size, rounds to whole pixels, and formats the geometry at scale 1.25', () => {
    const box = cropBox(sceneOrigin, sidebarSize, 1.25);

    expect(box).toEqual({ x: 25, y: 50, width: 313, height: 640 });
    expect(cropGeometry(box)).toBe('313x640+25+50');
  });

  test('a box inside the shot fits, and a box past its right edge does not', () => {
    const shot = { width: 1280, height: 820 };

    expect(cropFits(cropBox(sceneOrigin, sidebarSize, 1), shot)).toBe(true);
    expect(cropFits({ x: 1200, y: 40, width: 250, height: 512 }, shot)).toBe(false);
  });
});
