import type { ContentItem } from '../content/data.ts';
import type { Slice, WorkItem } from './data.ts';
import { sliceAgents, slices, ticketItems } from './data.ts';

const identifiers: Record<string, string> = {
  'ME-1280': 'koja-7fq3',
  'ME-1090': 'koja-h6pt',
  'ME-1281': 'koja-m4rd',
  'ME-1282': 'koja-p6wx',
  'ME-1283': 'koja-r7kc',
  'ME-1284': 'koja-w8mn',
  'ME-1285': 'koja-x9qp',
  'ME-1286': 'koja-y3rt',
  'ME-1287': 'koja-z4wh',
  'AI-412': 'koja-a4dm',
  'AI-413': 'koja-b6kr',
  'AI-414': 'koja-c7np',
  'AI-418': 'koja-d8qw',
  'AI-419': 'koja-e9rx',
  'AI-420': 'koja-f3ty',
};

const identifierOf = (identifier: string): string => {
  const translated = identifiers[identifier];

  if (translated === undefined) {
    throw new Error(`No tikk fixture identifier for ${identifier}`);
  }

  return translated;
};

const referencesOf = (text: string): string => {
  let translated = text.replaceAll('agent tickets', 'instructions');

  for (const [linear, tikk] of Object.entries(identifiers)) {
    translated = translated.replaceAll(linear, tikk);
  }

  return translated;
};

const instructionOf = (item: WorkItem): WorkItem => {
  if (item.identifier === undefined) {
    return item;
  }

  return { ...item, identifier: identifierOf(item.identifier), tracker: 'open' };
};

export const tikkSlices: Slice[] = slices.map((slice) => {
  const translated = Object.assign({}, slice);

  translated.identifier = identifierOf(slice.identifier);
  translated.tracker = 'open';

  if (slice.detail !== undefined) {
    translated.detail = referencesOf(slice.detail);
  }

  return translated;
});

export const tikkAgents: Record<string, WorkItem[]> = Object.fromEntries(
  Object.entries(sliceAgents).map(([identifier, agents]) => [
    identifierOf(identifier),
    agents.map(instructionOf),
  ]),
);

export const tikkItem: ContentItem = {
  ...ticketItems.container,
  identifier: 'koja-7fq3',
  source: 'tikk',
  state: 'open',
  tab: 'koja-7fq3 Build the sidebar',
  description: ticketItems.container.description.map(referencesOf),
  facts: [
    { name: 'Project', value: 'Koja' },
    { name: 'Related', value: 'koja-h6pt', target: 'tikk' },
  ],
};
