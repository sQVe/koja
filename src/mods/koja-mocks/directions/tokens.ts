import type { Color } from 'gpui-kit';

export interface TextStyle {
  size: number;
  semibold: boolean;
}

interface DirectionText {
  body: TextStyle;
  title: TextStyle;
  heading: TextStyle;
  detail: TextStyle;
  badge: TextStyle;
  terminal: number;
}

interface DirectionInk {
  text: Color;
  muted: Color;
  dim: Color;
}

interface DirectionMarks {
  working: Color;
  blocked: Color;
  idle: Color;
  done: Color;
  spine: Color;
  added: Color;
  removed: Color;
  modified: Color;
  badgeFill: Color;
  badgeText: Color;
  badgeRadius: number;
}

interface DirectionAreas {
  frame: Color;
  sidebarWidth: number;
  shellPaneWidth: number;
  panelWidth: number;
  contentPadding: number;
  contentGap: number;
}

interface DirectionPane {
  fill: Color;
  radius: number;
  border: Color;
  focusedBorder: Color;
  // Cards inside a pane keep this border in both modes; only the pane's own border turns indigo.
  cardBorder: Color;
  headerHeight: number;
  headerPadding: number;
  headerGap: number;
  headerDivider: Color;
  bodyPadding: number;
  focusedHeaderFill: Color | null;
  focusedHeaderInk: Color | null;
}

interface DirectionTabs {
  barHeight: number;
  barPadding: number;
  height: number;
  radius: number;
  paddingX: number;
  gap: number;
  activeFill: Color;
  activeText: Color;
  activeBorder: Color;
  text: Color;
}

interface DirectionRows {
  height: number;
  inset: number;
  paddingX: number;
  radius: number;
  gap: number;
  groupGap: number;
  listPadding: number;
  selectedFill: Color;
  hoverFill: Color;
}

interface PillStyle {
  fill: Color | null;
  border: Color | null;
  text: Color;
}

interface DirectionControls {
  size: number;
  radius: number;
  toggleFill: Color;
  primary: Color;
  modePill: PillStyle;
}

export interface DirectionTokens {
  normal: boolean;
  text: DirectionText;
  ink: DirectionInk;
  marks: DirectionMarks;
  areas: DirectionAreas;
  pane: DirectionPane;
  tabs: DirectionTabs;
  rows: DirectionRows;
  controls: DirectionControls;
}
