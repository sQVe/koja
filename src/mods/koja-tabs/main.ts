import { h_flex } from 'gpui-base';
import type { AsyncContext, Context, Element, MouseButtonEvent } from 'gpui-kit';
import { div, View } from 'gpui-kit';
import type { SpaceInfo, Status, TabInfo } from 'herdr';
import { openOverlay, panes, run, setShared, settings, shared, spaces, terminals } from 'herdr';

import type { DragState } from '../../kit/drag.ts';
import { noDrag, startDrag } from '../../kit/drag.ts';
import type { IconName } from '../../kit/index.ts';
import {
  askFirst,
  colors,
  currentWindow,
  findLayoutNode,
  hoveredAfter,
  icon,
  iconButton,
  iconToggle,
  indicator,
  layoutRoot,
  listOf,
  newMenuOpenKey,
  numberOf,
  overlaySize,
  programIcon,
  recordOf,
  rollupStatuses,
  spacing,
  stringOf,
  tab,
  tabLabel,
  tabProgram,
  toggleButton,
  trafficLightsPadding,
} from '../../kit/index.ts';
import { parsedJson } from '../../kit/parsedJson.ts';
import type { PanelMemory } from './panelMemory.ts';
import { initialPanelMemory, panelMemory } from './panelMemory.ts';
import { tabDropAction } from './tabDrop.ts';

interface Panel {
  id: string;
  label: string;
  icon: IconName;
}

interface WindowBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

const panelStorageKey = 'panels';

const panels: Panel[] = [
  { id: 'files', label: 'Files', icon: 'file' },
  { id: 'changes', label: 'Changes', icon: 'git-compare' },
];

const stopPress = (_event: unknown, cx: Context): void => {
  cx.stop_propagation();
};

// The press carries where it landed in the window and in the button, which is the button's box.
const pressedBox = (event: MouseButtonEvent): WindowBox | null => {
  const bounds = event.bounds;
  const local = event.local_position;

  if (bounds === undefined || local === undefined) {
    return null;
  }

  return {
    x: event.position.x - local.x,
    y: event.position.y - local.y,
    width: bounds.width,
    height: bounds.height,
  };
};

// Herdr places a popup at the point in window pixels, and scales its width by the app's zoom, so
// the anchor scales what the menu adds to the button's own box.
const newMenuPoint = (box: WindowBox | null, zoom: number): { x: number; y: number } | null =>
  box === null
    ? null
    : {
        x: box.x + box.width - overlaySize.newMenuWidth * zoom,
        y: box.y + box.height + spacing.xsmall * zoom,
      };

const readStoredPanels = (): Record<string, string | null> => {
  const stored: unknown = parsedJson(localStorage.getItem(panelStorageKey));

  const entries = Object.entries(recordOf(stored)).map(
    ([space, panel]) => [space, stringOf(panel)] as const,
  );

  return Object.fromEntries(entries);
};

const tabIds = (space: SpaceInfo | undefined): string[] =>
  space?.tabs.map((tabInfo) => tabInfo.id) ?? [];

const shownPanel = (): string | null => {
  const panel = findLayoutNode('panel');
  const body = findLayoutNode('panel-body');

  if (panel === null || panel.hidden) {
    return null;
  }

  return body?.active ?? null;
};

const enabledPanels = (): string[] => {
  const offered = new Set((findLayoutNode('panel-body')?.children ?? []).map((child) => child.id));

  const chosen = listOf(shared('workspace.panels') ?? ['files', 'changes']);

  return chosen.filter((panel): panel is string => typeof panel === 'string' && offered.has(panel));
};

const showPanel = (panel: string | null): void => {
  if (panel === null) {
    run('layout.hide', { id: 'panel' });

    return;
  }

  run('layout.select', { stack: 'panel-body', child: panel });
  run('layout.show', { id: 'panel' });
};

const appZoom = (): number => numberOf(settings()['zoom']) ?? 1;

const windowButtonsPadding = (): number => {
  const shown = currentWindow();
  const sidebar = findLayoutNode('sidebar');
  const sidebarWidth = sidebar?.hidden === true ? 0 : (sidebar?.sizePx ?? 0);

  return trafficLightsPadding({
    platform: shown?.platform ?? 'linux',
    titlebar: shown?.titlebar ?? 'system',
    fullscreen: shown?.fullscreen ?? false,
    lights: layoutRoot().trafficLights,
    zoom: appZoom(),
    offset: sidebarWidth,
    base: spacing.none,
  });
};

export default class Tabs extends View {
  private drag: DragState = noDrag;

  private hoveredTab: string | null = null;

  private memory: PanelMemory = initialPanelMemory(readStoredPanels());

  private plusBox: WindowBox | null = null;

  override init(_props: unknown, _cx: AsyncContext): void {
    // A session that ended with the new menu open leaves its flag set, and the `+` would draw
    // pressed with no menu over it. No popup survives a start, so a flag read here is always stale.
    if (shared(newMenuOpenKey) === true) {
      setShared(newMenuOpenKey, false);
    }
  }

