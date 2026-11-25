import type { PullRemote } from './pullRemote.ts';

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

// The open alias matches a pull request by its head branch name alone, so a fork's pull request
// whose head branch has the same name as a local branch comes back as that branch's pull request.
// `first: 1` then picks one when several share the head.
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

export const pullQueryArgs = (branches: string[], remote: PullRemote | null): string[] => {
  if (branches.length === 0) {
    throw new Error('pullQueryArgs takes at least 1 branch');
  }

  if (branches.length > branchesPerQuery) {
    throw new Error(`pullQueryArgs takes at most ${branchesPerQuery} branches`);
  }

  const args = ['api', 'graphql'];

  if (remote !== null) {
    args.push('--hostname', remote.host);
  }

  const nameFlag = remote === null ? '-F' : '-f';
  const owner = remote === null ? '{owner}' : remote.owner;
  const repository = remote === null ? '{repo}' : remote.repository;

  args.push(
    nameFlag,
    `owner=${owner}`,
    nameFlag,
    `name=${repository}`,
    '-f',
    `query=${queryText(branches.length)}`,
  );

  for (const [index, branch] of branches.entries()) {
    args.push('-f', `branch${index}=${branch}`);
  }

  return args;
};

export const batchesOf = (branches: string[]): string[][] => {
  const batches: string[][] = [];

  for (let index = 0; index < branches.length; index += branchesPerQuery) {
    batches.push(branches.slice(index, index + branchesPerQuery));
  }

  return batches;
};
