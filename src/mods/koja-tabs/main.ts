import { h_flex } from 'gpui-base';
import type { Context, Element } from 'gpui-kit';
import { div, View } from 'gpui-kit';
import type { SpaceInfo, TabInfo } from 'herdr';
import { openOverlay, panes, run, settings, shared, spaces } from 'herdr';

import type { DragState } from '../../kit/drag.ts';
import { noDrag, startDrag } from '../../kit/drag.ts';
import type { IconName } from '../../kit/index.ts';
import {
  colors,
  currentWindow,
  findLayoutNode,
  icon,
  iconButton,
  indicator,
  layoutRoot,
  listOf,
  numberOf,
  overlaySize,
  programIcon,
  recordOf,
  spacing,
  stringOf,
  tab,
  toggleButton,
  trafficLightsPadding,
} from '../../kit/index.ts';
import type { PanelMemory } from './panelMemory.ts';
import { initialPanelMemory, panelMemory } from './panelMemory.ts';
import { tabDropAction } from './tabDrop.ts';
import { tabLabel, tabProgram } from './tabLabel.ts';

interface Panel {
  id: string;
  label: string;
  icon: IconName;
}

const panelStorageKey = 'panels';

const panels: Panel[] = [
  { id: 'files', label: 'Files', icon: 'file' },
  { id: 'changes', label: 'Changes', icon: 'git-compare' },
];

const stopPress = (_event: unknown, cx: Context): void => {
  cx.stop_propagation();
};

const readStoredPanels = (): Record<string, string | null> => {
  const stored: unknown = JSON.parse(localStorage.getItem(panelStorageKey) ?? '{}');

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

const windowButtonsPadding = (): number => {
  const shown = currentWindow();
  const sidebar = findLayoutNode('sidebar');
  const sidebarWidth = sidebar?.hidden === true ? 0 : (sidebar?.sizePx ?? 0);
  const zoom = numberOf(settings()['zoom']) ?? 1;

  return trafficLightsPadding({
    platform: shown?.platform ?? 'linux',
    titlebar: shown?.titlebar ?? 'system',
    fullscreen: shown?.fullscreen ?? false,
    lights: layoutRoot().trafficLights,
    zoom,
    offset: sidebarWidth,
    base: spacing.none,
  });
};

export default class Tabs extends View {
  private drag: DragState = noDrag;

  private memory: PanelMemory = initialPanelMemory(readStoredPanels());

  override render(): Element {
    const palette = colors();
    const space = spaces().find((candidate) => candidate.active);
    const shown = space?.tabs ?? [];
    const enabled = enabledPanels();

    this.syncPanel(space, enabled);

    const startPadding = windowButtonsPadding();

    return h_flex()
      .size_full()
      .min_w(0)
      .items_center()
      .bg(palette.chrome)
      .on_mouse_up('left', () => {
        this.drag = noDrag;
      })
      .on_scroll_wheel((event) => {
        if (Math.abs(event.delta.y) >= 1) {
          run(event.delta.y > 0 ? 'tab.prev' : 'tab.next');
        }
      })
      .child(div().w(startPadding).flex_none())
      .child(
        h_flex()
          .id('tab-scroll')
          .flex_1()
          .min_w(0)
          .h_full()
          .items_center()
          .gap(spacing.xxsmall)
          .overflow_x_scrollbar()
          .children(shown.map((tabInfo, index) => this.tabItem(space, tabInfo, index)))
          .child(div().flex_1().min_w(0)),
      )
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
        this.drag = startDrag(tabIds(space), index);

        if (event.click_count === 2) {
          run('tab.rename', { id: tabInfo.id });
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
        run('tab.close', { id: tabInfo.id });
      });
  }

  private controls(enabled: string[]): Element {
    const newButton = iconButton({ name: 'plus' })
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

    const normalMode = Boolean(shared('modal.pill'));

    return h_flex()
      .flex_none()
      .gap(spacing.xxsmall)
      .pl(spacing.small)
      .pr(spacing.xsmall)
      .items_center()
      .child(newButton)
      .children(
        panels
          .filter((panel) => enabled.includes(panel.id))
          .map((panel) => this.panelButton(panel)),
      )
      .child(
        h_flex()
          .mx(spacing.small)
          .child(indicator(normalMode ? 'blocked' : 'ansi2')),
      );
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
