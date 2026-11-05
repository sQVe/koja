import { controlSize, paneHeaderWidth } from './size.ts';

export type PaneHeaderFieldState = 'full' | 'cut' | 'dropped';

export interface PaneHeaderFields {
  task: boolean;
  branch: PaneHeaderFieldState;
  folder: PaneHeaderFieldState;
  compact: boolean;
}

export interface PaneHeaderFieldsInput {
  width?: number | null;
  name: string;
  task?: string;
  branch?: string;
  folder?: string;
}

interface FieldSizes {
  fixed: number;
  task: number;
  branchFull: number;
  branchMinimum: number;
  folderFull: number;
  folderMinimum: number;
}

const isPresent = (text: string | undefined): text is string => text !== undefined && text !== '';

// The header budgets width from the glyph estimate, so a field shows in full while it fits, cuts in
// the middle while it keeps its minimum width, and only then leaves whole.
const estimate = (text: string): number => text.length * paneHeaderWidth.glyph;

const baseWidth = (name: string, actions: number): number =>
  paneHeaderWidth.padding +
  paneHeaderWidth.icon +
  Math.min(estimate(name), controlSize.paneLabelMaxWidth) +
  paneHeaderWidth.status +
  actions +
  paneHeaderWidth.gaps;

const fieldSizes = (input: PaneHeaderFieldsInput, actions: number): FieldSizes => ({
  fixed: baseWidth(input.name, actions),
  task: isPresent(input.task) ? estimate(input.task) : 0,
  branchFull: isPresent(input.branch) ? estimate(input.branch) + paneHeaderWidth.branchIcon : 0,
  branchMinimum: isPresent(input.branch) ? paneHeaderWidth.fieldMinimum : 0,
  folderFull: isPresent(input.folder) ? estimate(input.folder) : 0,
  folderMinimum: isPresent(input.folder) ? paneHeaderWidth.fieldMinimum : 0,
});

const fieldResult = (
  width: number,
  sizes: FieldSizes,
  beforeWidth: number,
  fullWidth: number,
  minimumWidth: number,
): PaneHeaderFieldState => {
  const available = width - sizes.fixed - sizes.task - beforeWidth;

  if (available >= fullWidth) {
    return 'full';
  }

  if (available >= minimumWidth) {
    return 'cut';
  }

  return 'dropped';
};

const statesFor = (
  input: PaneHeaderFieldsInput,
  width: number,
  actions: number,
): { branch: PaneHeaderFieldState; folder: PaneHeaderFieldState } => {
  const sizes = fieldSizes(input, actions);

  return {
    branch: isPresent(input.branch)
      ? fieldResult(width, sizes, 0, sizes.branchFull, sizes.branchMinimum)
      : 'dropped',
    folder: isPresent(input.folder)
      ? fieldResult(width, sizes, sizes.branchFull, sizes.folderFull, sizes.folderMinimum)
      : 'dropped',
  };
};

const drops = (field: PaneHeaderFieldState, text: string | undefined): boolean =>
  isPresent(text) && field === 'dropped';

export const paneHeaderFields = (input: PaneHeaderFieldsInput): PaneHeaderFields => {
  const width = input.width ?? Number.POSITIVE_INFINITY;
  const withFour = statesFor(input, width, paneHeaderWidth.actions);

  const dropsWithFour =
    drops(withFour.branch, input.branch) || drops(withFour.folder, input.folder);

  const compact = width < paneHeaderWidth.compact || dropsWithFour;

  const fields = compact ? statesFor(input, width, paneHeaderWidth.overflowAction) : withFour;

  return {
    task: isPresent(input.task),
    branch: fields.branch,
    folder: fields.folder,
    compact,
  };
};