  override render(): Element {
    const palette = colors();
    const space = spaces().find((candidate) => candidate.active);
    const shown = space?.tabs ?? [];
    const statuses = rollupStatuses(spaces(), panes(), terminals());
    const enabled = enabledPanels();

    this.syncPanel(space, enabled);

    const startPadding = windowButtonsPadding();
    const startSpacer = div().w(startPadding).flex_none();
    const endSpacer = div().flex_1().min_w(0);

    const tabItems = shown.map((tabInfo, index) =>
      this.tabItem(space, tabInfo, statuses.tabs[tabInfo.id] ?? null, index),
    );

    const scroller = h_flex()
      .id('tab-scroll')
      .flex_1()
      .min_w(0)
      .h_full()
      .items_center()
      .gap(spacing.xxsmall)
      .overflow_x_scrollbar()
      .children(tabItems)
      .child(endSpacer);

    return h_flex()
      .size_full()
      .min_w(0)
      .pt(spacing.small)
      .items_center()
      .bg(palette.chrome)
      .on_mouse_up('left', () => {
        this.drag = noDrag;
      })
      .on_scroll_wheel((event) => {
        if (Math.abs(event.delta.y) >= 1) {
          const scrollCommand = event.delta.y > 0 ? 'tab.prev' : 'tab.next';

          run(scrollCommand);
        }
      })
      .child(startSpacer)
      .child(scroller)
      .child(this.controls(enabled));
  }

  private syncPanel(space: SpaceInfo | undefined, enabled: string[]): void {
    if (space === undefined || findLayoutNode('panel') === null) {
      return;
    }

    const now = shownPanel();

    const result = panelMemory(this.memory, {
      now,
      space: space.id,
      enabled,
      time: Date.now(),
    });

    this.memory = result.memory;

    if (result.effect.kind === 'show') {
      showPanel(result.effect.panel);
    }

    if (result.persisted) {
      localStorage.setItem(panelStorageKey, JSON.stringify(this.memory.stored));
    }
  }

  private tabItem(
    space: SpaceInfo | undefined,
    tabInfo: TabInfo,
    status: Status | null,
    index: number,
  ): Element {
    const paneList = panes();
    const program = tabProgram(tabInfo, paneList);
    const hasIcon = program?.icon !== null && program !== undefined;
    const tabIcon = hasIcon ? programIcon(program, 'small') : null;

    return tab({
      label: tabLabel(tabInfo, program, paneList, terminals()),
      active: tabInfo.active,
      hovered: this.hoveredTab === tabInfo.id,
      icon: tabIcon,
      status,
      close: this.closeButton(tabInfo),
    })
      .id(`tab-${tabInfo.id}`)
      .on_hover((hovered, cx) => {
        this.hoveredTab = hoveredAfter(this.hoveredTab, tabInfo.id, hovered);
        cx.notify();
      })
      .on_mouse_down('left', (event, cx) => {
        cx.stop_propagation();
        this.drag = startDrag(tabIds(space), index);

        if (event.click_count === 2) {
          askFirst('tab.rename', { id: tabInfo.id });
        }
      })
      .on_mouse_up('left', () => {
        this.release(tabInfo);
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

  private release(tabInfo: TabInfo): void {
    const liveSpace = spaces().find((candidate) => candidate.active);
    const action = tabDropAction(this.drag, tabInfo.id, tabIds(liveSpace));

    this.drag = noDrag;

    if (action.kind === 'move') {
      run('tab.move', { id: action.id, index: action.index });
    } else {
      run('tab.select', { id: action.id });
    }
  }

  private closeButton(tabInfo: TabInfo): Element {
    return iconButton({ name: 'x', size: 'small' })
      .id(`close-${tabInfo.id}`)
      .on_mouse_down('left', stopPress)
      .on_click((_event, cx) => {
        cx.stop_propagation();
        askFirst('tab.close', { id: tabInfo.id });
      });
  }

  private controls(enabled: string[]): Element {
    const newButton = iconToggle({
      name: 'plus',
      label: 'New tab',
      active: shared(newMenuOpenKey) === true,
    })
      .id('tab-new')
      .on_mouse_down('left', (event, cx) => {
        cx.stop_propagation();
        this.plusBox = pressedBox(event);
      })
      .on_click(() => {
        const at = newMenuPoint(this.plusBox, appZoom());

        openOverlay({
          mod: 'koja-new-menu',
          kind: 'popup',
          frame: 'none',
          width: overlaySize.newMenuWidth,
          height: overlaySize.wideMenuHeight,
          ...(at === null ? {} : { at }),
        });
      });

    const normalMode = Boolean(shared('koja-modal'));
    const visiblePanels = panels.filter((panel) => enabled.includes(panel.id));
    const panelButtons = visiblePanels.map((panel) => this.panelButton(panel));
    const modeToken = normalMode ? 'blocked' : 'ansi2';
    const modeMark = h_flex().mx(spacing.small).child(indicator(modeToken));

    return h_flex()
      .flex_none()
      .gap(spacing.xxsmall)
      .pl(spacing.small)
      .pr(spacing.xsmall)
      .items_center()
      .child(newButton)
      .children(panelButtons)
      .child(modeMark);
  }

  private panelButton(panel: Panel): Element {
    const on = shownPanel() === panel.id;

    return toggleButton({ label: panel.label, active: on, start: icon(panel.icon, 'small') })
      .id(`panel-${panel.id}`)
      .on_mouse_down('left', stopPress)
      .on_click(() => {
        const target = on ? null : panel.id;

        showPanel(target);
      });
  }
}
