export type ModuleFake = Record<string, unknown>;

type KeyHandler = (
  event: { key: string },
  context: { stop_propagation: () => void; notify: () => void },
) => void;

const noop = (): undefined => undefined;

export const chainable = (): unknown =>
  new Proxy(() => undefined, {
    get: (_target, key) => (key === 'then' ? undefined : chainable()),
    apply: () => chainable(),
  });

export const dialogFrameFake = (captureKeyHandler: (handler: KeyHandler) => void): unknown => {
  const element: unknown = new Proxy(() => undefined, {
    get: (_target, key) => {
      if (key === 'on_key_down') {
        return (handler: KeyHandler) => {
          captureKeyHandler(handler);

          return element;
        };
      }

      if (key === 'track_focus') {
        return () => element;
      }

      return key === 'then' ? undefined : chainable();
    },
    apply: () => element,
  });

  return element;
};

// Bun fixes a mocked module's export names at the first mock.module call, so every mock of a
// module must expose the same names. These helpers hold the union each test file needs; a file
// passes its own behavior as overrides and gets the rest as defaults.
// Herdr's frameless popup frame inset. The fake repeats the real placement so a test that only
// overrides the insets still gets the frame math.
const popupFrameInset = 8;

const mainColumnPlacementFake = (
  insets: { left: number; top: number },
  topOffset: number,
): { left: number; right: number; top: number } => ({
  left: Math.max(0, insets.left - popupFrameInset),
  right: 2 * popupFrameInset - Math.min(insets.left, popupFrameInset),
  top: Math.max(0, insets.top + topOffset - popupFrameInset),
});

export const herdrFake = (overrides: ModuleFake = {}): ModuleFake => ({
  agents: () => [],
  appHome: () => '',
  checking: () => false,
  closeOverlay: () => null,
  commands: () => [],
  exec: async () => ({ code: 0, stdout: '', stderr: '' }),
  focused: () => null,
  hc: () => null,
  home: () => '',
  keys: () => [],
  knownAgents: async () => [],
  layout: () => null,
  layouts: () => [],
  machines: () => [],
  nextCommand: () => new Promise<string>(() => {}),
  openOverlay: () => null,
  panes: () => [],
  playSound: () => null,
  props: () => ({}),
  readTextFile: () => '',
  run: () => null,
  setShared: () => null,
  settings: () => ({}),
  shared: () => undefined,
  spaces: () => [],
  terminals: () => [],
  theme: () => ({}),
  themes: () => [],
  watchFolder: async () => [],
  window: () => null,
  writeTextFile: () => null,
  ...overrides,
});

export const gpuiBaseFake = (overrides: ModuleFake = {}): ModuleFake => ({
  Input: { new: () => chainable() },
  InputState: { new: () => undefined },
  ScrollHandle: { new: () => chainable() },
  Scrollbar: { vertical: noop },
  h_flex: noop,
  v_flex: noop,
  v_virtual_list: noop,
  VirtualListScrollHandle: { new: () => undefined },
  ...overrides,
});

export const gpuiKitFake = (overrides: ModuleFake = {}): ModuleFake => ({
  div: noop,
  image: noop,
  svg: noop,
  View: class {
    render(): unknown {
      return null;
    }
  },
  ...overrides,
});

