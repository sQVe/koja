type ModuleFake = Record<string, unknown>;

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
export const herdrFake = (overrides: ModuleFake = {}): ModuleFake => ({
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
  factPairs: noop,
  factRows: noop,
  fileStatusMark: noop,
  findLayoutNode: () => null,
  highlightedText: noop,
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
  keyHint: noop,
  layoutRoot: noop,
  linkText: noop,
  listActionOf: () => null,
  listOf: () => [],
  listRow: noop,
  modName: 'koja',
  modePill: noop,
  openAtTop: () => null,
  openGroveDialog: noop,
  openWorktreeDialog: noop,
  openPrompt: noop,
  overlayCloseCount: () => 0,
  overlayId: () => null,
  normalFocusFill: noop,
  numberOf: () => null,
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
  popupSurface: noop,
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
  sectionHeader: noop,
  separator: noop,
  separatorHeight: 0,
  shellSize: {},
  shortAge: () => '',
  shortcutFor: () => null,
  shownSections: () => new Set(['panes']),
  sidebarSize: {},
  spaceFolder: () => '',
  spaceFooter: noop,
  spaceMark: noop,
  spacing: {},
  sourceLink: noop,
  spinner: noop,
  splitButton: noop,
  splitButtonOpenHeight: () => 0,
  stackProgress: noop,
  stateLine: noop,
  statusMark: noop,
  statusRow: noop,
  stringOf: () => null,
  tab: noop,
  tabLabel: noop,
  tabProgram: noop,
  taskOfPane: () => null,
  trafficLightsPadding: noop,
  takeNormalKeys: () => null,
  terminalFont: () => '',
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
