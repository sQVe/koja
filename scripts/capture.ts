import { lstat, mkdir, mkdtemp, rename, rm } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';

import type { Point } from '../src/mods/koja-mocks/catalog.ts';
import { findScene, sceneOrigin, sceneReadyName } from '../src/mods/koja-mocks/catalog.ts';

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

export interface Images {
  size: (path: string) => Promise<Size>;
  crop: (shot: string, box: Box, target: string) => Promise<void>;
}

export interface CaptureContext {
  sandbox: Sandbox;
  images: Images;
  pickerSettleMilliseconds: number;
  waitMilliseconds: number;
}

type Move = (from: string, to: string) => Promise<void>;

const modName = 'koja-mocks';

const outputFiles = ['shot.png', 'crop.png', 'capture.json'];

const sandboxCommand = join(import.meta.dir, 'sandbox');

const defaultWaitMilliseconds = 10_000;

const pollMilliseconds = 200;

// The mod takes focus about 600 ms after it draws, so keys sent earlier can be lost.
const pickerSettleMilliseconds = 1000;

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

const openScene = async (
  context: CaptureContext,
  sceneName: string,
  baseline: string,
): Promise<void> => {
  const { sandbox } = context;

  await sandbox.run(['do', 'mod.open', '--name', modName]);

  await waitUntil(
    async () => hasModOverlay(await sandbox.status()),
    `The ${modName} picker did not open.`,
    context.waitMilliseconds,
  );

  await Bun.sleep(context.pickerSettleMilliseconds);

  await sandbox.run(['type', sceneName]);
  await sandbox.run(['key', 'Return']);

  await waitUntil(
    async () => {
      const log = await sandbox.run(['log']);
      const lines = log.slice(baseline.length).split('\n');

      return lines.some((line) => sceneReadyName(line) === sceneName);
    },
    `The ${modName} scene "${sceneName}" did not become ready.`,
    context.waitMilliseconds,
  );
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

const imageTools: Images = {
  size: async (path) => parseShotSize(await runCommand(['identify', '-format', '%w %h', path])),
  crop: async (shot, box, target) => {
    await runCommand(['magick', shot, '-crop', cropGeometry(box), '+repage', target]);
  },
};

const defaultContext: CaptureContext = {
  sandbox: sandboxCli,
  images: imageTools,
  pickerSettleMilliseconds,
  waitMilliseconds: defaultWaitMilliseconds,
};

const saveCrop = async (
  context: CaptureContext,
  folder: string,
  scene: Size & { name: string },
): Promise<void> => {
  const shotPath = join(folder, 'shot.png');
  const { zoom: scale } = await context.sandbox.status();
  const shot = await context.images.size(shotPath);
  const box = cropBox(sceneOrigin, scene, scale);

  if (!cropFits(box, shot)) {
    throw new Error(
      `The crop ${cropGeometry(box)} falls outside the ${shot.width}x${shot.height} shot.`,
    );
  }

  await context.images.crop(shotPath, box, join(folder, 'crop.png'));

  const record = {
    scene: scene.name,
    shot,
    crop: { ...box, geometry: cropGeometry(box) },
    scale,
  };

  await Bun.write(join(folder, 'capture.json'), `${JSON.stringify(record, null, 2)}\n`);
};

const isMissing = (error: unknown): boolean =>
  error instanceof Error && 'code' in error && error.code === 'ENOENT';

const captureFileExists = async (path: string): Promise<boolean> => {
  try {
    const info = await lstat(path);

    if (!info.isFile()) {
      throw new Error(`The capture target ${path} is not a file.`);
    }

    return true;
  } catch (error) {
    if (isMissing(error)) {
      return false;
    }

    throw error;
  }
};

const existingCaptureFiles = async (folder: string): Promise<string[]> => {
  const existing: string[] = [];

  for (const file of outputFiles) {
    // eslint-disable-next-line no-await-in-loop -- all targets are checked before anything moves.
    if (await captureFileExists(join(folder, file))) {
      existing.push(file);
    }
  }

  return existing;
};

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const removeStagingAfterFailure = async (staging: string, error: unknown): Promise<never> => {
  try {
    await rm(staging, { recursive: true, force: true });
  } catch (cleanupError) {
    throw new Error(
      `The capture failed and kept ${staging}. ${messageOf(error)} Cleanup failed: ${messageOf(cleanupError)}`,
      { cause: cleanupError },
    );
  }

  throw error;
};

const createSiblingFolder = async (folder: string, label: string): Promise<string> => {
  const parent = dirname(folder);

  await mkdir(parent, { recursive: true });

  return mkdtemp(join(parent, `.${basename(folder)}-${label}-`));
};

const createStagingFolder = (folder: string): Promise<string> =>
  createSiblingFolder(folder, 'staging');

const restoreCapture = async (
  folder: string,
  backup: string,
  existing: string[],
  installed: string[],
  backedUp: string[],
  move: Move,
): Promise<unknown[]> => {
  const errors: unknown[] = [];

  for (const file of installed) {
    if (existing.includes(file)) {
      continue;
    }

    try {
      // eslint-disable-next-line no-await-in-loop -- one rollback removes each new file in turn.
      await rm(join(folder, file), { force: true });
    } catch (error) {
      errors.push(error);
    }
  }

  for (const file of backedUp) {
    try {
      // eslint-disable-next-line no-await-in-loop -- one rollback restores each old file in turn.
      await move(join(backup, file), join(folder, file));
    } catch (error) {
      errors.push(error);
    }
  }

  return errors;
};

export const publishCapture = async (
  staging: string,
  folder: string,
  move: Move = rename,
): Promise<void> => {
  const existing: string[] = [];
  let backup: string | null = null;
  const backedUp: string[] = [];
  const installed: string[] = [];

  try {
    existing.push(...(await existingCaptureFiles(folder)));
    backup = await createSiblingFolder(folder, 'backup');
    await mkdir(folder, { recursive: true });

    for (const file of existing) {
      // eslint-disable-next-line no-await-in-loop -- each old file is backed up before the next.
      await move(join(folder, file), join(backup, file));
      backedUp.push(file);
    }

    for (const file of outputFiles) {
      // eslint-disable-next-line no-await-in-loop -- each new file is published in order.
      await move(join(staging, file), join(folder, file));
      installed.push(file);
    }
  } catch (error) {
    if (backup === null) {
      return removeStagingAfterFailure(staging, error);
    }

    const restoreErrors = await restoreCapture(folder, backup, existing, installed, backedUp, move);

    if (restoreErrors.length > 0) {
      const details = restoreErrors.map(messageOf).join('; ');

      throw new Error(`Could not restore the capture. Keep ${backup} and ${staging}. ${details}`, {
        cause: error,
      });
    }

    await rm(staging, { recursive: true, force: true });
    await rm(backup, { recursive: true, force: true });

    throw error;
  }

  await rm(backup, { recursive: true, force: true });
  await rm(staging, { recursive: true, force: true });
};

const printError = (error: unknown): void => {
  process.stderr.write(`${messageOf(error)}\n`);
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

  await existingCaptureFiles(folder);

  const status = await context.sandbox.status();

  if (hasModOverlay(status)) {
    throw new Error(`A ${modName} overlay is already open. Close it in the sandbox window first.`);
  }

  const baseline = await context.sandbox.run(['log']);
  const staging = await createStagingFolder(folder);

  try {
    await openScene(context, scene.name, baseline);
    await context.sandbox.run(['shot', join(staging, 'shot.png')]);
    await saveCrop(context, staging, scene);
    await closeScene(context);
    await context.sandbox.run(['guard']);
  } catch (error) {
    await closeScene(context).catch(printError);
    await removeStagingAfterFailure(staging, error);
  }

  await publishCapture(staging, folder);
};

const lockEnvironmentKey = 'KOJA_CAPTURE_LOCK_HELD';

const captureScript = join(import.meta.dir, 'capture.ts');

const runUnderLock = async (argv: string[]): Promise<number> => {
  const child = Bun.spawn({
    cmd: [sandboxCommand, 'lock', process.execPath, captureScript, ...argv],
    env: { ...Bun.env, [lockEnvironmentKey]: '1' },
    stdin: 'inherit',
    stdout: 'inherit',
    stderr: 'inherit',
  });

  return child.exited;
};

if (import.meta.main) {
  const argv = process.argv.slice(2);

  if (Bun.env[lockEnvironmentKey] === '1') {
    await capture(argv).catch((error: unknown) => {
      printError(error);
      process.exitCode = 1;
    });
  } else {
    const lookup = findScene(argv[0] ?? '');

    if ('error' in lookup) {
      printError(new Error(lookup.error));
      process.exitCode = 1;
    } else {
      process.exitCode = await runUnderLock(argv).catch((error: unknown) => {
        printError(error);

        return 1;
      });
    }
  }
}
