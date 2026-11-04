export interface Answer {
  judge: Judge;
  mock: string;
  scope: Scope;
  categories: Record<string, CategoryScore>;
  notAssessed: string[];
  findings: Finding[];
  hardFailures: HardFailure[];
  missingEvidence: string[];
}

export interface AnswerCheck {
  answer?: Answer;
  errors: string[];
}

interface CategoryScore {
  subchecks: Subcheck[];
  score: number;
  reason: string;
}

interface Finding {
  id: string;
  category: string;
  severity: number;
  location: string;
  evidence: string;
  task: string;
}

interface Subcheck {
  check: string;
  result: (typeof subcheckResults)[number];
  evidence: string;
}

interface HardFailure {
  kind: (typeof hardFailureKinds)[number];
  location: string;
  evidence: string;
}

type Parsed<Value> = { ok: true; value: Value } | { ok: false; errors: string[] };

export const judges = ['openai/gpt-6.1-sol', 'claude-opus-5-5'] as const;

const scopes = ['scene', 'mod'] as const;

type Scope = (typeof scopes)[number];

export type Judge = (typeof judges)[number];

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

const subcheckResults = ['yes', 'no', 'notApplicable', 'notObservable'] as const;

const hardFailureKinds = [
  'contrast',
  'hiddenTaskInformation',
  'unclearFocusOrMode',
  'offKitValue',
  'unreadableText',
] as const;

export const limits = {
  passingScore: 9,
  maximumScore: 10,
  maximumSeverity: 4,
  majorSeverity: 3,
  majorCapScore: 8,
};

const severityOneLimits = [
  { minimumScore: 10, allowed: 0 },
  { minimumScore: 9.5, allowed: 1 },
  { minimumScore: 9, allowed: 2 },
];

const succeed = <Value>(value: Value): Parsed<Value> => ({ ok: true, value });

const failed = <Value>(errors: string[]): Parsed<Value> => ({ ok: false, errors });

const errorsOf = (...parts: Parsed<unknown>[]): string[] =>
  parts.flatMap((part) => (part.ok ? [] : part.errors));

const collect = <Item>(results: Parsed<Item>[]): Parsed<Item[]> => {
  const errors = errorsOf(...results);

  if (errors.length > 0) {
    return failed(errors);
  }

  return succeed(results.flatMap((result) => (result.ok ? [result.value] : [])));
};

const mapParsed = <Value, Mapped>(
  parsed: Parsed<Value>,
  transform: (value: Value) => Mapped,
): Parsed<Mapped> => (parsed.ok ? succeed(transform(parsed.value)) : parsed);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isOneOf = <Option extends string>(
  options: readonly Option[],
  value: unknown,
): value is Option => options.some((option) => option === value);

const isWholeNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value);

const isStringList = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');

const parseFields = <Value>(
  value: unknown,
  path: string,
  parseValue: (record: Record<string, unknown>) => Parsed<Value>,
): Parsed<Value> => (isRecord(value) ? parseValue(value) : failed([`${path} must be an object`]));

const parseText = (value: unknown, path: string): Parsed<string> => {
  if (typeof value !== 'string') {
    return failed([`${path} must be text`]);
  }

  return succeed(value);
};

const parseOneOf = <Option extends string>(
  value: unknown,
  options: readonly Option[],
  path: string,
): Parsed<Option> => {
  if (!isOneOf(options, value)) {
    return failed([`${path} must be one of ${options.join(', ')}`]);
  }

  return succeed(value);
};

const parseNumberInRange = (
  value: unknown,
  minimum: number,
  maximum: number,
  path: string,
): Parsed<number> => {
  if (typeof value !== 'number' || value < minimum || value > maximum) {
    return failed([`${path} must be a number from ${minimum} to ${maximum}`]);
  }

  return succeed(value);
};

const parseSeverity = (value: unknown, path: string): Parsed<number> => {
  if (!isWholeNumber(value) || value < 0 || value > limits.maximumSeverity) {
    return failed([`${path} must be a whole number from 0 to ${limits.maximumSeverity}`]);
  }

  return succeed(value);
};

const parseList = <Item>(
  value: unknown,
  path: string,
  parseItem: (item: unknown, itemPath: string) => Parsed<Item>,
): Parsed<Item[]> => {
  if (!Array.isArray(value)) {
    return failed([`${path} must be a list`]);
  }

  return collect(value.map((item: unknown, index) => parseItem(item, `${path}[${index}]`)));
};

