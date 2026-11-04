import { readFile } from 'node:fs/promises';

interface AnswerCheck {
  answer?: Answer;
  errors: string[];
}

const judges = ['openai/gpt-6.1-sol', 'claude-opus-5-5'] as const;

const scopes = ['scene', 'mod'] as const;

const sceneCategories = [
  'visualHierarchy',
  'typeSpacingDensity',
  'consistency',
  'polish',
  'informationArchitecture',
  'affordances',
  'stateVisibility',
  'taskFit',
] as const;

const modOnlyCategories = [
  'efficiency',
  'controlAndRecovery',
  'accessibilityAndInput',
  'adaptability',
] as const;

const hardFailureKinds = [
  'contrast',
  'hiddenTaskInformation',
  'unclearFocusOrMode',
  'offKitValue',
  'unreadableText',
] as const;

const maximumSeverity = 4;
const majorSeverity = 3;
const severities = [0, 1, 2, majorSeverity, maximumSeverity] as const;

const maximumScore = 10;
const passingScore = 9;
const majorCapScore = 8;

const severityOneLimits = [
  { minimumScore: 10, allowed: 0 },
  { minimumScore: 9.5, allowed: 1 },
  { minimumScore: 9, allowed: 2 },
];

type Judge = (typeof judges)[number];

type Scope = (typeof scopes)[number];

interface Finding {
  category: string;
  severity: (typeof severities)[number];
}

export interface Answer {
  judge: Judge;
  mock: string;
  scope: Scope;
  scores: Record<string, number>;
  findings: Finding[];
  hardFailures: (typeof hardFailureKinds)[number][];
}

