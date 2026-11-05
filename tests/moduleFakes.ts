type ModuleFake = Record<string, unknown>;

const noop = (): undefined => undefined;

export const chainable = (): unknown =>
  new Proxy(() => undefined, {
    get: (_target, key) => (key === 'then' ? undefined : chainable()),
    apply: () => chainable(),
  });

// Bun fixes a mocked module's export names at the first mock.module call, so every mock of a
// module must expose the same names. These helpers hold the union each test file needs; a file
// passes its own behavior as overrides and gets the rest as defaults.
export const herdrFake = (overrides: ModuleFake = {}): ModuleFake => ({
  appHome: () => '',
  closeOverlay: () => null,
  commands: () => [],
  exec: async () => ({ code: 0, stdout: '', stderr: '' }),
  focused: () => null,
  hc: () => null,
  keys: () => [],
  layout: () => null,
  layouts: () => [],
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
  actionButton: noop,
  askFirst: noop,
  attentionBadge: noop,
  closeOverlay: noop,
  colors: noop,
  controlSize: {},
  currentWindow: () => null,
  detailText: noop,
  dialogButton: chainable,
  dialogFrame: noop,
  diffSize: {},
  diffTints: noop,
  fileStatusMark: noop,
  highlightedText: noop,
  icon: noop,
  iconButton: noop,
  iconSlot: noop,
  indicator: noop,
  keyHint: noop,
  listRow: noop,
  modName: 'koja',
  openAtTop: () => null,
  openPrompt: noop,
  overlayCloseCount: () => 0,
  overlayId: () => null,
  overlaySize: {},
  popupSurface: noop,
  programIcon: noop,
  radius: {},
  readDialogCommand: noop,
  recordOf: () => undefined,
  recordOverlayClose: noop,
  repeat: noop,
  repoLabel: noop,
  roleText: noop,
  rollupStatuses: () => ({ spaces: {}, tabs: {} }),
  rowHeight: {},
  searchField: noop,
  sectionHeader: noop,
  shortAge: () => '',
  shortcutFor: () => null,
  spaceMark: noop,
  spacing: {},
  stateLine: noop,
  statusMark: noop,
  stringOf: () => null,
  tab: noop,
  textField: chainable,
  textRoles: {},
  textSize: {},
  themeChoices: [],
  toggleButton: noop,
  withTextRole: noop,
  ...overrides,
});