export const kitIndexFake = (overrides: ModuleFake = {}): ModuleFake => ({
  actionBlock: noop,
  actionButton: noop,
  askCardSize: {},
  askFirst: noop,
  attentionBadge: noop,
  attentionMark: () => null,
  closeOverlay: noop,
  colors: noop,
  contentSize: {},
  contentSection: noop,
  controlSize: {},
  currentWindow: () => null,
  detailText: noop,
  dialogButton: chainable,
  dialogFrame: noop,
  documentLine: noop,
  emptyWorkSlot: noop,
  diffSize: {},
  diffTints: noop,
  factLine: noop,
  factPairs: noop,
  factRows: noop,
  fileStatusMark: noop,
  findLayoutNode: () => null,
  chipLineHeight: 0,
  footerLine: noop,
  footerLineHeight: 0,
  highlightedText: noop,
  hintFor: () => ({ normal: [] }),
  hoverCard: noop,
  hoverCardSize: {},
  hoveredAfter: () => null,
  icon: noop,
  iconButton: noop,
  iconNames: [],
  iconSlot: noop,
  iconToggle: noop,
  indicator: noop,
  itemHeader: noop,
  keycap: noop,
  keycaps: noop,
  keyHint: noop,
  layoutRoot: noop,
  linkText: noop,
  listActionOf: () => null,
  listOf: () => [],
  listRow: noop,
  mainColumnInsets: () => ({ left: 0, top: 0 }),
  mainColumnPlacement: mainColumnPlacementFake,
  modName: 'koja',
  newMenuOpenKey: 'koja-new-menu.open',
  inNormalMode: (shared: (key: string) => unknown) => shared('koja-modal') === true,
  normalModeKey: 'koja-modal',
  modePill: noop,
  openAtTop: () => null,
  openGroveDialog: noop,
  openWorktreeDialog: noop,
  openPrompt: noop,
  overlayCloseCount: () => 0,
  overlayId: () => null,
  normalFocusFill: noop,
  numberOf: () => null,
  overlayCard: noop,
  overlayHeading: noop,
  overlayRow: noop,
  overlayHints: () => [],
  overlaySize: {},
  paneActions: () => [],
  paneBranchElement: noop,
  paneFolderElement: noop,
  paneHeader: noop,
  paneHeaderFields: noop,
  paneHeaderWidth: {},
  paneLeadingSlotWidth: () => 0,
  paneOverflowButton: noop,
  paneTaskElement: noop,
  paneHeaderMenu: noop,
  paneHeaderMenuDetails: noop,
  partNote: noop,
  popupFrameRadius: 8,
  paneName: () => '',
  paneFolder: () => null,
  paneProgram: () => null,
  popupSurface: noop,
  pressedKeycap: noop,
  programIcon: noop,
  projectHeader: noop,
  radius: {},
  readDialogCommand: noop,
  readSection: () => 'panes',
  recordOf: () => undefined,
  recordOverlayClose: noop,
  repeat: noop,
  roleBadge: noop,
  roleText: noop,
  rollupStatuses: () => ({ spaces: {}, tabs: {} }),
  rowHeight: {},
  runNormalKeys: noop,
  searchField: noop,
  searchInputLine: noop,
  searchLine: noop,
  sectionHeader: noop,
  segmentedChip: noop,
  separator: noop,
  shellSize: {},
  shortAge: () => '',
  shortcutFor: () => null,
  scrollThumb: noop,
  shownSections: () => new Set(['panes']),
  sidebarSize: {},
  spaceFolder: () => '',
  spaceFooter: noop,
  spaceMark: noop,
  spacing: {},
  sourceLink: noop,
  thumbPlace: () => null,
  spinner: noop,
  splitButton: noop,
  splitButtonOpenHeight: () => 0,
  stackProgress: noop,
  stateLine: noop,
  statusMark: noop,
  statusRow: noop,
  stringListOf: () => [],
  stringOf: () => null,
  tab: noop,
  tabLabel: noop,
  tabProgram: noop,
  taskOfPane: () => null,
  trafficLightsPadding: noop,
  takeNormalKeys: () => null,
  terminalFont: () => 'JetBrains Mono',
  textField: chainable,
  textRoleNames: [],
  textRoles: {},
  textSize: {},
  themeChoices: [],
  toggleButton: noop,
  viewSwitch: noop,
  withTextRole: noop,
  workIcon: noop,
  ...overrides,
});

const kitPart = async (name: string): Promise<ModuleFake> =>
  (await import(`../src/kit/${name}.ts`)) as ModuleFake;

// Imports the named kit parts after the caller has mocked their modules, and keeps only the names
// kitIndexFake exposes, so the real parts replace its defaults without adding export names.
export const realKitIndexFake = async (parts: readonly string[]): Promise<ModuleFake> => {
  const modules = await Promise.all(parts.map(kitPart));
  const sharedNames = new Set(Object.keys(kitIndexFake()));

  const sharedEntries = modules
    .flatMap((module) => Object.entries(module))
    .filter(([name]) => sharedNames.has(name));

  const real = Object.fromEntries(sharedEntries);

  return kitIndexFake(real);
};
