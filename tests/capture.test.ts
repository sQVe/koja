import { describe, expect, test } from 'bun:test';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { CaptureContext } from '../scripts/capture.ts';
import { capture, cropBox, cropFits, cropGeometry } from '../scripts/capture.ts';

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

const fakeContext = (overlays: string[]) => {
  const commands: string[][] = [];

  const context: CaptureContext = {
    sandbox: {
      run: async (args) => {
        commands.push(args);

        return '';
      },
      status: async () => ({ zoom: 1, overlays }),
    },
    waitMilliseconds: 0,
  };

  return { commands, context };
};

const sceneOrigin = { x: 20, y: 40 };
const sidebarSize = { width: 250, height: 512 };

describe('mock:capture', () => {
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
