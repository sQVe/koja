import { expect, it, onTestFinished } from 'bun:test';
import { copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { z } from 'zod';

it('reports a missing library when it creates a terminal and when it reads the Ghostty commit', async () => {
  const root = await mkdtemp(join(tmpdir(), 'koja-vt-'));

  onTestFinished(() => rm(root, { recursive: true, force: true }));

  // A copy of the modules whose build/libkoja-vt.so is not a library. vt.ts loads the library from a
  // path beside its own file and keeps it loaded, so only a copy in a new process can fail.
  for (const file of ['src/vt/vt.ts', 'src/invariant.ts', 'src/rows/rows.ts']) {
    await mkdir(dirname(join(root, file)), { recursive: true });
    await copyFile(file, join(root, file));
  }

  await mkdir(join(root, 'build'));
  await writeFile(join(root, 'build/libkoja-vt.so'), 'not a library');

  await writeFile(
    join(root, 'check.ts'),
    `import { createTerminal, ghosttyCommit } from './src/vt/vt.ts';
console.log(JSON.stringify({ terminal: createTerminal(80, 24, 0), commit: ghosttyCommit() }));`,
  );

  const child = Bun.spawn([process.execPath, 'check.ts'], { cwd: root, stdout: 'pipe' });
  const output = await new Response(child.stdout).text();

  const missing = z.object({
    ok: z.literal(false),
    reason: z.literal('library-missing'),
    detail: z.string().min(1),
  });

  const results = z.object({ terminal: missing, commit: missing }).safeParse(JSON.parse(output));

  expect(results.success).toBe(true);
});