const parseSubcheck = (value: unknown, path: string): Parsed<Subcheck> =>
  parseFields(value, path, (record) => {
    const check = parseText(record.check, `${path}.check`);
    const result = parseOneOf(record.result, subcheckResults, `${path}.result`);
    const evidence = parseText(record.evidence, `${path}.evidence`);

    if (!check.ok || !result.ok || !evidence.ok) {
      return failed(errorsOf(check, result, evidence));
    }

    return succeed({ check: check.value, result: result.value, evidence: evidence.value });
  });

const parseSubchecks = (value: unknown, path: string): Parsed<Subcheck[]> => {
  const subchecks = parseList(value, path, parseSubcheck);

  if (subchecks.ok && subchecks.value.length === 0) {
    return failed([`${path} must list at least one subcheck`]);
  }

  return subchecks;
};

const parseCategoryScore = (value: unknown, path: string): Parsed<CategoryScore> =>
  parseFields(value, path, (record) => {
    const subchecks = parseSubchecks(record.subchecks, `${path}.subchecks`);
    const score = parseNumberInRange(record.score, 0, limits.maximumScore, `${path}.score`);
    const reason = parseText(record.reason, `${path}.reason`);

    if (!subchecks.ok || !score.ok || !reason.ok) {
      return failed(errorsOf(subchecks, score, reason));
    }

    return succeed({ subchecks: subchecks.value, score: score.value, reason: reason.value });
  });

const scoredCategoriesOf = (scope: Scope): readonly string[] =>
  scope === 'mod' ? [...sceneCategories, ...modOnlyCategories] : sceneCategories;

const parseCategories = (value: unknown, scope: Scope): Parsed<Record<string, CategoryScore>> => {
  if (!isRecord(value)) {
    return failed(['categories must be an object']);
  }

  const scored = scoredCategoriesOf(scope);

  const missingErrors = scored
    .filter((category) => !(category in value))
    .map((category) => `categories.${category} is missing; scope ${scope} scores it`);

  const unscoredErrors = Object.keys(value)
    .filter((category) => !scored.includes(category))
    .map((category) => `categories.${category} is not scored for scope ${scope}`);

  const scores = collect(
    Object.keys(value).map((category) =>
      mapParsed(
        parseCategoryScore(value[category], `categories.${category}`),
        (score): [string, CategoryScore] => [category, score],
      ),
    ),
  );

  if (missingErrors.length > 0 || unscoredErrors.length > 0 || !scores.ok) {
    return failed([...missingErrors, ...unscoredErrors, ...errorsOf(scores)]);
  }

  return succeed(Object.fromEntries(scores.value));
};

const parseNotAssessed = (value: unknown, scope: Scope): Parsed<string[]> => {
  const expected = scope === 'mod' ? [] : modOnlyCategories;

  const isExpected =
    isStringList(value) &&
    value.length === expected.length &&
    expected.every((category) => value.includes(category));

  if (!isExpected) {
    return failed([`notAssessed must list exactly the categories scope ${scope} does not score`]);
  }

  return succeed(value);
};

const parseFindingLabel = (
  record: Record<string, unknown>,
  path: string,
  scope: Scope,
): Parsed<Pick<Finding, 'id' | 'category' | 'severity'>> => {
  const id = parseText(record.id, `${path}.id`);
  const category = parseOneOf(record.category, scoredCategoriesOf(scope), `${path}.category`);
  const severity = parseSeverity(record.severity, `${path}.severity`);

  if (!id.ok || !category.ok || !severity.ok) {
    return failed(errorsOf(id, category, severity));
  }

  return succeed({ id: id.value, category: category.value, severity: severity.value });
};

const parseFindingDetail = (
  record: Record<string, unknown>,
  path: string,
): Parsed<Pick<Finding, 'location' | 'evidence' | 'task'>> => {
  const location = parseText(record.location, `${path}.location`);
  const evidence = parseText(record.evidence, `${path}.evidence`);
  const task = parseText(record.task, `${path}.task`);

  if (!location.ok || !evidence.ok || !task.ok) {
    return failed(errorsOf(location, evidence, task));
  }

  return succeed({ location: location.value, evidence: evidence.value, task: task.value });
};

const parseFinding = (value: unknown, path: string, scope: Scope): Parsed<Finding> =>
  parseFields(value, path, (record) => {
    const label = parseFindingLabel(record, path, scope);
    const detail = parseFindingDetail(record, path);

    if (!label.ok || !detail.ok) {
      return failed(errorsOf(label, detail));
    }

    return succeed({ ...label.value, ...detail.value });
  });

