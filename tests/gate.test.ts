import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Answer } from '../scripts/answer.ts';
import { checkAnswer } from '../scripts/answer.ts';
import { gate } from '../scripts/gate.ts';

const sceneCategories = [
  'visualHierarchy',
  'typeSpacingDensity',
  'consistency',
  'polish',
  'informationArchitecture',
  'affordances',
  'stateVisibility',
  'taskFit',
];

const modOnlyCategories = [
  'efficiency',
  'controlAndRecovery',
  'accessibilityAndInput',
  'adaptability',
];

const gptJudge = 'openai/gpt-6.1-sol';
const opusJudge = 'claude-opus-5-5';

let root: string;

const scoreEntry = (score: number) => ({
  subchecks: [{ check: 'Is the hierarchy clear?', result: 'yes', evidence: 'Title is largest.' }],
  score,
  reason: 'Matches the anchor for this score.',
});

const categoriesWithScore = (categories: string[], score: number) =>
  Object.fromEntries(categories.map((category) => [category, scoreEntry(score)]));

const answerJson = (overrides: Record<string, unknown> = {}) => ({
  version: 1,
  judge: gptJudge,
  mock: 'sidebar-a',
  scope: 'scene',
  categories: categoriesWithScore(sceneCategories, 9.5),
  notAssessed: modOnlyCategories,
  findings: [],
  hardFailures: [],
  missingEvidence: [],
  ...overrides,
});

const finding = (category: string, severity: number) => ({
  id: 'F1',
  category,
  severity,
  location: 'sidebar row 3',
  evidence: 'What the judge sees.',
  task: 'The task it affects.',
});

const checkedAnswer = (raw: unknown): Answer => {
  const check = checkAnswer(raw);

  if (check.answer === undefined) {
    throw new Error(`answer should be valid: ${check.errors.join('; ')}`);
  }

  return check.answer;
};

const runCommand = async (files: string[]) => {
  const script = join(import.meta.dir, '..', 'scripts', 'gate.ts');

  const child = Bun.spawn([process.execPath, script, ...files], {
    stdout: 'pipe',
    stderr: 'pipe',
  });

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);

  return { exitCode, output: stdout + stderr };
};

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'koja-gate-'));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('checkAnswer', () => {
  test('accepts a valid scene answer', () => {
    const check = checkAnswer(answerJson());

    expect(check.errors).toEqual([]);
    expect(check.answer?.judge).toBe(gptJudge);
  });

  test('keeps the not-assessed categories on the checked answer', () => {
    const check = checkAnswer(answerJson());

    expect(check.answer?.notAssessed).toEqual(modOnlyCategories);
  });

  test('rejects a 9.5 in a category with an open severity 2 finding', () => {
    const check = checkAnswer(
      answerJson({
        categories: categoriesWithScore(sceneCategories, 9.5),
        findings: [finding('visualHierarchy', 2)],
      }),
    );

    expect(check.answer).toBeUndefined();
    expect(check.errors.some((error) => error.includes('visualHierarchy'))).toBe(true);
  });

  test('rejects a 9.0 with three severity 1 findings', () => {
    const check = checkAnswer(
      answerJson({
        categories: categoriesWithScore(sceneCategories, 9),
        findings: [finding('polish', 1), finding('polish', 1), finding('polish', 1)],
      }),
    );

    expect(check.answer).toBeUndefined();
    expect(check.errors.some((error) => error.includes('polish'))).toBe(true);
  });

  test('accepts a 9.0 with two severity 1 findings', () => {
    const check = checkAnswer(
      answerJson({
        categories: categoriesWithScore(sceneCategories, 9),
        findings: [finding('polish', 1), finding('polish', 1)],
      }),
    );

    expect(check.errors).toEqual([]);
  });

  test('rejects a scene answer that scores a mod-only category', () => {
    const check = checkAnswer(
      answerJson({
        categories: {
          ...categoriesWithScore(sceneCategories, 9.5),
          efficiency: scoreEntry(9.5),
        },
      }),
    );

    expect(check.answer).toBeUndefined();
    expect(check.errors.some((error) => error.includes('efficiency'))).toBe(true);
  });

  test('rejects a category with no subchecks', () => {
    const categories = categoriesWithScore(sceneCategories, 9.5);

    const check = checkAnswer(
      answerJson({
        categories: { ...categories, visualHierarchy: { ...scoreEntry(9.5), subchecks: [] } },
      }),
    );

    expect(check.answer).toBeUndefined();
    expect(check.errors.some((error) => error.includes('visualHierarchy'))).toBe(true);
  });

  test('rejects an unknown judge', () => {
    const check = checkAnswer(answerJson({ judge: 'someone-else' }));

    expect(check.answer).toBeUndefined();
    expect(check.errors.some((error) => error.includes('judge'))).toBe(true);
  });

  test('rejects an 8.0 with a severity 3 finding', () => {
    const check = checkAnswer(
      answerJson({
        categories: categoriesWithScore(sceneCategories, 8),
        findings: [finding('polish', 3)],
      }),
    );

    expect(check.answer).toBeUndefined();
    expect(check.errors.some((error) => error.includes('polish'))).toBe(true);
  });

  test('accepts a 7.9 with a severity 3 finding', () => {
    const check = checkAnswer(
      answerJson({
        categories: categoriesWithScore(sceneCategories, 7.9),
        findings: [finding('polish', 3)],
      }),
    );

    expect(check.errors).toEqual([]);
    expect(check.answer).toBeDefined();
  });

  test('rejects an 8.0 with a severity 4 finding', () => {
    const check = checkAnswer(
      answerJson({
        categories: categoriesWithScore(sceneCategories, 8),
        findings: [finding('polish', 4)],
      }),
    );

    expect(check.answer).toBeUndefined();
    expect(check.errors.some((error) => error.includes('polish'))).toBe(true);
  });

  test('rejects a 9.5 with two severity 1 findings', () => {
    const check = checkAnswer(
      answerJson({
        categories: categoriesWithScore(sceneCategories, 9.5),
        findings: [finding('polish', 1), finding('polish', 1)],
      }),
    );

    expect(check.answer).toBeUndefined();
    expect(check.errors.some((error) => error.includes('polish'))).toBe(true);
  });

  test('accepts a 9.5 with one severity 1 finding', () => {
    const check = checkAnswer(
      answerJson({
        categories: categoriesWithScore(sceneCategories, 9.5),
        findings: [finding('polish', 1)],
      }),
    );

    expect(check.errors).toEqual([]);
    expect(check.answer).toBeDefined();
  });

  test('rejects a 10 with one severity 1 finding', () => {
    const check = checkAnswer(
      answerJson({
        categories: categoriesWithScore(sceneCategories, 10),
        findings: [finding('polish', 1)],
      }),
    );

    expect(check.answer).toBeUndefined();
    expect(check.errors.some((error) => error.includes('polish'))).toBe(true);
  });

  test('accepts an 8.9 with a severity 2 finding', () => {
    const check = checkAnswer(
      answerJson({
        categories: categoriesWithScore(sceneCategories, 8.9),
        findings: [finding('polish', 2)],
      }),
    );

    expect(check.errors).toEqual([]);
    expect(check.answer).toBeDefined();
  });
});

