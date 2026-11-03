export const textSize = {
  xsmall: 9,
  small: 11,
  default: 13,
  large: 15,
} as const;

export const iconSize = {
  xsmall: 10,
  small: 12,
  default: 14,
  large: 16,
} as const;

export const spacing = {
  none: 0,
  hairline: 1,
  xxsmall: 2,
  xsmall: 4,
  small: 6,
  medium: 8,
  large: 10,
  xlarge: 14,
  xxlarge: 20,
} as const;

export const separatorHeight = spacing.xsmall * 2 + spacing.hairline;

export const radius = {
  default: 4,
  pill: 6,
  dialog: 8,
} as const;

export const rowHeight = {
  small: 24,
  medium: 26,
  large: 28,
} as const;

export type RowSize = keyof typeof rowHeight;

export const controlSize = {
  badge: 18,
  button: 22,
  paneLabelMaxWidth: 260,
  searchField: 40,
  sectionHeader: 26,
  sidebarHeader: 27,
  tabBar: 28,
  tabSlot: 14,
  tabLabelMaxWidth: 170,
} as const;

export const markSize = {
  slot: 12,
  dot: 6,
  quietDot: 4,
} as const;

export const indentWidth = 20;

export const overlaySize = {
  menuWidth: 200,
  menuHeight: 260,
  wideMenuWidth: 250,
  wideMenuHeight: 512,
  // Leaves room for the popup's frame inside wideMenuHeight.
  wideMenuContentHeight: 491,
  worktreeFormWidth: 440,
  worktreeFormHeight: 260,
  worktreeListWidth: 560,
  worktreeListHeight: 480,
  promptWidth: 380,
  pickerListWidth: 420,
  pickerInset: 3,
  pickerWidthShare: 0.6,
  pickerHeightShare: 0.7,
  topOffset: 40,
} as const;

export const railWidthLimit = 160;

export const trafficLightsWidth = 64;

export const draggedOpacity = 0.5;

export const actionHoverOpacity = 0.88;

export const spinnerPeriod = 900;
