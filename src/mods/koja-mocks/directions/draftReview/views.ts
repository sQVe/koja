import type { ContentItem } from '../content/data.ts';
import type { DraftState, DraftView } from './data.ts';
import { bodyFile, draftFiles, draftItem, releaseFile } from './data.ts';
import { planFiles, selectedSlice } from './plan.ts';

const itemFor = (state: DraftState): ContentItem => {
  if (state === 'broken') {
    return { ...draftItem, title: null, state: null, tab: 'Draft review', facts: [] };
  }

  if (state === 'sent') {
    return {
      ...draftItem,
      state: 'sent',
      facts: draftItem.facts.map((fact) =>
        fact.name === 'Saved' ? { name: 'Sent', value: 'just now' } : fact,
      ),
    };
  }

  if (state === 'edit-file') {
    return {
      ...draftItem,
      facts: draftItem.facts.map((fact) =>
        fact.name === 'Saved' ? { name: 'Saved', value: 'just now' } : fact,
      ),
    };
  }

  const unsaved = state === 'saving-failed' || state === 'changed-on-disk';

  if (unsaved) {
    return {
      ...draftItem,
      facts: draftItem.facts.map((fact) =>
        fact.name === 'Saved' ? { name: 'Saved', value: 'unsaved', warning: true } : fact,
      ),
    };
  }

  return draftItem;
};

export const draftView = (state: DraftState): DraftView => {
  if (state === 'plan') {
    return {
      state,
      files: planFiles,
      selected: selectedSlice,
      item: {
        ...draftItem,
        title: 'Review 9 drafts',
        tab: 'Review 9 drafts',
        facts: [
          { name: 'From', value: 'Tau' },
          { name: 'Agent', value: 'Design the sidebar', target: 'agent' },
          { name: 'Comments', value: '5' },
          { name: 'Edits', value: '2 lines' },
          { name: 'Saved', value: '1m ago' },
          { name: 'Folder', value: '.tau/slices/sidebar' },
        ],
      },
    };
  }

  const selected = state === 'file-comment' ? releaseFile : bodyFile;

  return { state, item: itemFor(state), files: draftFiles, selected };
};
