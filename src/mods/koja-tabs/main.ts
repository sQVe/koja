// The tab bar: the shown space's tabs, the + menu, the side panel buttons, and the mode mark.
// Click to select, double-click to rename, drag to reorder, right-click for the tab's menu.

import type { Context, Element } from 'gpui-kit';
import { div, View } from 'gpui-kit';
import { h_flex } from 'gpui-base';
import type { PaneInfo, SpaceInfo, TabInfo } from 'herdr';
import { layout, openOverlay, panes, run, settings, shared, spaces } from 'herdr';

import type { IconName } from '../../kit/index.ts';
import {
  colors,
  currentWindow,
  findLayoutNode,
  icon,
  iconButton,
  indicator,
  listOf,
  numberOf,
  overlaySize,
  programIcon,
  recordOf,
  spacing,
  stringOf,
  tab,
  tabBarEdge,
  toggleButton,
  trafficLightsWidth,
} from '../../kit/index.ts';

interface PanelState {
  // The panel the shown space should get back, until the layout shows it or a second passes.
  pending: { want: string | null; until: number } | null;
  space: string | undefined;
}

interface Panel {
  id: string;
  label: string;
  icon: IconName;
}

const panelStorageKey = 'panels';

// How long a restored panel waits for the layout to show it before a change counts as a choice.
const restoreMilliseconds = 1000;

const panels: Panel[] = [
  { id: 'files', label: 'Files', icon: 'file' },
  { id: 'changes', label: 'Changes', icon: 'git-compare' },
];

const stopPress = (_event: unknown, cx: Context): void => {
  cx.stop_propagation();
};

const readStoredPanels = (): Record<string, string | null> => {
  const stored: unknown = JSON.parse(localStorage.getItem(panelStorageKey) ?? '{}');
  const entries = Object.entries(recordOf(stored)).map(([space, panel]) => [space, stringOf(panel)] as const);

  return Object.fromEntries(entries);
};

// An unnamed tab Herdr calls by an id like "tb3" shows its program's name instead.
const tabLabel = (tabInfo: TabInfo, program: PaneInfo['program'] | undefined): string => {
  const name = /^tb\d+$/.test(tabInfo.name) ? (program?.name ?? 'Terminal') : tabInfo.name;

  return tabInfo.zoomed ? `${name} Z` : name;
};

const tabProgram = (tabInfo: TabInfo, paneList: PaneInfo[]): PaneInfo['program'] | undefined => {
  const tabPanes = paneList.filter((pane) => pane.tab === tabInfo.id);

  return (tabPanes.find((pane) => pane.program.agent) ?? tabPanes[0])?.program;
};

const shownPanel = (): string | null => {
  const panel = findLayoutNode('panel');
  const body = findLayoutNode('panel-body');

  if (panel === null || panel['hidden'] === true) {
    return null;
  }

  return stringOf(body?.['active']);
};

// Only panels the layout's "panel-body" stack offers get a button, so the layout file decides.
const enabledPanels = (): string[] => {
  const offered = new Set(
    listOf(findLayoutNode('panel-body')?.['children']).map((child) =>
      stringOf(recordOf(child)['id']),
    ),
  );

  const chosen = listOf(shared('workspace.panels') ?? ['files', 'changes']);

  return chosen.filter(
    (panel): panel is string => typeof panel === 'string' && offered.has(panel),
  );
};

const showPanel = (panel: string | null): void => {
  if (panel === null) {
    run('layout.hide', { id: 'panel' });

    return;
  }

  run('layout.select', { stack: 'panel-body', child: panel });
  run('layout.show', { id: 'panel' });
};

// On macOS without a system title bar, the tabs leave room for the window buttons where the
// sidebar is narrower than them.
const windowButtonsPadding = (): number => {
  const shown = currentWindow();
  const root = recordOf(layout());
  const lights = numberOf(listOf(root['traffic_lights'])[0]);
  const drawsOwnTitleBar = shown?.platform === 'macos' && shown.titlebar === 'none';

  if (!drawsOwnTitleBar || shown.fullscreen || lights === null) {
    return spacing.large;
  }

  const sidebar = findLayoutNode('sidebar');
  const sidebarWidth = sidebar?.['hidden'] === true ? 0 : (numberOf(recordOf(sidebar?.['size'])['px']) ?? 0);
  const zoom = numberOf(settings()['zoom']) ?? 1;

  return Math.max(spacing.large, (lights + trafficLightsWidth) / zoom - sidebarWidth);
};

export default class Tabs extends View {
  private pressed: number | null = null;

  private readonly stored = readStoredPanels();

  private readonly panelState: PanelState = { pending: null, space: undefined };

  override render(): Element {
    const palette = colors();
    const space = spaces().find((candidate) => candidate.active);
    const shown = space?.tabs ?? [];
    const enabled = enabledPanels();

    this.syncPanel(space, enabled);

    return h_flex()
      .size_full()
      .min_w(0)
      .items_center()
      .bg(palette.chrome)
      .on_mouse_up('left', () => {
        this.pressed = null;
      })
      .on_scroll_wheel((event) => {
        if (Math.abs(event.delta.y) >= 1) {
          run(event.delta.y > 0 ? 'tab.prev' : 'tab.next');
        }
      })
      .child(tabBarEdge(div().w(windowButtonsPadding()).flex_none()))
      .child(
        h_flex()
          .id('tab-scroll')
          .flex_1()
          .min_w(0)
          .h_full()
          .overflow_x_scrollbar()
          .children(shown.map((tabInfo, index) => this.tabItem(space, tabInfo, index)))
          .child(tabBarEdge(div().flex_1().min_w(0))),
      )
      .child(this.controls(enabled));
  }

