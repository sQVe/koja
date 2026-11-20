import { h_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';
import { div, View } from 'gpui-kit';
import type { PaneInfo } from 'herdr';
import { home, openOverlay, panes, props, run, shared, terminals } from 'herdr';

import type { PaneHeaderMenuAction } from '../../kit/index.ts';
import {
  askFirst,
  colors,
  controlSize,
  iconButton,
  normalFocusFill,
  overlaySize,
  paneActions,
  paneHeaderFields,
  paneHeaderWidth,
  paneOverflowButton,
  paneStatusElement,
  statusMarkWidth,
  programIcon,
  radius,
  recordOf,
  roleBadge,
  roleText,
  spacing,
  stringOf,
  taskOfPane,
  withTextRole,
} from '../../kit/index.ts';
import { headerTone } from './headerTone.ts';
import { folderLabel } from './paneFolder.ts';
import { paneFolder, paneName, paneProgram } from './paneLabel.ts';
import { paneRole } from './paneRole.ts';

interface PaneMenuDetails {
  task: string | null;
  branch: string | null;
  folder: string;
}

const headerPane = (): PaneInfo | undefined => {
  const paneId = stringOf(recordOf(props()).pane);

  return panes().find((candidate) => candidate.pane === paneId);
};

const paneButton = (entry: PaneHeaderMenuAction, id: string): Element =>
  iconButton({ name: entry.icon })
    .id(id)
    .accessibility_label(entry.label)
    .tooltip(entry.label)
    .on_click((_event, cx) => {
      cx.stop_propagation();
      entry.action?.();
    });

const paneButtons = (pane: PaneInfo): Element[] => {
  const ids = ['split-right', 'split-down', 'zoom', 'close'];

  const actions = paneActions({
    zoomed: pane.zoomed,
    onSplitRight: () => run('pane.split', { direction: 'right', pane: pane.pane }),
    onSplitDown: () => run('pane.split', { direction: 'down', pane: pane.pane }),
    onZoom: () => run('pane.zoom', { pane: pane.pane }),
    onClose: () => {
      askFirst('pane.close', { pane: pane.pane });
    },
  });

  return actions.map((entry, index) => paneButton(entry, `pane-${ids[index]}-${pane.pane}`));
};

const openPaneMenu = (pane: PaneInfo, details: PaneMenuDetails): void => {
  openOverlay({
    mod: 'koja-menu',
    kind: 'popup',
    width: paneHeaderWidth.menuWidth,
    height: overlaySize.menuHeight,
    props: {
      tab: 'pane',
      target: { pane: pane.pane, terminal: pane.terminal },
      task: details.task,
      branch: details.branch,
      folder: details.folder,
    },
  });
};

export default class PaneHeader extends View {
  private hovered = false;

  private width: number | null = null;

  override render(): Element {
    const pane = headerPane();

    if (pane === undefined) {
      return div();
    }

    return this.header(pane);
  }

  private header(pane: PaneInfo): Element {
    const palette = colors();
    const tone = headerTone(pane.focused, Boolean(shared('koja-modal')));

    const element = h_flex()
      .id(`pane-header-${pane.pane}`)
      .size_full()
      .px(spacing.large)
      .gap(spacing.medium)
      .items_center()
      .overflow_hidden()
      .border_b(spacing.hairline)
      .border_color(palette.selected)
      .on_hover((hovered, cx) => {
        this.hovered = hovered;
        cx.notify();
      })
      .on_size_change((size, cx) => {
        this.width = size.width;
        cx.notify();
      })
      .on_click(() => run('pane.focus', { pane: pane.pane }));

    if (tone.tinted) {
      element.bg(normalFocusFill(palette)).rounded_t(radius.cardInner);
    }

    const program = paneProgram(pane);

    if (program !== null && program.icon !== null) {
      const programMark = programIcon(program, 'default').text_color(palette[tone.icon]);

      element.child(programMark);
    }

    const name = paneName(pane);
    const terminalRecords = pane.terminal === null ? [] : terminals();
    const role = pane.terminal === null ? null : paneRole(pane.terminal, terminalRecords);
    const task = taskOfPane(pane, terminalRecords);
    const branch = pane.branch;
    const folderText = folderLabel(paneFolder(pane), home());

    const fields = paneHeaderFields({
      width: this.width,
      name,
      ...(role === null ? {} : { role }),
      folder: folderText,
      statusWidth: statusMarkWidth(pane.status),
    });

    const titleBox = div()
      .flex_initial()
      .min_w(controlSize.paneLabelMinWidth)
      .max_w(controlSize.paneLabelMaxWidth)
      .truncate();

    const title = withTextRole(titleBox, 'detail', tone.title).child(name);

    element.child(title);

    if (role !== null) {
      element.child(roleBadge(role, fields.role));
    }

    if (fields.folder !== 'dropped') {
      const folder = roleText('detail', folderText).flex_1();

      element.child(folder);
    }

    const status = paneStatusElement(pane.status);

    if (status !== null) {
      element.child(status);
    }

    if (fields.compact) {
      const action = paneOverflowButton(() => {
        openPaneMenu(pane, { task, branch, folder: folderText });
      }).ml_auto();

      element.child(action);
    } else if (this.hovered) {
      element.children(paneButtons(pane));
    }

    return element;
  }
}