const parseHardFailure = (value: unknown, path: string): Parsed<HardFailure> =>
  parseFields(value, path, (record) => {
    const kind = parseOneOf(record.kind, hardFailureKinds, `${path}.kind`);
    const location = parseText(record.location, `${path}.location`);
    const evidence = parseText(record.evidence, `${path}.evidence`);

    if (!kind.ok || !location.ok || !evidence.ok) {
      return failed(errorsOf(kind, location, evidence));
    }

    return succeed({ kind: kind.value, location: location.value, evidence: evidence.value });
  });

const severityOneLimit = (score: number): number =>
  severityOneLimits.find((limit) => score >= limit.minimumScore)?.allowed ??
  Number.POSITIVE_INFINITY;

const categoryRuleErrors = (category: string, score: number, findings: Finding[]): string[] => {
  const severities = findings
    .filter((finding) => finding.category === category)
    .map((finding) => finding.severity);

  const severityOneCount = severities.filter((severity) => severity === 1).length;
  const errors: string[] = [];

  if (
    severities.some((severity) => severity >= limits.majorSeverity) &&
    score >= limits.majorCapScore
  ) {
    errors.push(
      `categories.${category} scores ${score}, but a severity 3 or 4 finding caps it below 8`,
    );
  }

  if (severities.includes(2) && score >= limits.passingScore) {
    errors.push(`categories.${category} scores ${score}, but a severity 2 finding caps it below 9`);
  }

  if (severityOneCount > severityOneLimit(score)) {
    errors.push(
      `categories.${category} scores ${score} with ${severityOneCount} severity 1 findings, which is more than the score allows`,
    );
  }

  return errors;
};

const scoreRuleErrors = (answer: Answer): string[] =>
  Object.entries(answer.categories).flatMap(([category, entry]) =>
    categoryRuleErrors(category, entry.score, answer.findings),
  );

const parseHeader = (raw: Record<string, unknown>): Parsed<Pick<Answer, 'judge' | 'mock'>> => {
  const version = raw.version === 1 ? succeed(1) : failed<1>(['version must be 1']);
  const judge = parseOneOf(raw.judge, judges, 'judge');
  const mock = parseText(raw.mock, 'mock');

  if (!version.ok || !judge.ok || !mock.ok) {
    return failed(errorsOf(version, judge, mock));
  }

  return succeed({ judge: judge.value, mock: mock.value });
};

const parseBody = (
  raw: Record<string, unknown>,
  scope: Scope,
): Parsed<Pick<Answer, 'categories' | 'notAssessed'>> => {
  const parsedCategories = parseCategories(raw.categories, scope);
  const notAssessed = parseNotAssessed(raw.notAssessed, scope);

  if (!parsedCategories.ok || !notAssessed.ok) {
    return failed(errorsOf(parsedCategories, notAssessed));
  }

  return succeed({ categories: parsedCategories.value, notAssessed: notAssessed.value });
};

const parseLists = (
  raw: Record<string, unknown>,
  scope: Scope,
): Parsed<Pick<Answer, 'findings' | 'hardFailures' | 'missingEvidence'>> => {
  const findings = parseList(raw.findings, 'findings', (item, path) =>
    parseFinding(item, path, scope),
  );

  const hardFailures = parseList(raw.hardFailures, 'hardFailures', parseHardFailure);
  const missingEvidence = parseList(raw.missingEvidence, 'missingEvidence', parseText);

  if (!findings.ok || !hardFailures.ok || !missingEvidence.ok) {
    return failed(errorsOf(findings, hardFailures, missingEvidence));
  }

  return succeed({
    findings: findings.value,
    hardFailures: hardFailures.value,
    missingEvidence: missingEvidence.value,
  });
};

const parseAnswer = (raw: unknown): Parsed<Answer> => {
  if (!isRecord(raw)) {
    return failed(['answer must be a JSON object']);
  }

  const scope = parseOneOf(raw.scope, scopes, 'scope');

  if (!scope.ok) {
    return failed(scope.errors);
  }

  const header = parseHeader(raw);
  const body = parseBody(raw, scope.value);
  const lists = parseLists(raw, scope.value);

  if (!header.ok || !body.ok || !lists.ok) {
    return failed(errorsOf(header, body, lists));
  }

  return succeed({ ...header.value, scope: scope.value, ...body.value, ...lists.value });
};

export const checkAnswer = (raw: unknown): AnswerCheck => {
  const parsed = parseAnswer(raw);

  if (!parsed.ok) {
    return { errors: parsed.errors };
  }

  const ruleErrors = scoreRuleErrors(parsed.value);

  return ruleErrors.length === 0 ? { answer: parsed.value, errors: [] } : { errors: ruleErrors };
};