  // The side panel is remembered per space: switching shows that space's choice (closed if it
  // never had one), and opening or closing it records it.
  private syncPanel(space: SpaceInfo | undefined, enabled: string[]): void {
    if (space === undefined || findLayoutNode('panel') === null) {
      return;
    }

    const now = shownPanel();

    if (space.id !== this.panelState.space && this.restorePanel(space, enabled, now)) {
      return;
    }

    // Until the restore lands, or something else won, the old state isn't a choice.
    const { pending } = this.panelState;

    if (pending !== null) {
      if (pending.want !== now && Date.now() < pending.until) {
        return;
      }

      this.panelState.pending = null;
    }

    if (this.stored[space.id] === now) {
      return;
    }

    this.stored[space.id] = now;
    localStorage.setItem(panelStorageKey, JSON.stringify(this.stored));
  }

  // Answers whether it asked the layout for another panel.
  private restorePanel(space: SpaceInfo, enabled: string[], now: string | null): boolean {
    const first = this.panelState.space === undefined;

    this.panelState.space = space.id;
    this.panelState.pending = null;

    if (first && !(space.id in this.stored)) {
      return false;
    }

    const stored = this.stored[space.id] ?? null;
    const want = stored !== null && enabled.includes(stored) ? stored : null;

    if (want === now) {
      return false;
    }

    this.panelState.pending = { want, until: Date.now() + restoreMilliseconds };
    showPanel(want);

    return true;
  }

  private tabItem(space: SpaceInfo | undefined, tabInfo: TabInfo, index: number): Element {
    const palette = colors();
    const program = tabProgram(tabInfo, panes());
    const hasIcon = program?.icon !== null && program !== undefined;
    const iconColor = tabInfo.active ? palette.foreground : palette.dim;

    return tab({
      label: tabLabel(tabInfo, program),
      active: tabInfo.active,
      icon: hasIcon ? programIcon(program, 'small').text_color(iconColor) : null,
      status: tabInfo.status,
      close: this.closeButton(tabInfo),
    })
      .id(`tab-${tabInfo.id}`)
      .on_mouse_down('left', (event, cx) => {
        cx.stop_propagation();
        this.pressed = index;

        if (event.click_count === 2) {
          run('tab.rename', { id: tabInfo.id });
        }
      })
      .on_mouse_up('left', () => {
        this.release(space, tabInfo, index);
      })
      .on_mouse_down('right', (_event, cx) => {
        cx.stop_propagation();

        openOverlay({
          mod: 'koja-menu',
          kind: 'popup',
          width: overlaySize.menuWidth,
          props: { tab: 'tab', target: { id: tabInfo.id, space: space?.id } },
        });
      });
  }

  private release(space: SpaceInfo | undefined, tabInfo: TabInfo, index: number): void {
    const from = this.pressed;
    const moved = from === null ? undefined : space?.tabs[from];

    this.pressed = null;

    if (moved === undefined || from === index) {
      run('tab.select', { id: tabInfo.id });

      return;
    }

    run('tab.move', { id: moved.id, index: index + 1 });
  }

  private closeButton(tabInfo: TabInfo): Element {
    return iconButton('x', 'small')
      .id(`close-${tabInfo.id}`)
      .on_mouse_down('left', stopPress)
      .on_click((_event, cx) => {
        cx.stop_propagation();
        run('tab.close', { id: tabInfo.id });
      });
  }

  private controls(enabled: string[]): Element {
    const newButton = iconButton('plus')
      .id('tab-new')
      .on_mouse_down('left', stopPress)
      .on_click(() => {
        openOverlay({
          mod: 'koja-new-menu',
          kind: 'popup',
          width: overlaySize.wideMenuWidth,
          height: overlaySize.wideMenuHeight,
        });
      });

    // Red while the modal-pill overlay holds the keyboard (normal mode), else green (insert mode).
    const normalMode = Boolean(shared('modal.pill'));

    return tabBarEdge(h_flex().flex_none().gap(spacing.xxsmall).pl(spacing.small).pr(spacing.xsmall).items_center())
      .child(newButton)
      .children(
        panels.filter((panel) => enabled.includes(panel.id)).map((panel) => this.panelButton(panel)),
      )
      .child(h_flex().mx(spacing.small).child(indicator(normalMode ? 'blocked' : 'ansi2')));
  }

  private panelButton(panel: Panel): Element {
    const on = shownPanel() === panel.id;

    return toggleButton({ label: panel.label, active: on, start: icon(panel.icon, 'small') })
      .id(`panel-${panel.id}`)
      .on_mouse_down('left', stopPress)
      .on_click(() => {
        showPanel(on ? null : panel.id);
      });
  }
}
