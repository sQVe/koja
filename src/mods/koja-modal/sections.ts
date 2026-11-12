import type { NormalAction, NormalKey, SectionTarget } from '../../kit/normalKeys.ts';
import { listKeys } from '../../kit/normalKeys.ts';
import type { ListAction, Section } from '../../kit/section.ts';
import { hasList, listCommand, readSection, stepSection, writeSection } from '../../kit/section.ts';

interface SectionStore {
  get: (key: string) => unknown;
  set: (key: string, value: unknown) => void;
}

export interface SectionsDeps {
  store: SectionStore;
  run: (command: string, args?: Record<string, unknown>) => void;
  shown: () => ReadonlySet<Section>;
}

type SectionKeyAction = Extract<NormalAction, { kind: 'list' | 'section' }>;

export interface Sections {
  layer: () => readonly NormalKey[];
  execute: (action: SectionKeyAction) => void;
  check: () => void;
  reset: () => void;
}

export const isSectionKeyAction = (action: NormalAction): action is SectionKeyAction =>
  action.kind === 'list' || action.kind === 'section';

const noKeys: readonly NormalKey[] = [];

export const createSections = (deps: SectionsDeps): Sections => {
  const mark = (section: Section): void => {
    if (readSection(deps.store.get) === section) {
      return;
    }

    writeSection(deps.store.set, section);
  };

  const shownMark = (): Section => {
    const marked = readSection(deps.store.get);

    if (deps.shown().has(marked)) {
      return marked;
    }

    mark('panes');

    return 'panes';
  };

  const target = (from: Section, to: SectionTarget): Section => {
    if (to === 'panes') {
      return 'panes';
    }

    return stepSection(from, to === 'next' ? 1 : -1, deps.shown());
  };

  const runList = (section: Section, action: ListAction): void => {
    const command = listCommand(section, action);

    if (command !== null) {
      deps.run(command);
    }
  };

  const execute = (action: SectionKeyAction): void => {
    const marked = shownMark();

    if (action.kind === 'list') {
      runList(marked, action.action);

      return;
    }

    mark(target(marked, action.target));
  };

  const layer = (): readonly NormalKey[] => (hasList(shownMark()) ? listKeys : noKeys);

  return {
    layer,
    execute,
    check: () => {
      shownMark();
    },
    reset: () => {
      mark('panes');
    },
  };
};
