import { expect, it } from 'bun:test';

import { expectDiagnosticCounts, lintProject, temporaryProject } from './lintHarness.ts';

const conventionRules = ['koja(throw-only-in-invariant)', 'koja(class-owns-resource)'];

const fixtures: [string, string[], number][] = [
  [
    'src/invariant.ts',
    [
      'export const invariant = (condition: boolean, message: string) => {',
      '  if (!condition) {',
      '    throw new Error(message);',
      '  }',
      '};',
    ],
    0,
  ],
  ['src/parse.ts', ["export const parse = () => {\n  throw new Error('bad input');\n};"], 1],
  ['src/parse.test.ts', ["export const parseTest = () => {\n  throw new Error('test');\n};"], 0],
  [
    'scripts/tool.ts',
    ["export const tool = () => {\n  throw new Error('tool');\n};", 'export class Tool {}'],
    0,
  ],
  ['src/handle.ts', ['export class Handle {\n  dispose() {\n    return 0;\n  }\n}'], 0],
  [
    'src/terminal.ts',
    ['export class Terminal {\n  [Symbol.dispose]() {\n    return 0;\n  }\n}'],
    0,
  ],
  ['src/plain.ts', ['export class Plain {\n  read() {\n    return 0;\n  }\n}'], 1],
  [
    'src/expression.ts',
    ['export const Expression = class {\n  read() {\n    return 0;\n  }\n};'],
    1,
  ],
  [
    'src/paneRenderable.ts',
    [
      "import { Renderable } from '@opentui/core';",
      'export class PaneRenderable extends Renderable {\n  draw() {\n    return 0;\n  }\n}',
    ],
    0,
  ],
  [
    'src/failure.ts',
    ['export class Failure extends Error {\n  dispose() {\n    return 0;\n  }\n}'],
    1,
  ],
  [
    'src/child.ts',
    [
      'class Base {\n  dispose() {\n    return 0;\n  }\n}',
      'export class Child extends Base {\n  dispose() {\n    return 1;\n  }\n}',
    ],
    1,
  ],
];

it.each(['lint', 'style:check'])(
  'refuses throws outside invariant and classes without a resource through %s',
  async (script) => {
    const run = await lintProject({
      project: await temporaryProject(),
      script,
      files: fixtures.map(([file, lines]) => ({ file, lines })),
      rules: conventionRules,
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
