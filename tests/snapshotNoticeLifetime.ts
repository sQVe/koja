import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import type { SnapshotNoticeRecord, SnapshotNoticeScenario } from './snapshotNoticeScenarios.ts';

const herdrManifest = { name: 'herdr', type: 'module', main: 'index.js' };

const installHerdrBoundary = async (nodeModules: string): Promise<void> => {
  const packageFolder = join(nodeModules, 'herdr');
  const boundary = pathToFileURL(join(import.meta.dir, 'snapshotNoticeBoundaries.ts')).href;

  await mkdir(packageFolder, { recursive: true });
  await writeFile(join(packageFolder, 'package.json'), JSON.stringify(herdrManifest));
  await writeFile(join(packageFolder, 'index.js'), `export * from '${boundary}';\n`);
};

const runChild = async (script: string, scenario: SnapshotNoticeScenario, nodeModules: string) => {
  const child = Bun.spawn([process.execPath, script, scenario], {
    env: { ...process.env, NODE_PATH: nodeModules },
    stderr: 'pipe',
    stdout: 'pipe',
  });

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);

  if (exitCode !== 0) {
    throw new Error(`snapshot notice scenario ${scenario} failed: ${stderr}`);
  }

  return JSON.parse(stdout) as SnapshotNoticeRecord;
};

export const runSnapshotNoticeScenario = async (
  scenario: SnapshotNoticeScenario,
): Promise<SnapshotNoticeRecord> => {
  const folder = await mkdtemp(join(tmpdir(), 'koja-snapshot-notice-'));
  const nodeModules = join(folder, 'node_modules');
  const script = join(import.meta.dir, 'snapshotNoticeScenario.ts');

  try {
    await installHerdrBoundary(nodeModules);

    return await runChild(script, scenario, nodeModules);
  } finally {
    await rm(folder, { force: true, recursive: true });
  }
};
