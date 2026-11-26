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
  medium: 26,
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
  // Keeps the pane name, such as "Pi", whole when the header is narrow.
  paneLabelMinWidth: 12,
  searchField: 40,
  sectionHeader: 26,
  // One width for a split button and its menu, so the menu lines up with both edges.
  splitButtonWidth: 208,
  sidebarHeader: 27,
  smallButton: 16,
  tabBar: 28,
  tabSlot: 14,
  tabLabelMaxWidth: 170,
} as const;

// A line of segmented chips: the chip, the gap under it, and the rule it draws on the column.
export const chipLineHeight = controlSize.button + spacing.xsmall + spacing.hairline;

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
// The header draws the action buttons in a row with the same gap as its own children, so the
// budget must count those gaps too.
const headerActionGap = spacing.medium;
const headerBranchIcon = iconSize.small + spacing.xsmall;
const fieldMinimumWidth = 120;

export const paneHeaderWidth = {
  compact: 280,
  glyph: 6,
  // The average advance of a Tag-role glyph at 9 px Geist, used for the role badge.
  badgeGlyph: 5,
  padding: spacing.large * 2,
  icon: iconSize.default,
  branchIcon: headerBranchIcon,
  gap: headerActionGap,
  actions: controlSize.button * headerActionCount + headerActionGap * headerActionGaps,
  overflowAction: controlSize.button,
  menuWidth: 240,
  fieldMinimum: fieldMinimumWidth,
} as const;

const badgeHorizontal = spacing.small * 2 + spacing.hairline * 2;

export const badgeSize = {
  height: controlSize.badge,
  padding: spacing.small,
  border: spacing.hairline,
  radius: radius.default,
  horizontal: badgeHorizontal,
} as const;

export const keycapSize = {
  height: 16,
  minimumWidth: 18,
  padding: spacing.xsmall,
  // Glyphs sit about 1 px left of the cap's center, so the left padding takes 1 px more.
  opticalShift: spacing.hairline,
  gap: spacing.xxsmall,
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
  headerCenter: spacing.hairline + spacing.xsmall + rowHeight.small / 2,
  pullColumn: 34,
  ticketColumn: 58,
} as const;

export const sidebarSize = {
  width: 268,
  groupGap: 12,
  // The x offset of an inset list row's content: its margin, its outline, and its padding.
  rowContentInset: spacing.xsmall + spacing.hairline + spacing.small,
} as const;

export const indentWidth = 20;

export const overlaySize = {
  // The key hint card sits this far above the bottom of the panes it describes.
  cardGapAbovePanes: 24,
  menuWidth: 200,
  menuHeight: 260,
  // Wide enough for the new menu's worktree rows.
  newMenuWidth: 296,
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
  groveWidth: 420,
  groveHeight: 280,
  // Leaves room in groveHeight for the field and the buttons; a longer message scrolls.
  groveMessageHeight: 120,
  pickerListWidth: 420,
  pickerInset: 3,
  paletteWidth: 560,
  pickerWidthShare: 0.6,
  pickerHeightShare: 0.7,
  topOffset: 40,
  shellWidth: 1260,
  shellHeight: 760,
  paneHeadersWidth: 900,
  paneHeadersHeight: 760,
  paneHeadersRolesHeight: 780,
} as const;

export const askCardSize = {
  maximumWidth: 420,
  paneClearance: 16,
  // Aligns the lines under the title with the title's mark and its gap.
  textInset: iconSize.small + spacing.small,
  bodyLineHeight: 18,
  terminalLineHeight: 17,
  detailLineHeight: 16,
} as const;

export const trafficLightsWidth = 64;

export const draggedOpacity = 0.5;

export const spinnerPeriod = 900;
