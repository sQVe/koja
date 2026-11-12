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
  // A card's inner radius, one px less than its border, so a header fill fits its top corners.
  cardInner: 7,
} as const;

export const rowHeight = {
  small: 24,
  large: 28,
} as const;

export type RowSize = keyof typeof rowHeight;

export const diffSize = {
  headerHeight: 34,
  rowHeight: 18,
  lineNumberWidth: 30,
  minimumWidth: 300,
  characterWidth: 7,
  widthPadding: 50,
  fileListHeightLimit: 200,
  fileListHeightMinimum: 44,
} as const;

export const controlSize = {
  badge: 18,
  button: 22,
  dialogButton: 28,
  paneLabelMaxWidth: 260,
  searchField: 40,
  sectionHeader: 26,
  sidebarHeader: 27,
  smallButton: 16,
  tabBar: 28,
  tabSlot: 14,
  tabLabelMaxWidth: 170,
} as const;

export const shellSize = {
  sidebarWidth: 240,
  panelWidth: 300,
  specimenBodyHeight: 28,
  wideSpecimenWidth: 884,
  folderCutWidth: 700,
  branchCutWidth: 470,
  taskCutWidth: 360,
  compactSpecimenWidth: 260,
  focusedPaneShare: 7,
  shellPaneShare: 3,
  focusedPaneWidth: 487,
  shellPaneWidth: 209,
} as const;

// The header budgets width from the glyph estimate, so a field shows in full while it fits; a
// field leaves whole before the next one gives up any width, and any drop makes the header compact.
// `glyph` is the average advance of a Detail-role glyph at 11 px Geist, read from a capture.
const headerActionCount = 4;
const headerActionGaps = 3;
const headerGapCount = 6;
const headerBranchIcon = iconSize.small + spacing.xsmall;
const fieldMinimumWidth = 120;

export const paneHeaderWidth = {
  compact: 280,
  glyph: 6,
  padding: spacing.large * 2,
  icon: iconSize.default,
  branchIcon: headerBranchIcon,
  gaps: spacing.medium * headerGapCount,
  status: 60,
  actions: controlSize.button * headerActionCount + spacing.xxsmall * headerActionGaps,
  overflowAction: controlSize.button,
  menuWidth: 240,
  fieldMinimum: fieldMinimumWidth,
} as const;

export const markSize = {
  slot: 12,
  dot: 6,
  quietDot: 4,
} as const;

export const progressSize = {
  width: 12,
  height: 3,
} as const;

export const hoverCardSize = {
  width: 312,
  arrowDepth: 4,
  pullColumn: 34,
  ticketColumn: 58,
} as const;

export const sidebarSize = {
  width: 268,
  groupGap: 12,
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
  confirmWidth: 380,
  confirmHeight: 120,
  promptWidth: 380,
  promptHeight: 150,
  pickerListWidth: 420,
  pickerInset: 3,
  pickerWidthShare: 0.6,
  pickerHeightShare: 0.7,
  topOffset: 40,
  shellWidth: 1260,
  shellHeight: 760,
  paneHeadersWidth: 900,
  paneHeadersHeight: 760,
} as const;

export const trafficLightsWidth = 64;

export const draggedOpacity = 0.5;

export const spinnerPeriod = 900;
