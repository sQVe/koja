import type { LayoutNode } from './layout.ts';

export type Section = 'sidebar' | 'panes';

export type SectionStep = 1 | -1;

const listActions = ['down', 'up', 'first', 'last', 'halfPageDown', 'halfPageUp', 'open'] as const;

export type ListAction = (typeof listActions)[number];

const cycle: readonly Section[] = ['sidebar', 'panes'];

const sectionKey = 'section.marked';

const listCommandNames: Record<ListAction, string> = {
  down: 'list-down',
  up: 'list-up',
  first: 'list-first',
  last: 'list-last',
  halfPageDown: 'list-half-page-down',
  halfPageUp: 'list-half-page-up',
  open: 'list-open',
};

const listMods: Record<Section, string | null> = {
  sidebar: 'koja-spaces',
  panes: null,
};

const isSection = (value: unknown): value is Section => cycle.some((section) => section === value);

export const stepSection = (
  from: Section,
  step: SectionStep,
  shown: ReadonlySet<Section>,
): Section => {
  const start = cycle.indexOf(from);

  for (let distance = 1; distance < cycle.length; distance += 1) {
    const index = (start + step * distance + cycle.length) % cycle.length;
    const candidate = cycle[index];

    if (candidate !== undefined && shown.has(candidate)) {
      return candidate;
    }
  }

  return 'panes';
};

export const readSection = (get: (key: string) => unknown): Section => {
  const value = get(sectionKey);

  return isSection(value) ? value : 'panes';
};

export const writeSection = (
  set: (key: string, value: unknown) => void,
  section: Section,
): void => {
  set(sectionKey, section);
};

export const hasList = (section: Section): boolean => listMods[section] !== null;

export const listCommand = (section: Section, action: ListAction): string | null => {
  const mod = listMods[section];

  if (mod === null) {
    return null;
  }

  return `${mod}.${listCommandNames[action]}`;
};

export const listActionOf = (command: string): ListAction | null =>
  listActions.find((action) => listCommandNames[action] === command) ?? null;

export const shownSections = (sidebar: LayoutNode | null): ReadonlySet<Section> => {
  const shown = new Set<Section>();

  if (sidebar?.hidden === false) {
    shown.add('sidebar');
  }

  shown.add('panes');

  return shown;
};
