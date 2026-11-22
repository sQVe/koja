import type { IconName } from './iconNames.ts';

export interface PaneHeaderMenuFieldOptions {
  task?: string | undefined;
  branch?: string | undefined;
  folder?: string | undefined;
}

export interface PaneHeaderMenuOptions extends PaneHeaderMenuFieldOptions {
  zoomed: boolean;
  onSplitRight?: (() => void) | undefined;
  onSplitDown?: (() => void) | undefined;
  onZoom?: (() => void) | undefined;
  onClose?: (() => void) | undefined;
}

export interface PaneHeaderMenuField {
  icon: IconName | null;
  text: string;
  cut: 'middle' | 'end';
}

export interface PaneHeaderMenuAction {
  icon: IconName;
  label: string;
  action: (() => void) | undefined;
}

export interface PaneHeaderMenuModel {
  fields: PaneHeaderMenuField[];
  actions: PaneHeaderMenuAction[];
  separator: boolean;
}

type PaneActionOptions = Pick<
  PaneHeaderMenuOptions,
  'zoomed' | 'onSplitRight' | 'onSplitDown' | 'onZoom' | 'onClose'
>;

const isPresent = (text: string | undefined): text is string => text !== undefined && text !== '';

const fieldCandidates = (
  options: PaneHeaderMenuFieldOptions,
): { icon: IconName | null; text: string | undefined; cut: 'middle' | 'end' }[] => [
  { icon: null, text: options.task, cut: 'end' },
  { icon: 'git-branch', text: options.branch, cut: 'middle' },
  { icon: 'folder', text: options.folder, cut: 'middle' },
];

export const paneHeaderMenuFields = (options: PaneHeaderMenuFieldOptions): PaneHeaderMenuField[] =>
  fieldCandidates(options).filter((field): field is PaneHeaderMenuField => isPresent(field.text));

export const paneActions = (options: PaneActionOptions): PaneHeaderMenuAction[] => [
  { icon: 'columns-2', label: 'Split right', action: options.onSplitRight },
  { icon: 'rows-2', label: 'Split down', action: options.onSplitDown },
  {
    icon: options.zoomed ? 'minimize-2' : 'maximize-2',
    label: options.zoomed ? 'Restore pane' : 'Zoom pane',
    action: options.onZoom,
  },
  { icon: 'x', label: 'Close pane', action: options.onClose },
];

export const paneHeaderMenuModel = (options: PaneHeaderMenuOptions): PaneHeaderMenuModel => {
  const fields = paneHeaderMenuFields(options);

  return {
    fields,
    actions: paneActions(options),
    separator: fields.length > 0,
  };
};