class InvalidAnswerError extends Error {
  override name = 'InvalidAnswerError';
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const oneOf = <Option extends string | number>(
  options: readonly Option[],
  value: unknown,
  path: string,
): Option => {
  const option = options.find((candidate) => candidate === value);

  if (option === undefined) {
    throw new InvalidAnswerError(`${path} must be one of ${options.join(', ')}`);
  }

  return option;
};

const listOf = (value: unknown, path: string): unknown[] => {
  if (!Array.isArray(value)) {
    throw new InvalidAnswerError(`${path} must be a list`);
  }

  return value;
};

const scoredCategoriesOf = (scope: Scope): readonly string[] =>
  scope === 'mod' ? [...sceneCategories, ...modOnlyCategories] : sceneCategories;

const parseScore = (entry: unknown, path: string): number => {
  if (!isRecord(entry)) {
    throw new InvalidAnswerError(`${path} must be an object`);
  }

  if (!Array.isArray(entry.subchecks) || entry.subchecks.length === 0) {
    throw new InvalidAnswerError(`${path}.subchecks must list at least one subcheck`);
  }

  if (typeof entry.score !== 'number' || entry.score < 0 || entry.score > maximumScore) {
    throw new InvalidAnswerError(`${path}.score must be a number from 0 to ${maximumScore}`);
  }

  return entry.score;
};

const parseScores = (value: unknown, scope: Scope): Record<string, number> => {
  const scored = scoredCategoriesOf(scope);

  if (!isRecord(value)) {
    throw new InvalidAnswerError('categories must be an object');
  }

  if (
    Object.keys(value).length !== scored.length ||
    !scored.every((category) => category in value)
  ) {
    const found = Object.keys(value).join(', ');

    throw new InvalidAnswerError(`categories must be exactly ${scored.join(', ')}; found ${found}`);
  }

  return Object.fromEntries(
    scored.map((category): [string, number] => [
      category,
      parseScore(value[category], `categories.${category}`),
    ]),
  );
};

const parseFinding = (value: unknown, scope: Scope, path: string): Finding => {
  if (!isRecord(value)) {
    throw new InvalidAnswerError(`${path} must be an object`);
  }

  return {
    category: oneOf(scoredCategoriesOf(scope), value.category, `${path}.category`),
    severity: oneOf(severities, value.severity, `${path}.severity`),
  };
};

const listsExactlyModOnly = (value: unknown): boolean =>
  Array.isArray(value) &&
  value.length === modOnlyCategories.length &&
  modOnlyCategories.every((category) => value.includes(category));

const parseAnswer = (raw: unknown): Answer => {
  if (!isRecord(raw)) {
    throw new InvalidAnswerError('answer must be a JSON object');
  }

  const judge = oneOf(judges, raw.judge, 'judge');

  if (typeof raw.mock !== 'string') {
    throw new InvalidAnswerError('mock must be text');
  }

  const scope = oneOf(scopes, raw.scope, 'scope');

  if (scope === 'scene' && !listsExactlyModOnly(raw.notAssessed)) {
    throw new InvalidAnswerError(
      `notAssessed must list ${modOnlyCategories.join(', ')} for scope scene`,
    );
  }

  return {
    judge,
    mock: raw.mock,
    scope,
    scores: parseScores(raw.categories, scope),
    findings: listOf(raw.findings, 'findings').map((item, index) =>
      parseFinding(item, scope, `findings[${index}]`),
    ),
    hardFailures: listOf(raw.hardFailures, 'hardFailures').map((item, index) => {
      const kind = isRecord(item) ? item.kind : undefined;

      return oneOf(hardFailureKinds, kind, `hardFailures[${index}].kind`);
    }),
  };
};

const severityOneAllowance = (score: number): number =>
  severityOneLimits.find((limit) => score >= limit.minimumScore)?.allowed ??
  Number.POSITIVE_INFINITY;

const categoryRuleErrors = (category: string, score: number, findings: Finding[]): string[] => {
  const severityList = findings
    .filter((finding) => finding.category === category)
    .map((finding) => finding.severity);

  const severityOneCount = severityList.filter((severity) => severity === 1).length;
  const errors: string[] = [];

  if (severityList.some((severity) => severity >= majorSeverity) && score >= majorCapScore) {
    errors.push(
      `categories.${category} scores ${score}, but a severity 3 or 4 finding caps it below 8`,
    );
  }

  if (severityList.includes(2) && score >= passingScore) {
    errors.push(`categories.${category} scores ${score}, but a severity 2 finding caps it below 9`);
  }

  if (severityOneCount > severityOneAllowance(score)) {
    errors.push(
      `categories.${category} scores ${score} with ${severityOneCount} severity 1 findings, which is more than the score allows`,
    );
  }

  return errors;
};

export const checkAnswer = (raw: unknown): AnswerCheck => {
  try {
    const answer = parseAnswer(raw);

    const ruleErrors = Object.entries(answer.scores).flatMap(([category, score]) =>
      categoryRuleErrors(category, score, answer.findings),
    );

    return ruleErrors.length === 0 ? { answer, errors: [] } : { errors: ruleErrors };
  } catch (error) {
    if (!(error instanceof InvalidAnswerError)) {
      throw error;
    }

    return { errors: [error.message] };
  }
};

const answerFailures = (answer: Answer): string[] => [
  ...Object.entries(answer.scores)
    .filter(([, score]) => score < passingScore)
    .map(
      ([category, score]) =>
        `${answer.judge} scores ${category} ${score}; the gate needs ${passingScore} or more`,
    ),
  ...answer.hardFailures.map((kind) => `${answer.judge} lists hard failure ${kind}`),
];

const judgeFailures = (answers: Answer[], judge: Judge): string[] => {
  const count = answers.filter((answer) => answer.judge === judge).length;

  if (count === 1) {
    return [];
  }

  return [count === 0 ? `${judge} did not answer` : `${judge} answered ${count} times`];
};

const mismatch = (label: string, values: string[]): string[] => {
  const unique = [...new Set(values)];

  return unique.length > 1 ? [`answers name different ${label}: ${unique.join(', ')}`] : [];
};

export const gate = (answers: Answer[]): { passed: boolean; failures: string[] } => {
  const failures = [
    ...mismatch(
      'mocks',
      answers.map((answer) => answer.mock),
    ),
    ...mismatch(
      'scopes',
      answers.map((answer) => answer.scope),
    ),
    ...judges.flatMap((judge) => judgeFailures(answers, judge)),
    ...answers.flatMap(answerFailures),
  ];

  return { passed: failures.length === 0, failures };
};

const checkFile = async (file: string): Promise<AnswerCheck> => {
  try {
    const check = checkAnswer(JSON.parse(await readFile(file, 'utf8')));

    return { ...check, errors: check.errors.map((error) => `${file}: ${error}`) };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    return { errors: [`${file}: ${message}`] };
  }
};

if (import.meta.main) {
  const checks = await Promise.all(process.argv.slice(2).map(checkFile));
  const errors = checks.flatMap((check) => check.errors);

  if (errors.length > 0) {
    process.stdout.write(`${errors.join('\n')}\n`);
    process.exitCode = 1;
  } else {
    const result = gate(checks.flatMap((check) => check.answer ?? []));
    const verdict = result.passed ? ['pass'] : ['fail', ...result.failures];

    process.stdout.write(`${verdict.join('\n')}\n`);
    process.exitCode = result.passed ? 0 : 1;
  }
}
