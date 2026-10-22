import { expect, it } from 'bun:test';

import { expectDiagnosticCounts, lintProject, temporaryProject } from './lintHarness.ts';

it.each(['lint', 'style:check'])(
  'refuses node-pty and its forks through %s',
  async (script) => {
    const fixtures: [string, string[], number][] = [
      [
        'refused.ts',
        [
          "import { spawn } from 'node-pty';",
          "export { spawn as forkSpawn } from '@lydell/node-pty';",
          "export * from '@homebridge/node-pty-prebuilt-multiarch';",
          "export * from 'node-pty-prebuilt';",
          "export const loaded = await import('node-pty/lib/unixTerminal');",
          'export const spawned = spawn;',
        ],
        5,
      ],
      [
        'allowed.ts',
        [
          "import { spawn } from 'bun';",
          "export * from 'empty-node';",
          "export * from 'node-ptyx';",
          "export * from 'snode-pty';",
          "export const loaded = await import('@scope/pty');",
          'export const spawned = spawn;',
        ],
        0,
      ],
      [
        'local.ts',
        [
          "export * from './node-pty-utils';",
          "export * from '../node-pty/adapter';",
          "export * from '/vendor/node-pty';",
          "export const loaded = await import('./lib/node-pty/spawn');",
        ],
        0,
      ],
    ];

    const run = await lintProject({
      project: await temporaryProject(),
      script,
      files: fixtures.map(([file, lines]) => ({ file, lines })),
      rules: ['eslint(no-restricted-imports)'],
      env: { SEAM_STYLE: '0' },
    });

    expect(run.error).toBeUndefined();
    expect(run.status).toBe(1);

    expectDiagnosticCounts(
      run,
      Object.fromEntries(fixtures.map(([file, , count]) => [file, count])),
    );
  },
  30_000,
);
