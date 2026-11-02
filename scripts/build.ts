import { cp, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

const sourceDirectory = 'src/mods';
const outputDirectory = 'dist/mods';

const isMissing = (error: unknown): boolean =>
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

// Herdr resolves a mod's imports only inside its own folder, so the kit and every other local
// module are bundled into main.js. Bare imports such as `gpui-kit` and `herdr` are Herdr's own
// modules and stay imports. Herdr loads icons by their path under its home, so the kit learns the
// mod's folder name from `kojaModName`.
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

  await cp(modSource, modOutput, { recursive: true, filter: (path) => !isTypeScript(path) });
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
