import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Node } from 'oxc-parser';
import { parseSync } from 'oxc-parser';

import { modsDirectory, typeScriptFiles } from './sourceFiles.ts';

let textFixture: string | null = null;

// Every method in Herdr's element type that sets a text size or a font weight. Mods pick a role
// from the kit instead, so these stay in the kit. `font_family` sets a face, not a weight, so it
// stays allowed.
const rawTextMethods = new Set([
  'text_size',
  'text_2xl',
  'text_3xl',
  'text_base',
  'text_lg',
  'text_sm',
  'text_xl',
  'text_xs',
  'font_black',
  'font_bold',
  'font_extrabold',
  'font_extralight',
  'font_light',
  'font_medium',
  'font_normal',
  'font_semibold',
  'font_thin',
  'font_weight',
]);

afterEach(async () => {
  if (textFixture === null) {
    return;
  }

  await rm(textFixture, { recursive: true, force: true });

  textFixture = null;
});

const lineAt = (source: string, index: number): number => {
  let line = 1;

  for (let position = 0; position < index; position += 1) {
    if (source[position] === '\n') {
      line += 1;
    }
  }

  return line;
};

// A call whose callee is a member named one of the setters. The member name's start offset is the
// position to report, so a call split over lines still points at the setter.
const setterStart = (node: Node): number | null => {
  if (node.type !== 'CallExpression') {
    return null;
  }

  const callee = node.callee;

  if (callee.type !== 'MemberExpression' || callee.computed) {
    return null;
  }

  const property = callee.property;

  if (property.type !== 'Identifier') {
    return null;
  }

  return rawTextMethods.has(property.name) ? property.start : null;
};

const walk = (node: unknown, visit: (node: Node) => void): void => {
  if (Array.isArray(node)) {
    node.forEach((child) => {
      walk(child, visit);
    });

    return;
  }

  if (typeof node !== 'object' || node === null) {
    return;
  }

  const record = node as Record<string, unknown>;

  if (typeof record['type'] === 'string') {
    visit(node as Node);
  }

  Object.entries(record).forEach(([key, value]) => {
    if (key !== 'parent') {
      walk(value, visit);
    }
  });
};

const rawTextFindings = async (directory: string): Promise<string[]> => {
  const files = await typeScriptFiles(directory);

  const contents = await Promise.all(
    files.map(async (path) => ({ path, text: await readFile(path, 'utf8') })),
  );

  return contents.flatMap(({ path, text }) => {
    const findings: string[] = [];
    const lines = text.split('\n');
    const parsed = parseSync(path, text);

    parsed.errors.forEach((error) => {
      findings.push(`${path}: cannot parse: ${error.message}`);
    });

    walk(parsed.program, (node) => {
      const start = setterStart(node);

      if (start === null) {
        return;
      }

      const line = lineAt(text, start);

      findings.push(`${path}:${line}: ${lines[line - 1]?.trim() ?? ''}`);
    });

    return findings;
  });
};

describe('the UI language', () => {
  test('the text role check names every raw text size and weight with file and line', async () => {
    textFixture = await mkdtemp(join(tmpdir(), 'koja-text-'));

    const source = [
      'export const a = div().text_size(13);',
      'export const b = div().font_bold();',
      'export const c = div().font_light();',
      'export const d = div().font_black();',
      'export const e = div().',
      '  font_bold();',
      'export const f = div().text_size',
      '(15);',
      "export const g = 'Use .font_bold() here';",
      '// .font_medium() in a comment',
      '/* .font_extrabold() in a block comment */',
      "export const h = div().font_family('Geist');",
      'export const i = div().text_sm();',
      'export const j = div().font_weight(700);',
      `export const k = \`\${div().font_bold()}\`;`,
      "const pattern = /[']/;",
      'export const l = div().font_bold();',
      'const other = /x.font_bold()/;',
      'export const m = div().font_bold();',
      '',
    ].join('\n');

    const path = join(textFixture, 'raw.ts');

    await writeFile(path, source);

    const failures = await rawTextFindings(textFixture);

    const expected = [
      `${path}:1: export const a = div().text_size(13);`,
      `${path}:2: export const b = div().font_bold();`,
      `${path}:3: export const c = div().font_light();`,
      `${path}:4: export const d = div().font_black();`,
      `${path}:6: font_bold();`,
      `${path}:7: export const f = div().text_size`,
      `${path}:13: export const i = div().text_sm();`,
      `${path}:14: export const j = div().font_weight(700);`,
      `${path}:15: export const k = \`\${div().font_bold()}\`;`,
      `${path}:17: export const l = div().font_bold();`,
      `${path}:19: export const m = div().font_bold();`,
    ];

    expect(failures.toSorted()).toEqual(expected.toSorted());
  });

  test('the text role check names a file it cannot parse', async () => {
    textFixture = await mkdtemp(join(tmpdir(), 'koja-text-'));

    const path = join(textFixture, 'broken.ts');

    await writeFile(path, 'export const a = div().font_bold(;\n');

    const failures = await rawTextFindings(textFixture);

    expect(failures.some((failure) => failure.startsWith(`${path}: cannot parse:`))).toBe(true);
  });

  test('mods take every text size and weight from a role', async () => {
    expect(await rawTextFindings(modsDirectory)).toEqual([]);
  });
});
