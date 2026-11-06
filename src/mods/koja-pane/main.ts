import { h_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';
import { div, View } from 'gpui-kit';
import type { PaneInfo, Status } from 'herdr';
import { home, panes, props, run, shared } from 'herdr';

import type { PaneHeaderMenuAction } from '../../kit/index.ts';
import {
  attentionBadge,
  colors,
  controlSize,
  iconButton,
  normalFocusFill,
  paneActions,
  programIcon,
  radius,
  recordOf,
  roleText,
  spacing,
  statusMark,
  stringOf,
  withTextRole,
} from '../../kit/index.ts';
import { headerTone } from './headerTone.ts';
import { folderLabel } from './paneFolder.ts';
import { paneFolder, paneName, paneProgram } from './paneLabel.ts';

const headerPane = (): PaneInfo | undefined => {
  const paneId = stringOf(recordOf(props()).pane);

  return panes().find((candidate) => candidate.pane === paneId);
};

const statusElement = (status: Status | null): Element | null => {
  if (status === 'blocked') {
    return attentionBadge('Needs you');
  }

  if (status === 'working' || status === 'done') {
    return statusMark(status);
  }

  return null;
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
    onClose: () => run('pane.close', { pane: pane.pane }),
  });

  return actions.map((entry, index) => paneButton(entry, `pane-${ids[index]}-${pane.pane}`));
};

export default class PaneHeader extends View {
  private hovered = false;

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
      .border_b(spacing.hairline)
      .border_color(palette.selected)
      .on_hover((hovered, cx) => {
        this.hovered = hovered;
        cx.notify();
      })
      .on_click(() => run('pane.focus', { pane: pane.pane }));

    if (tone.tinted) {
      element.bg(normalFocusFill(palette)).rounded_t(radius.cardInner);
    }

    const program = paneProgram(pane);

    if (program !== null && program.icon !== null) {
      element.child(programIcon(program, 'default').text_color(palette[tone.icon]));
    }

    element.child(
      withTextRole(
        div().flex_initial().min_w(0).max_w(controlSize.paneLabelMaxWidth).truncate(),
        'detail',
        tone.title,
      ).child(paneName(pane)),
    );

    element.child(roleText('detail', folderLabel(paneFolder(pane), home())).flex_1());

    const status = statusElement(pane.status);

    if (status !== null) {
      element.child(status);
    }

    if (this.hovered) {
      element.children(paneButtons(pane));
    }

    return element;
  }
}
