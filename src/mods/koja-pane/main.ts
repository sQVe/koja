import { h_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';
import { div, View } from 'gpui-kit';
import type { PaneInfo } from 'herdr';
import { home, openOverlay, panes, props, run, shared, spaces, terminals } from 'herdr';

import { terminalMetadata } from '../../data/terminalRecord.ts';
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
  paneBranchElement,
  paneFolderElement,
  paneOverflowButton,
  paneStatusElement,
  paneTaskElement,
  statusMarkWidth,
  programIcon,
  radius,
  recordOf,
  roleBadge,
  spacing,
  stringOf,
  withTextRole,
} from '../../kit/index.ts';
import { headerTone } from './headerTone.ts';
import { folderLabel } from './paneFolder.ts';
import { paneFolder, paneName, paneProgram } from './paneLabel.ts';

interface PaneMenuDetails {
  task: string | null;
  branch: string | null;
  folder: string;
}

interface PaneHeaderContext {
  name: string;
  role: string | null;
  task: string | null;
  paneBranch: string | null;
  branch: string | null;
  folderText: string;
  fields: ReturnType<typeof paneHeaderFields>;
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
      overflow: true,
      zoomed: pane.zoomed,
    },
  });
};

const spaceBranchOf = (tab: string): string | null =>
  spaces().find((candidate) => candidate.tabs.some((candidateTab) => candidateTab.id === tab))
    ?.branch ?? null;

const paneHeaderContext = (pane: PaneInfo, width: number | null): PaneHeaderContext => {
  const terminalRecords = pane.terminal === null ? [] : terminals();

  const terminalInfo =
    pane.terminal === null ? undefined : terminalMetadata(terminalRecords).get(pane.terminal);

  const name = paneName(pane);
  const role = terminalInfo?.role ?? null;
  const task = terminalInfo?.task ?? null;
  const paneBranch = pane.branch;
  const spaceBranch = spaceBranchOf(pane.tab);
  const branch = paneBranch !== null && paneBranch !== spaceBranch ? paneBranch : null;
  const folderText = folderLabel(paneFolder(pane), home());

  const fields = paneHeaderFields({
    width,
    name,
    ...(role === null ? {} : { role }),
    ...(task === null ? {} : { task }),
    ...(branch === null ? {} : { branch }),
    folder: folderText,
    statusWidth: statusMarkWidth(pane.status),
  });

  return { name, role, task, paneBranch, branch, folderText, fields };
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

    this.addHeaderContent(element, pane, palette, tone);

    return element;
  }

  private addHeaderContent(
    element: Element,
    pane: PaneInfo,
    palette: ReturnType<typeof colors>,
    tone: ReturnType<typeof headerTone>,
  ): void {
    const program = paneProgram(pane);

    if (program !== null && program.icon !== null) {
      const programMark = programIcon(program, 'default').text_color(palette[tone.icon]);

      element.child(programMark);
    }

    const context = paneHeaderContext(pane, this.width);

    const titleBox = div()
      .flex_initial()
      .min_w(controlSize.paneLabelMinWidth)
      .max_w(controlSize.paneLabelMaxWidth)
      .truncate();

    const title = withTextRole(titleBox, 'detail', tone.title).child(context.name);

    element.child(title);

    if (context.role !== null) {
      element.child(roleBadge(context.role, context.fields.role));
    }

    const fieldCut = context.fields.branch === 'cut' || context.fields.folder === 'cut';
    const task = paneTaskElement(context.task ?? undefined, fieldCut);

    if (task !== null) {
      element.child(task);
    }

    if (context.branch !== null && context.fields.branch !== 'dropped') {
      element.child(paneBranchElement(context.branch, context.fields.branch, false));
    }

    if (context.fields.folder !== 'dropped') {
      element.child(paneFolderElement(context.folderText, context.fields.folder, false));
    }

    const status = paneStatusElement(pane.status);

    if (status !== null) {
      element.child(status);
    }

    this.addHeaderActions(element, pane, context);
  }

  private addHeaderActions(element: Element, pane: PaneInfo, context: PaneHeaderContext): void {
    if (context.fields.compact) {
      const action = paneOverflowButton(() => {
        openPaneMenu(pane, {
          task: context.task,
          branch: context.paneBranch,
          folder: context.folderText,
        });
      }).ml_auto();

      element.child(action);
    } else if (this.hovered) {
      element.children(paneButtons(pane));
    }
  }
}
