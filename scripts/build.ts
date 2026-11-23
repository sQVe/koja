import { randomUUID } from 'node:crypto';
import {
  chmod,
  cp,
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  realpath,
  rename,
  rm,
  stat,
} from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

import { acquireCheckoutLock } from './checkoutLock.ts';

interface BuildHooks {
  readonly renamePath?: (from: string, to: string) => Promise<void>;
  readonly removePrevious?: (path: string) => Promise<void>;
  readonly removeStaging?: (path: string) => Promise<void>;
  readonly onCheckoutLockWait?: (() => void) | undefined;
  readonly warn?: (message: string) => void;
}

export const sourceDirectory = 'src/mods';
export const outputDirectory = 'dist/mods';

const typeScriptExtensions = ['.ts', '.tsx', '.mts', '.cts'];
const writableDirectoryMode = 0o700;

export const isMissing = (error: unknown): boolean =>
  error instanceof Error && 'code' in error && error.code === 'ENOENT';

const listModNames = async (directory: string): Promise<string[]> => {
  try {
    const entries = await readdir(directory, { withFileTypes: true });

    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  } catch (error) {
    if (isMissing(error)) {
      return [];
    }

    throw error;
  }
};

const canonicalPath = async (path: string): Promise<string> => {
  const absolute = resolve(path);

  try {
    return await realpath(absolute);
  } catch (error) {
    if (!isMissing(error)) {
      throw error;
    }
  }

  const parent = dirname(absolute);

  if (parent === absolute) {
    return absolute;
  }

  const canonicalParent = await canonicalPath(parent);

  return join(canonicalParent, basename(absolute));
};

const directoryEntryPath = async (path: string): Promise<string> => {
  const absolute = resolve(path);

  return join(await canonicalPath(dirname(absolute)), basename(absolute));
};

const isInside = (parent: string, child: string): boolean => {
  const relation = relative(parent, child);

  if (relation === '') {
    return true;
  }

  return relation !== '..' && !relation.startsWith(`..${sep}`) && !isAbsolute(relation);
};

const refuseOverlap = async (source: string, output: string): Promise<void> => {
  const sourceTarget = await canonicalPath(source);
  const sourceEntry = await directoryEntryPath(source);
  const outputTarget = await canonicalPath(output);
  const outputEntry = await directoryEntryPath(output);

  const pairs: [string, string][] = [
    [sourceTarget, outputTarget],
    [sourceTarget, outputEntry],
    [sourceEntry, outputTarget],
    [sourceEntry, outputEntry],
  ];

  for (const [sourcePath, outputPath] of pairs) {
    if (sourcePath === outputPath) {
      throw new Error(`Refusing to build mods: source and output overlap at ${sourcePath}`);
    }

    if (isInside(outputPath, sourcePath)) {
      throw new Error(
        `Refusing to build mods: output ${outputPath} overlaps the source ${sourcePath} because it contains it`,
      );
    }

    if (isInside(sourcePath, outputPath)) {
      throw new Error(
        `Refusing to build mods: output ${outputPath} overlaps the source ${sourcePath} because it is inside it`,
      );
    }
  }
};

const isTypeScriptPath = (path: string): boolean =>
  typeScriptExtensions.some((extension) => path.endsWith(extension));

const shipsWithMod = async (path: string): Promise<boolean> => {
  const entry = await lstat(path).catch((error: unknown) => {
    if (isMissing(error)) {
      return null;
    }

    throw error;
  });

  if (entry?.isSymbolicLink() === true) {
    const target = await stat(path).catch((error: unknown) => {
      if (isMissing(error)) {
        return null;
      }

      throw error;
    });

    if (target?.isDirectory() === true) {
      throw new Error(
        `Refusing to copy the directory symlink ${path}; replace it with a real directory`,
      );
    }

    return !isTypeScriptPath(path);
  }

  if (entry?.isDirectory() === true) {
    return true;
  }

  return !isTypeScriptPath(path);
};

const formatDiagnostic = (diagnostic: BuildMessage | ResolveMessage): string => {
  const position = diagnostic.position;

  if (position === null) {
    return diagnostic.message;
  }

  return `${position.file}:${position.line}:${position.column}: ${diagnostic.message}`;
};

const isBuildDiagnostic = (value: unknown): value is BuildMessage | ResolveMessage =>
  value instanceof Error && 'position' in value && 'level' in value;

const firstDiagnosticOf = (error: unknown): string | null => {
  if (error instanceof AggregateError) {
    for (const nested of error.errors) {
      const diagnostic = firstDiagnosticOf(nested);

      if (diagnostic !== null) {
        return diagnostic;
      }
    }
  }

  return isBuildDiagnostic(error) ? formatDiagnostic(error) : null;
};

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const bundleMod = async (modSource: string, modOutput: string, name: string): Promise<void> => {
  const result = await Bun.build({
    entrypoints: [join(modSource, 'main.ts')],
    outdir: modOutput,
    naming: 'main.js',
    format: 'esm',
    target: 'browser',
    packages: 'external',
    define: { kojaModName: JSON.stringify(name) },
    throw: false,
  });

  if (!result.success) {
    const [firstDiagnostic] = result.logs;

    const diagnostic =
      firstDiagnostic === undefined ? '' : `: ${formatDiagnostic(firstDiagnostic)}`;

    throw new AggregateError(result.logs, `Could not build mod ${name}${diagnostic}`);
  }
};

