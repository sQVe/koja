import type { StackCardModel } from '../../kit/index.ts';

type StackCardFixture = Omit<StackCardModel, 'title'>;

const dataLayerPull = 502;
const twoLineRowsPull = 504;
const statusMarksPull = 505;

export const stackCardFixture: StackCardFixture = {
  project: 'koja',
  merged: [dataLayerPull, twoLineRowsPull, statusMarksPull],
  pulls: [
    { number: 507, ticket: 'ME-1035', title: 'Stack panel', checkedOut: false, end: 'merge' },
    { number: 509, ticket: 'ME-1036', title: 'Row menu', checkedOut: false, end: 'review' },
    { number: 511, ticket: 'ME-1037', title: 'Narrow rail', checkedOut: false, end: 'draft' },
    { number: 512, ticket: 'ME-1038', title: 'Keys', checkedOut: false, end: 'draft' },
    { number: 514, ticket: 'ME-1031', title: 'Tau workflow sidebar', checkedOut: true, end: null },
  ],
  total: 8,
};
