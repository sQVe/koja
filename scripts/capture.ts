import { mkdir, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import type { Point } from '../src/mods/koja-mocks/catalog.ts';
import { findScene, sceneOrigin } from '../src/mods/koja-mocks/catalog.ts';

export interface Size {
  width: number;
  height: number;
}

export interface Box extends Size {
  x: number;
  y: number;
}

interface Status {
  zoom: number;
  overlays: string[];
}

export interface Sandbox {
  run: (args: string[]) => Promise<string>;
  status: () => Promise<Status>;
}

export interface CaptureContext {
  sandbox: Sandbox;
  waitMilliseconds: number;
}

const modName = 'koja-mocks';

const outputFiles = ['shot.png', 'crop.png', 'capture.json'];

const sandboxCommand = join(import.meta.dir, 'sandbox');

const defaultWaitMilliseconds = 10_000;

const pollMilliseconds = 200;

// The mod takes focus about 600 ms after it draws, so keys sent earlier can be lost.
const pickerSettleMilliseconds = 1000;

const sceneSettleMilliseconds = 1000;

export const cropBox = (origin: Point, size: Size, scale: number): Box => ({
  x: Math.round(origin.x * scale),
  y: Math.round(origin.y * scale),
  width: Math.round(size.width * scale),
  height: Math.round(size.height * scale),
});

const startsInside = (box: Box): boolean => box.x >= 0 && box.y >= 0;

const endsInside = (box: Box, shot: Size): boolean =>
  box.x + box.width <= shot.width && box.y + box.height <= shot.height;

export const cropFits = (box: Box, shot: Size): boolean =>
  startsInside(box) && endsInside(box, shot);

export const cropGeometry = (box: Box): string => `${box.width}x${box.height}+${box.x}+${box.y}`;

const runCommand = async (command: string[]): Promise<string> => {
  const child = Bun.spawn(command, { stdout: 'pipe', stderr: 'pipe' });

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);

  if (exitCode !== 0) {
    throw new Error(`${command.join(' ')} failed: ${(stderr || stdout).trim()}`);
  }

  return stdout;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');

const parseStatus = (text: string): Status => {
  const status: unknown = JSON.parse(text);

  if (!isRecord(status)) {
    throw new TypeError('The sandbox status is not a JSON object.');
  }

  if (typeof status['zoom'] !== 'number') {
    throw new TypeError('The sandbox status has no numeric zoom.');
  }

  if (!isStringArray(status['overlays'])) {
    throw new TypeError('The sandbox status has no list of overlay names.');
  }

  return { zoom: status['zoom'], overlays: status['overlays'] };
};

const sandboxCli: Sandbox = {
  run: (args) => runCommand([sandboxCommand, ...args]),
  status: async () => parseStatus(await runCommand([sandboxCommand, 'status'])),
};

const defaultContext: CaptureContext = {
  sandbox: sandboxCli,
  waitMilliseconds: defaultWaitMilliseconds,
};

// Status lists overlays by mod name, so the picker and the scene both show as modName.
const hasModOverlay = (status: Status): boolean => status.overlays.includes(modName);

const pollUntil = async (
  isDone: () => Promise<boolean>,
  failure: string,
  deadline: number,
): Promise<void> => {
  if (await isDone()) {
    return;
  }

  if (Date.now() >= deadline) {
    throw new Error(failure);
  }

  await Bun.sleep(pollMilliseconds);

  return pollUntil(isDone, failure, deadline);
};

const waitUntil = (
  isDone: () => Promise<boolean>,
  failure: string,
  waitMilliseconds: number,
): Promise<void> => pollUntil(isDone, failure, Date.now() + waitMilliseconds);

const openScene = async (context: CaptureContext, sceneName: string): Promise<void> => {
  const { sandbox } = context;

  await sandbox.run(['do', 'mod.open', '--name', modName]);

  await waitUntil(
    async () => hasModOverlay(await sandbox.status()),
    `The ${modName} picker did not open.`,
    context.waitMilliseconds,
  );

  await Bun.sleep(pickerSettleMilliseconds);

  await sandbox.run(['type', sceneName]);
  await sandbox.run(['key', 'Return']);

  await Bun.sleep(sceneSettleMilliseconds);
};

const closeScene = async (context: CaptureContext): Promise<void> => {
  const { sandbox } = context;

  if (!hasModOverlay(await sandbox.status())) {
    return;
  }

  await sandbox.run(['key', 'Escape']);

  await waitUntil(
    async () => !hasModOverlay(await sandbox.status()),
    `The ${modName} overlay did not close after Escape. Close it in the sandbox window.`,
    context.waitMilliseconds,
  );
};

const parseShotSize = (output: string): Size => {
  const [width, height] = output.trim().split(' ').map(Number);

  if (width === undefined || height === undefined) {
    throw new TypeError(`identify printed no width and height: ${output}`);
  }

  return { width, height };
};

const readShotSize = async (path: string): Promise<Size> =>
  parseShotSize(await runCommand(['identify', '-format', '%w %h', path]));

const saveCrop = async (
  context: CaptureContext,
  folder: string,
  scene: Size & { name: string },
): Promise<void> => {
  const shotPath = join(folder, 'shot.png');
  const { zoom: scale } = await context.sandbox.status();
  const shot = await readShotSize(shotPath);
  const box = cropBox(sceneOrigin, scene, scale);

  if (!cropFits(box, shot)) {
    throw new Error(
      `The crop ${cropGeometry(box)} falls outside the ${shot.width}x${shot.height} shot.`,
    );
  }

  await runCommand([
    'magick',
    shotPath,
    '-crop',
    cropGeometry(box),
    '+repage',
    join(folder, 'crop.png'),
  ]);

  const record = {
    scene: scene.name,
    shot,
    crop: { ...box, geometry: cropGeometry(box) },
    scale,
  };

  await Bun.write(join(folder, 'capture.json'), `${JSON.stringify(record, null, 2)}\n`);
};

const printError = (error: unknown): void => {
  const message = error instanceof Error ? error.message : String(error);

  process.stderr.write(`${message}\n`);
};

export const capture = async (
  argv: string[],
  context: CaptureContext = defaultContext,
): Promise<void> => {
  const [sceneName = '', folderArgument] = argv;
  const lookup = findScene(sceneName);

  if ('error' in lookup) {
    throw new Error(lookup.error);
  }

  const { scene } = lookup;
  const folder = resolve(folderArgument ?? join('.tau', 'judge', scene.name));
  const status = await context.sandbox.status();

  if (hasModOverlay(status)) {
    throw new Error(`A ${modName} overlay is already open. Close it in the sandbox window first.`);
  }

  await mkdir(folder, { recursive: true });

  // A failed run must not leave a new shot beside the crop and JSON of an earlier one.
  await Promise.all(outputFiles.map(async (file) => rm(join(folder, file), { force: true })));

  try {
    await openScene(context, scene.name);
    await context.sandbox.run(['shot', join(folder, 'shot.png')]);
    await saveCrop(context, folder, scene);
  } catch (error) {
    await closeScene(context).catch(printError);

    throw error;
  }

  await closeScene(context);
};

if (import.meta.main) {
  await capture(process.argv.slice(2)).catch((error: unknown) => {
    printError(error);
    process.exitCode = 1;
  });
}
