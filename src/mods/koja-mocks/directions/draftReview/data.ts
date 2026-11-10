import { contentItems } from '../content/data.ts';
import type { ContentItem } from '../content/data.ts';

export type DraftState =
  | 'comment'
  | 'range'
  | 'file-comment'
  | 'edit-line'
  | 'edit-file'
  | 'saving-failed'
  | 'changed-on-disk'
  | 'sent'
  | 'broken'
  | 'plan'
  | 'normal';

export interface DraftComment {
  anchor: string;
  text: string;
  start: number | null;
  end: number | null;
}

export interface DraftFile {
  name: string;
  lines: string[];
  comments: DraftComment[];
}

export interface DraftView {
  state: DraftState;
  item: ContentItem;
  files: DraftFile[];
  selected: DraftFile;
}

export const draftFolder = '.tau/pr/run-zCAlBX';

export const draftItem: ContentItem = {
  ...contentItems.review,
  title: 'Review 3 drafts',
  tab: 'Review 3 drafts',
  facts: [
    { name: 'From', value: 'Tau' },
    { name: 'Agent', value: 'Design the sidebar', target: 'agent' },
    { name: 'Comments', value: '3' },
    { name: 'Saved', value: '1m ago' },
    { name: 'Folder', value: draftFolder },
  ],
};

export const bodyFile: DraftFile = {
  name: 'body.md',
  comments: [
    {
      anchor: 'File',
      text: 'Lead with the user-facing change, then the refactor.',
      start: null,
      end: null,
    },
    {
      anchor: 'L12–14',
      text: 'These three bullets say the same thing. Merge them.',
      start: 12,
      end: 14,
    },
  ],
  lines: [
    '## Summary',
    '',
    'Make active work easier to find in the sidebar.',
    'Group spaces by project and keep context close.',
    '',
    '- Keep the selected space visible when groups fold.',
    '- Show the branch beside each space.',
    '- Link work items to their source.',
    '',
    '## Changes',
    '',
    '- Make work-need marks easier to scan.',
    '- Keep work-need marks visible in folded groups.',
    '- Show work-need marks beside active spaces.',
    '',
    '## Testing',
    '',
    '- Check the sidebar in the sandbox.',
    '- Switch between spaces and fold each project.',
    '- Check insert and normal mode.',
    '',
    'No changes to terminal sessions or key bindings.',
  ],
};

export const releaseFile: DraftFile = {
  name: 'release-notes.md',
  comments: [{ start: 3, end: 3, anchor: 'L3', text: 'Say which mods change.' }],
  lines: [
    '## Sidebar',
    '',
    '- Update the sidebar mods.',
    '- Keep active work visible in folded projects.',
    '- Keep source links beside the work.',
    '- Preserve existing keyboard navigation.',
  ],
};

export const draftFiles: DraftFile[] = [
  { name: 'title.md', comments: [], lines: ['Design the sidebar'] },
  bodyFile,
  releaseFile,
];

export const isBodyFile = (file: DraftFile): boolean => file.name === 'body.md';
export const editedLineNumber = 6;
export const composingLineNumber = 18;
export const selectedRange = { start: 19, end: 20 };
export const retypedLine = '- Keep the selected space in view when groups fold.';

export const showsLineComposer = (state: DraftState): boolean =>
  state === 'comment' || state === 'normal';
