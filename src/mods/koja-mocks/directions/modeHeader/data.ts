import type { FakePane } from '../../scenes/shellContent.ts';
import { agentPane } from '../../scenes/shellContent.ts';

export const reviewPane: FakePane = {
  program: agentPane.program,
  name: 'Codex',
  task: 'Review the hover card',
  branch: 'me-1104-hover-card',
  folder: agentPane.folder,
  status: 'done',
  lines: [
    '> Review the hover card',
    'Read src/kit/hoverCard.ts',
    'Read src/kit/hoverCard.test.ts',
    'No findings. The card closes on Escape.',
  ],
};
