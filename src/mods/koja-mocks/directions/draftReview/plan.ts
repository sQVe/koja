import type { DraftComment, DraftFile } from './data.ts';

const sliceFile = (name: string, goal: string, comments: DraftComment[]): DraftFile => ({
  name,
  comments,
  lines: [
    `# ${goal}`,
    '',
    '## Goal',
    goal,
    'Keep the sidebar review local to this worktree.',
    '',
    '## Design',
    '- Reuse the shared content pane and kit controls.',
    '- Keep the current space visible during a refresh.',
    '- Preserve the last good state if a read fails.',
    '',
    '## Acceptance',
    '- [ ] Load the selected space without changing focus.',
    '- [ ] Save only when the expected snapshot matches.',
    '- [ ] Keep local edits when another process writes.',
    '- [ ] Show a recovery action beside the failed part.',
    '- [ ] Keep keyboard navigation unchanged.',
    '',
    '## Testing',
    '- Add tests for a fresh write and a stale snapshot.',
    '- Check the sidebar in the isolated sandbox.',
    '- Run typecheck, style, formatting, and affected tests.',
    '',
    '## Dependencies',
    'Build on the request reader and shared content frame.',
    'The next slice adds review submission and collection.',
  ],
});

export const selectedSlice = sliceFile('slice-3.md', 'Save staged drafts without losing edits', [
  {
    anchor: 'File',
    start: null,
    end: null,
    text: 'Keep this slice focused on the local save path.',
  },
  {
    anchor: 'L14–16',
    start: 14,
    end: 16,
    text: 'Include the stale-write case in this test.',
  },
]);

export const planFiles: DraftFile[] = [
  {
    name: 'plan.md',
    lines: ['# Sidebar review plan', '', 'Build the review in seven independently checked slices.'],
    comments: [
      {
        anchor: 'File',
        start: null,
        end: null,
        text: 'Name the user-visible result of each slice.',
      },
    ],
  },
  {
    name: 'container.md',
    lines: ['# Build the sidebar review', '', 'Deliver the seven slices in order.'],
    comments: [],
  },
  sliceFile('slice-1.md', 'Read the draft review request', [
    {
      anchor: 'L13',
      start: 13,
      end: 13,
      text: 'Reject a newer request version before reading files.',
    },
  ]),
  sliceFile('slice-2.md', 'Draw drafts in the shared content frame', []),
  selectedSlice,
  sliceFile('slice-4.md', 'Anchor file and line comments', []),
  sliceFile('slice-5.md', 'Send the saved review back to Tau', [
    { anchor: 'File', start: null, end: null, text: 'Keep collection separate from approval.' },
  ]),
  sliceFile('slice-6.md', 'Recover from unreadable and stale files', []),
  sliceFile('slice-7.md', 'Check the complete review in the sandbox', []),
];
