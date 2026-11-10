import type { DirectionTokens } from './tokens.ts';

// Koja's chosen visual direction: a cool mist-gray frame around gray pane cards, a gray pill for
// the selected row, and one 6 px radius. Normal mode darkens the frame, turns every pane border
// indigo, and tints the focused pane's header, because Herdr draws no focus border in that mode.

const indigo = '#4e4e96';
const paneFill = '#dfe1e5';
const paneBorder = '#b6bbc4';
const text = '#1e2028';

const typeScale: DirectionTokens['text'] = {
  body: { size: 13, semibold: false },
  title: { size: 13, semibold: true },
  heading: { size: 11, semibold: true },
  detail: { size: 11, semibold: false },
  badge: { size: 10, semibold: true },
  terminal: 12,
};

const diffMarks = {
  added: '#265c26',
  removed: '#9c1f25',
  modified: '#734000',
  badgeFill: '#ecc9c9',
  badgeText: '#7e161b',
  badgeRadius: 4,
} as const;

const areas: Omit<DirectionTokens['areas'], 'frame'> = {
  sidebarWidth: 268,
  shellPaneWidth: 232,
  panelWidth: 300,
  contentPadding: 8,
  contentGap: 8,
};

const pane: Omit<DirectionTokens['pane'], 'border' | 'focusedBorder' | 'focusedHeaderFill'> = {
  fill: paneFill,
  radius: 6,
  headerHeight: 30,
  headerPadding: 10,
  headerGap: 6,
  headerDivider: '#ccd0d6',
  cardBorder: paneBorder,
  bodyPadding: 10,
  focusedHeaderInk: null,
};

const tabs: DirectionTokens['tabs'] = {
  barHeight: 36,
  barPadding: 8,
  height: 26,
  radius: 6,
  paddingX: 10,
  gap: 2,
  activeFill: paneFill,
  activeText: text,
  activeBorder: paneBorder,
  text: '#464644',
};

const rows: Omit<DirectionTokens['rows'], 'selectedFill' | 'hoverFill'> = {
  height: 24,
  inset: 6,
  paddingX: 8,
  radius: 6,
  gap: 0,
  groupGap: 12,
  listPadding: 8,
};

const controls: Omit<DirectionTokens['controls'], 'toggleFill' | 'modePill'> = {
  size: 24,
  radius: 6,
  primary: '#383b43',
};

export const koja: DirectionTokens = {
  normal: false,
  text: typeScale,
  ink: { text, muted: '#383b43', dim: '#43464e' },
  marks: { ...diffMarks, working: '#994406', blocked: '#a81e26', idle: '#5a5e66', done: '#286b2b' },
  areas: { ...areas, frame: '#d0d3d9' },
  pane: { ...pane, border: paneBorder, focusedBorder: text, focusedHeaderFill: null },
  tabs,
  rows: { ...rows, selectedFill: '#b9bdc6', hoverFill: '#c6cad1' },
  controls: {
    ...controls,
    toggleFill: '#c3c7cf',
    modePill: { fill: null, border: paneBorder, text: '#383b43' },
  },
};

// The darker frame darkens the muted ink, the marks, the pill, and the hover with it, so they keep
// their contrast.
export const kojaNormal: DirectionTokens = {
  normal: true,
  text: typeScale,
  ink: { text, muted: '#2f323a', dim: '#373a42' },
  marks: { ...diffMarks, working: '#853a04', blocked: '#921a21', idle: '#4a4e56', done: '#225c25' },
  areas: { ...areas, frame: '#bcc0c8' },
  pane: {
    ...pane,
    border: indigo,
    focusedBorder: indigo,
    focusedHeaderFill: '#4e4e961f',
    focusedHeaderInk: indigo,
  },
  tabs,
  rows: { ...rows, selectedFill: '#a9aeb8', hoverFill: '#b2b6bf' },
  controls: {
    ...controls,
    toggleFill: '#a9aeb8',
    modePill: { fill: indigo, border: null, text: '#eef0f6' },
  },
};
