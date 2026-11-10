import { cp, readdir, rm } from 'node:fs/promises';
import { basename, join } from 'node:path';

export const sourceDirectory = 'src/mods';
export const outputDirectory = 'dist/mods';

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

const isTypeScript = (path: string): boolean => path.endsWith('.ts');

const isQaRecipe = (path: string): boolean => basename(path) === 'qa.md';

const shipsWithMod = (path: string): boolean => !isTypeScript(path) && !isQaRecipe(path);

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
    throw new AggregateError(result.logs, `Could not build mod ${name}`);
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

export const buildMods = async (source: string, output: string): Promise<string[]> => {
  const names = await listModNames(source);

  await rm(output, { recursive: true, force: true });
  await Promise.all(names.map((name) => buildMod(source, output, name)));

  return names;
};

if (import.meta.main) {
  const names = await buildMods(sourceDirectory, outputDirectory);

  process.stdout.write(`Built ${names.length} mods into ${outputDirectory}\n`);
}
