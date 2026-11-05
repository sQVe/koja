import { controlSize, paneHeaderWidth } from './size.ts';

export interface PaneHeaderFields {
  task: boolean;
  branch: boolean;
  folder: boolean;
  compact: boolean;
}

export interface PaneHeaderFieldsInput {
  width?: number | null;
  name: string;
  task?: string;
  branch?: string;
  folder?: string;
}

const isPresent = (text: string | undefined): text is string => text !== undefined && text !== '';

// The header budgets width from the glyph estimate, so the task shows in full while a folder or
// branch is up; a field leaves whole before the next one gives up any width.
const estimate = (text: string, cap: number): number =>
  Math.min(text.length * paneHeaderWidth.glyph, cap);

export const paneHeaderFields = (input: PaneHeaderFieldsInput): PaneHeaderFields => {
  const width = input.width ?? Number.POSITIVE_INFINITY;
  const compact = width < paneHeaderWidth.compact;
  const actions = compact ? paneHeaderWidth.overflowAction : paneHeaderWidth.actions;

  const fixed =
    paneHeaderWidth.padding +
    paneHeaderWidth.icon +
    estimate(input.name, controlSize.paneLabelMaxWidth) +
    paneHeaderWidth.status +
    actions +
    paneHeaderWidth.gaps;

  const taskWidth = isPresent(input.task) ? estimate(input.task, Number.POSITIVE_INFINITY) : 0;

  const branchWidth = isPresent(input.branch)
    ? estimate(input.branch, paneHeaderWidth.branchLabel) + paneHeaderWidth.branchIcon
    : 0;

  const folderWidth = isPresent(input.folder)
    ? estimate(input.folder, paneHeaderWidth.folderLabel)
    : 0;

  const taskFits = fixed + taskWidth <= width;
  const taskAndBranch = fixed + taskWidth + branchWidth;

  const branchFits = isPresent(input.branch) && taskFits && taskAndBranch <= width;
  const folderFits = isPresent(input.folder) && taskFits && taskAndBranch + folderWidth <= width;

  return {
    task: isPresent(input.task),
    branch: branchFits,
    folder: folderFits,
    compact,
  };
};
