// Koja's scale, after Zed's: text, icons, spacing, and corners. Mods use these names and never
// a number of their own, so one change here reaches every surface.

// Zed's text scale at its default rem of 16 px.
export const textSize = {
  xsmall: 10,
  small: 12,
  default: 14,
  large: 16,
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

// A separator line with its margin above and below.
export const separatorHeight = spacing.xsmall * 2 + spacing.hairline;

export const radius = {
  default: 4,
  dialog: 8,
} as const;

export const rowHeight = {
  small: 24,
  medium: 26,
  large: 28,
} as const;

export type RowSize = keyof typeof rowHeight;

export const controlSize = {
  button: 22,
  searchField: 40,
  sectionHeader: 26,
  sidebarHeader: 31,
  tabSlot: 14,
  tabLabelMaxWidth: 170,
} as const;

export const markSize = {
  slot: 12,
  dot: 6,
  quietDot: 4,
} as const;

// One level of a tree: the width a child row moves in by.
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
  // Shares of the window.
  pickerWidthShare: 0.6,
  pickerHeightShare: 0.7,
  // How far below the window's top a popup at the top opens.
  topOffset: 40,
} as const;

// Narrower than this, a sidebar draws a compact rail, as Herdr's own sidebar mods do.
export const railWidthLimit = 160;

// The width of macOS's window buttons, from the layout's traffic_lights position.
export const trafficLightsWidth = 64;

// A dragged row fades to this, so the drop line stands out.
export const draggedOpacity = 0.5;

// One turn of the working spinner, in milliseconds.
export const spinnerPeriod = 900;
