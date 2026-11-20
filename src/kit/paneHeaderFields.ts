import { badgeSize, controlSize, paneHeaderWidth } from './size.ts';

export type PaneHeaderFieldState = 'full' | 'cut' | 'dropped';

export interface PaneHeaderFields {
  task: 'shown' | 'hidden';
  role: 'full' | 'cut';
  branch: PaneHeaderFieldState;
  folder: PaneHeaderFieldState;
  compact: boolean;
}

export interface PaneHeaderFieldsInput {
  width?: number | null;
  name: string;
  role?: string;
  task?: string;
  branch?: string;
  folder?: string;
  showsProgramIcon: boolean;
  statusWidth: number;
}

interface FieldSizes {
  fixed: number;
  branchFull: number;
  branchMinimum: number;
  folderFull: number;
  folderMinimum: number;
}

const isPresent = (text: string | undefined): text is string => text !== undefined && text !== '';

const estimate = (text: string): number => text.length * paneHeaderWidth.glyph;

const roleWidth = (role: string | undefined): number =>
  isPresent(role) ? role.length * paneHeaderWidth.badgeGlyph + badgeSize.horizontal : 0;

const gapCount = (children: number): number => Math.max(0, children - 1);

const baseWidth = (input: PaneHeaderFieldsInput, actions: number, includeTask: boolean): number => {
  const hasTask = includeTask && isPresent(input.task);

  const fieldChildren =
    (input.showsProgramIcon ? 1 : 0) +
    (isPresent(input.role) ? 1 : 0) +
    (hasTask ? 1 : 0) +
    (input.statusWidth > 0 ? 1 : 0);

  // Count the name and one action group even when the buttons are hidden.
  const children = 2 + fieldChildren;

  return (
    paneHeaderWidth.padding +
    (input.showsProgramIcon ? paneHeaderWidth.icon : 0) +
    Math.min(estimate(input.name), controlSize.paneLabelMaxWidth) +
    roleWidth(input.role) +
    (hasTask ? estimate(input.task ?? '') : 0) +
    input.statusWidth +
    actions +
    gapCount(children) * paneHeaderWidth.gap
  );
};

const fieldSizes = (
  input: PaneHeaderFieldsInput,
  actions: number,
  includeTask: boolean,
): FieldSizes => ({
  fixed: baseWidth(input, actions, includeTask),
  branchFull: isPresent(input.branch)
    ? estimate(input.branch) + paneHeaderWidth.branchIcon + paneHeaderWidth.gap
    : 0,
  branchMinimum: isPresent(input.branch) ? paneHeaderWidth.fieldMinimum + paneHeaderWidth.gap : 0,
  folderFull: isPresent(input.folder) ? estimate(input.folder) + paneHeaderWidth.gap : 0,
  folderMinimum: isPresent(input.folder) ? paneHeaderWidth.fieldMinimum + paneHeaderWidth.gap : 0,
});

const fieldResult = (
  width: number,
  sizes: FieldSizes,
  beforeWidth: number,
  fullWidth: number,
  minimumWidth: number,
): PaneHeaderFieldState => {
  const available = width - sizes.fixed - beforeWidth;

  if (available >= fullWidth) {
    return 'full';
  }

  if (available >= minimumWidth) {
    return 'cut';
  }

  return 'dropped';
};

const stateWidth = (state: PaneHeaderFieldState, full: number, minimum: number): number => {
  if (state === 'full') {
    return full;
  }

  if (state === 'cut') {
    return minimum;
  }

  return 0;
};

const roleState = (
  input: PaneHeaderFieldsInput,
  width: number,
  sizes: FieldSizes,
  branchWidth: number,
  folderWidth: number,
): 'full' | 'cut' => {
  if (!isPresent(input.role)) {
    return 'full';
  }

  const used = sizes.fixed + branchWidth + folderWidth;

  return width >= used ? 'full' : 'cut';
};

const statesFor = (
  input: PaneHeaderFieldsInput,
  width: number,
  actions: number,
): {
  task: 'shown' | 'hidden';
  branch: PaneHeaderFieldState;
  folder: PaneHeaderFieldState;
  role: 'full' | 'cut';
} => {
  const sizes = fieldSizes(input, actions, true);

  const branch = isPresent(input.branch)
    ? fieldResult(width, sizes, 0, sizes.branchFull, sizes.branchMinimum)
    : 'dropped';

  const branchWidth = stateWidth(branch, sizes.branchFull, sizes.branchMinimum);

  const folder = isPresent(input.folder)
    ? fieldResult(width, sizes, sizes.branchFull, sizes.folderFull, sizes.folderMinimum)
    : 'dropped';

  const folderWidth = stateWidth(folder, sizes.folderFull, sizes.folderMinimum);

  const sizesWithoutTask = fieldSizes(input, actions, false);
  const available = width - sizesWithoutTask.fixed - branchWidth - folderWidth;

  const task = isPresent(input.task) && available > paneHeaderWidth.gap ? 'shown' : 'hidden';

  const roleSizes = task === 'shown' ? sizes : sizesWithoutTask;
  const role = roleState(input, width, roleSizes, branchWidth, folderWidth);

  return { task, branch, folder, role };
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
    task: fields.task,
    role: fields.role,
    branch: fields.branch,
    folder: fields.folder,
    compact,
  };
};
