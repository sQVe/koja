export const branchesPerQuery = 20;

const openFields = [
  'number',
  'state',
  'isDraft',
  'title',
  'headRefName',
  'mergeable',
  'mergeStateStatus',
  'reviewDecision',
  'commits(last: 1) { nodes { commit { statusCheckRollup { state } } } }',
  'reviewThreads(first: 100) { pageInfo { hasNextPage } nodes { isResolved } }',
].join(' ');

const latestFields = ['number', 'state', 'isDraft', 'title', 'headRefName'].join(' ');

const branchVariables = (branchCount: number): string[] =>
  Array.from({ length: branchCount }, (_, index) => `$branch${index}: String!`);

const openAlias = (index: number): string[] => [
  `    open${index}: pullRequests(headRefName: $branch${index}, states: OPEN, first: 1) {`,
  `      nodes { ${openFields} }`,
  '    }',
];

const latestAlias = (index: number): string[] => [
  `    latest${index}: pullRequests(headRefName: $branch${index}, first: 1, orderBy: { field: CREATED_AT, direction: DESC }) {`,
  `      nodes { ${latestFields} }`,
  '    }',
];

const queryText = (branchCount: number): string => {
  const variables = ['$owner: String!', '$name: String!', ...branchVariables(branchCount)];

  const lines = [
    `query (${variables.join(', ')}) {`,
    '  rateLimit { cost remaining resetAt }',
    '  repository(owner: $owner, name: $name) {',
  ];

  for (let index = 0; index < branchCount; index += 1) {
    lines.push(...openAlias(index), ...latestAlias(index));
  }

  lines.push('  }', '}');

  return lines.join('\n');
};

export const pullQueryArgs = (branches: string[], host: string | null): string[] => {
  const tooFew = branches.length === 0;
  const tooMany = branches.length > branchesPerQuery;

  if (tooFew || tooMany) {
    throw new Error('pullQueryArgs takes 1 to 20 branches');
  }

  const args = ['api', 'graphql'];

  if (host !== null) {
    args.push('--hostname', host);
  }

  args.push(
    '-F',
    'owner={owner}',
    '-F',
    'name={repo}',
    '-f',
    `query=${queryText(branches.length)}`,
  );

  for (const [index, branch] of branches.entries()) {
    args.push('-f', `branch${index}=${branch}`);
  }

  return args;
};
