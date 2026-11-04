import { readFile } from 'node:fs/promises';

import type { Answer, AnswerCheck, Judge } from './answer.ts';
import { checkAnswer, judges, limits } from './answer.ts';

export interface GateResult {
  passed: boolean;
  failures: string[];
}

const sharedFailures = (answers: Answer[]): string[] => {
  const mocks = new Set(answers.map((answer) => answer.mock));
  const answerScopes = new Set(answers.map((answer) => answer.scope));

  const mockFailures =
    mocks.size > 1 ? [`answers name different mocks: ${[...mocks].join(', ')}`] : [];

  const scopeFailures =
    answerScopes.size > 1 ? [`answers name different scopes: ${[...answerScopes].join(', ')}`] : [];

  return [...mockFailures, ...scopeFailures];
};

const judgeFailures = (answers: Answer[], judge: Judge): string[] => {
  const count = answers.filter((answer) => answer.judge === judge).length;

  if (count === 0) {
    return [`${judge} did not answer`];
  }

  return count > 1 ? [`${judge} answered ${count} times`] : [];
};

const scoreFailures = (answer: Answer): string[] =>
  Object.entries(answer.categories)
    .filter(([, entry]) => entry.score < limits.passingScore)
    .map(
      ([category, entry]) =>
        `${answer.judge} scores ${category} ${entry.score}; the gate needs ${limits.passingScore} or more`,
    );

const hardFailureFailures = (answer: Answer): string[] =>
  answer.hardFailures.map(
    (hardFailure) =>
      `${answer.judge} lists hard failure ${hardFailure.kind} at ${hardFailure.location}`,
  );

export const gate = (answers: Answer[]): GateResult => {
  const failures = [
    ...sharedFailures(answers),
    ...judges.flatMap((judge) => judgeFailures(answers, judge)),
    ...answers.flatMap((answer) => [...scoreFailures(answer), ...hardFailureFailures(answer)]),
  ];

  return { passed: failures.length === 0, failures };
};

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const checkFile = async (file: string): Promise<AnswerCheck> => {
  try {
    const check = checkAnswer(JSON.parse(await readFile(file, 'utf8')));

    return { ...check, errors: check.errors.map((error) => `${file}: ${error}`) };
  } catch (error) {
    return { errors: [`${file}: ${errorMessage(error)}`] };
  }
};

const print = (lines: string[]): void => {
  process.stdout.write(`${lines.join('\n')}\n`);
};

if (import.meta.main) {
  const checks = await Promise.all(process.argv.slice(2).map(checkFile));
  const errors = checks.flatMap((check) => check.errors);
  const answers = checks.flatMap((check) => check.answer ?? []);

  if (errors.length > 0) {
    print(errors);
    process.exitCode = 1;
  } else {
    const result = gate(answers);

    const notes = answers.flatMap((answer) =>
      answer.missingEvidence.map(
        (item) => `note: ${answer.judge} on ${answer.mock} is missing: ${item}`,
      ),
    );

    const verdict = result.passed ? ['pass'] : ['fail', ...result.failures];

    print([...notes, ...verdict]);
    process.exitCode = result.passed ? 0 : 1;
  }
}
