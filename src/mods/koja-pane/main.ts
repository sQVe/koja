import { h_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';
import { div, View } from 'gpui-kit';
import type { PaneInfo, Status } from 'herdr';
import { home, panes, props, run } from 'herdr';

import type { IconName } from '../../kit/index.ts';
import {
  attentionBadge,
  colors,
  controlSize,
  iconButton,
  programIcon,
  recordOf,
  spacing,
  statusMark,
  stringOf,
  textSize,
} from '../../kit/index.ts';
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

const paneButton = (
  name: IconName,
  id: string,
  command: string,
  args: Record<string, unknown>,
): Element =>
  iconButton({ name })
    .id(id)
    .on_click((_event, cx) => {
      cx.stop_propagation();
      run(command, args);
    });

const paneButtons = (pane: PaneInfo): Element[] => {
  const zoomIcon: IconName = pane.zoomed ? 'minimize-2' : 'maximize-2';

  return [
    paneButton('columns-2', `pane-split-right-${pane.pane}`, 'pane.split', {
      direction: 'right',
      pane: pane.pane,
    }),
    paneButton('rows-2', `pane-split-down-${pane.pane}`, 'pane.split', {
      direction: 'down',
      pane: pane.pane,
    }),
    paneButton(zoomIcon, `pane-zoom-${pane.pane}`, 'pane.zoom', { pane: pane.pane }),
    paneButton('x', `pane-close-${pane.pane}`, 'pane.close', { pane: pane.pane }),
  ];
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
    const titleColor = pane.focused ? palette.foreground : palette.muted;
    const iconColor = pane.focused ? palette.muted : palette.dim;

    // No background here: the pane frame's rounded background shows through, so the top corners stay clean.
    const element = h_flex()
      .id(`pane-header-${pane.pane}`)
      .size_full()
      .px(spacing.large)
      .gap(spacing.medium)
      .items_center()
      .border_b(spacing.hairline)
      .border_color(palette.selected)
      .text_size(textSize.small)
      .on_hover((hovered, cx) => {
        this.hovered = hovered;
        cx.notify();
      })
      .on_click(() => run('pane.focus', { pane: pane.pane }));

    const program = paneProgram(pane);

    if (program !== null && program.icon !== null) {
      element.child(programIcon(program, 'default').text_color(iconColor));
    }

    element.child(
      div()
        .flex_initial()
        .min_w(0)
        .max_w(controlSize.paneLabelMaxWidth)
        .truncate()
        .font_medium()
        .text_color(titleColor)
        .child(paneName(pane)),
    );

    element.child(
      div()
        .flex_1()
        .min_w(0)
        .truncate()
        .text_color(palette.dim)
        .child(folderLabel(paneFolder(pane), home())),
    );

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