const copyKitIcons = async (source: string, modOutput: string): Promise<void> => {
  try {
    await cp(join(source, '..', 'kit', 'icons'), join(modOutput, 'icons'), { recursive: true });
  } catch (error) {
    if (!isMissing(error)) {
      throw error;
    }
  }
};

const buildMod = async (source: string, output: string, name: string): Promise<void> => {
  const modSource = join(source, name);
  const modOutput = join(output, name);

  await cp(modSource, modOutput, { recursive: true, filter: shipsWithMod });
  await copyKitIcons(source, modOutput);
  await bundleMod(modSource, modOutput, name);
};

const buildEveryMod = async (source: string, output: string, names: string[]): Promise<void> => {
  const outcomes = await Promise.all(
    names.map(async (name) => {
      try {
        await buildMod(source, output, name);

        return null;
      } catch (error) {
        return { name, error };
      }
    }),
  );

  const failures = outcomes.flatMap((outcome) => (outcome === null ? [] : [outcome]));
  const [firstFailure, ...otherFailures] = failures;

  if (firstFailure === undefined) {
    return;
  }

  if (otherFailures.length === 0) {
    throw firstFailure.error;
  }

  const failedNames = failures.map((failure) => failure.name);

  const diagnostic = failures
    .map((failure) => firstDiagnosticOf(failure.error))
    .find((value): value is string => value !== null);

  const detail = diagnostic === undefined ? '' : `: ${diagnostic}`;

  throw new AggregateError(
    failures.map((failure) => failure.error),
    `Could not build mods ${failedNames.join(', ')}${detail}`,
  );
};

const removeTree = async (path: string): Promise<void> => {
  const entry = await lstat(path).catch((error: unknown) => {
    if (isMissing(error)) {
      return null;
    }

    throw error;
  });

  if (entry === null) {
    return;
  }

  if (entry.isDirectory()) {
    await chmod(path, writableDirectoryMode);

    const names = await readdir(path);

    for (const name of names) {
      // eslint-disable-next-line no-await-in-loop -- a copied tree is removed one entry at a time
      await removeTree(join(path, name));
    }
  }

  await rm(path, { recursive: true, force: true });
};

const moveIfPresent = async (
  from: string,
  to: string,
  renamePath: (from: string, to: string) => Promise<void>,
): Promise<boolean> => {
  try {
    await renamePath(from, to);

    return true;
  } catch (error) {
    if (isMissing(error)) {
      return false;
    }

    throw error;
  }
};

const defaultWarn = (message: string): void => {
  process.stderr.write(`${message}\n`);
};

const publishStaging = async (
  staging: string,
  output: string,
  hooks: BuildHooks,
): Promise<void> => {
  const renamePath = hooks.renamePath ?? rename;
  const removePrevious = hooks.removePrevious ?? removeTree;
  const previous = `${output}.previous-${randomUUID()}`;
  const hadOutput = await moveIfPresent(output, previous, renamePath);

  try {
    await renamePath(staging, output);
  } catch (error) {
    if (hadOutput) {
      await renamePath(previous, output).catch((restoreError: unknown) => {
        throw new AggregateError(
          [error, restoreError],
          `Could not publish ${output} and could not restore the previous output`,
          { cause: error },
        );
      });
    }

    throw error;
  }

  if (hadOutput) {
    try {
      await removePrevious(previous);
    } catch (error) {
      const warn = hooks.warn ?? defaultWarn;

      warn(`Could not remove the previous build ${previous}: ${messageOf(error)}`);
    }
  }
};

export const buildMods = async (
  source: string,
  output: string,
  hooks: BuildHooks = {},
): Promise<string[]> => {
  await refuseOverlap(source, output);

  const release = await acquireCheckoutLock(resolve(source, '..', '..'), {
    onWait: hooks.onCheckoutLockWait,
  });

  const removeStaging = hooks.removeStaging ?? removeTree;

  try {
    const names = await listModNames(source);
    const outputPath = resolve(output);
    const parent = dirname(outputPath);

    await mkdir(parent, { recursive: true });

    const staging = await mkdtemp(join(parent, `${basename(outputPath)}.staging-`));

    try {
      await buildEveryMod(source, staging, names);
      await publishStaging(staging, outputPath, hooks);
    } catch (error) {
      try {
        await removeStaging(staging);
      } catch (cleanupError) {
        const diagnostic = firstDiagnosticOf(error) ?? messageOf(error);

        throw new AggregateError(
          [error, cleanupError],
          `Could not build mods and could not remove ${staging}: ${diagnostic}; cleanup failed: ${messageOf(cleanupError)}`,
          { cause: cleanupError },
        );
      }

      throw error;
    }

    return names;
  } finally {
    await release();
  }
};

if (import.meta.main) {
  const names = await buildMods(sourceDirectory, outputDirectory);

  process.stdout.write(`Built ${names.length} mods into ${outputDirectory}\n`);
}