describe('gate', () => {
  test('passes when both judges score every category at 9.0 or more', () => {
    const result = gate([
      checkedAnswer(answerJson()),
      checkedAnswer(answerJson({ judge: opusJudge })),
    ]);

    expect(result.passed).toBe(true);
    expect(result.failures).toEqual([]);
  });

  test('fails a mock when one judge scores one category 8.9', () => {
    const result = gate([
      checkedAnswer(
        answerJson({
          categories: { ...categoriesWithScore(sceneCategories, 9.5), taskFit: scoreEntry(8.9) },
        }),
      ),
      checkedAnswer(answerJson({ judge: opusJudge })),
    ]);

    expect(result.passed).toBe(false);

    expect(
      result.failures.some((failure) => failure.includes(gptJudge) && failure.includes('taskFit')),
    ).toBe(true);
  });

  test('fails when a judge answer is missing', () => {
    const result = gate([checkedAnswer(answerJson())]);

    expect(result.passed).toBe(false);
    expect(result.failures.some((failure) => failure.includes(opusJudge))).toBe(true);
  });

  test('fails when an answer lists a hard failure', () => {
    const result = gate([
      checkedAnswer(answerJson()),
      checkedAnswer(
        answerJson({
          judge: opusJudge,
          hardFailures: [{ kind: 'contrast', location: 'sidebar title', evidence: 'Too faint.' }],
        }),
      ),
    ]);

    expect(result.passed).toBe(false);

    expect(
      result.failures.some(
        (failure) => failure.includes(opusJudge) && failure.includes('contrast'),
      ),
    ).toBe(true);
  });
});

describe('eval:gate command', () => {
  const writeAnswerFile = async (name: string, content: unknown): Promise<string> => {
    const file = join(root, name);

    await writeFile(file, JSON.stringify(content));

    return file;
  };

  test('exits 0 when two valid answers pass the gate', async () => {
    const files = [
      await writeAnswerFile('gpt.json', answerJson()),
      await writeAnswerFile('opus.json', answerJson({ judge: opusJudge })),
    ];

    const { exitCode, output } = await runCommand(files);

    expect(exitCode).toBe(0);
    expect(output).toContain('pass');
  });

  test('exits 1 and prints the error when an answer breaks a score rule', async () => {
    const files = [
      await writeAnswerFile(
        'gpt.json',
        answerJson({
          categories: categoriesWithScore(sceneCategories, 9.5),
          findings: [finding('visualHierarchy', 2)],
        }),
      ),
      await writeAnswerFile('opus.json', answerJson({ judge: opusJudge })),
    ];

    const { exitCode, output } = await runCommand(files);

    expect(exitCode).toBe(1);
    expect(output).toContain('visualHierarchy');
  });
});
