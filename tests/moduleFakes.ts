type ModuleFake = Record<string, unknown>;

const noop = (): undefined => undefined;

// A stub that accepts any call and any property, so a kit element can be chained as in production.
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
  commands: () => [],
  exec: async () => ({ code: 0, stdout: '', stderr: '' }),
  focused: () => null,
  hc: () => null,
  layouts: () => [],
  nextCommand: () => new Promise<string>(() => {}),
  openOverlay: () => null,
  panes: () => [],
  props: () => ({}),
  readTextFile: () => '',
  run: () => null,
  setShared: () => null,
  shared: () => undefined,
  spaces: () => [],
  terminals: () => [],
  writeTextFile: () => null,
  ...overrides,
});

export const gpuiBaseFake = (overrides: ModuleFake = {}): ModuleFake => ({
  InputState: { new: () => undefined },
  h_flex: noop,
  v_flex: noop,
  v_virtual_list: noop,
  VirtualListScrollHandle: { new: () => undefined },
  ...overrides,
});

export const gpuiKitFake = (overrides: ModuleFake = {}): ModuleFake => ({
  div: noop,
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
  closeOverlay: noop,
  colors: noop,
  currentWindow: () => null,
  detailText: noop,
  dialogButton: chainable,
  dialogFrame: noop,
  emptyState: noop,
  highlightedText: noop,
  icon: noop,
  iconButton: noop,
  iconSlot: noop,
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
  rollupStatuses: () => ({ spaces: {}, tabs: {} }),
  rowHeight: {},
  searchField: noop,
  sectionHeader: noop,
  shortcutFor: () => null,
  spaceMark: noop,
  spacing: {},
  statusMark: noop,
  stringOf: () => null,
  textField: chainable,
  textSize: {},
  themeChoices: [],
  toggleButton: noop,
  ...overrides,
});
