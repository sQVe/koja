import type { InputState } from 'gpui-base';
import { InputState as InputStates, v_flex } from 'gpui-base';
import type { AsyncContext, Context, Element, Task } from 'gpui-kit';
import { View } from 'gpui-kit';
import { shared } from 'herdr';

import type { DataState } from '../../data/consumer.ts';
import { readDataState } from '../../data/consumer.ts';
import { colors, sectionHeader, spacing, withTextRole } from '../../kit/index.ts';
import { actions } from './actions.ts';
import { buttons } from './buttons.ts';
import { dataLayer } from './data.ts';
import { dialogs } from './dialogs.ts';
import { headers } from './headers.ts';
import { icons } from './icons.ts';
import { marks } from './marks.ts';
import { popupSurfaces } from './popup.ts';
import { rows } from './rows.ts';
import { searchAndText } from './searchAndText.ts';
import { sidebarParts } from './sidebarParts.ts';
import { states } from './states.ts';
import { tabs } from './tabs.ts';
import { textSizes } from './textSizes.ts';

interface StaleDeadline {
  staleAt: number;
  task: Task;
}

const staleAtOf = (state: DataState): number | null =>
  state.kind === 'live' ? state.staleAt : null;

const section = (title: string, content: Element[]): Element =>
  v_flex()
    .gap(spacing.small)
    .child(sectionHeader({ label: title, size: 'default' }))
    .child(v_flex().px(spacing.large).gap(spacing.medium).children(content));

export default class Gallery extends View {
  private readonly search: InputState = InputStates.new({ placeholder: 'Search field' });
  private readonly emptyField: InputState = InputStates.new({ placeholder: 'Commit message' });
  private readonly focusedField: InputState = InputStates.new({ placeholder: 'Commit message' });
  private readonly filledField: InputState = InputStates.new({ placeholder: 'Commit message' });
  private readonly renameField: InputState = InputStates.new({ placeholder: 'Tab name' });

  private staleDeadline: StaleDeadline | null = null;

  override init(_props: unknown, _cx: AsyncContext): void {
    this.search.set_value('');
    this.filledField.set_value('Fix the login redirect');
    this.renameField.set_value('Build and test');
  }

  // Herdr redraws on every shared write but not when a heartbeat ages out, so one task redraws at
  // the deadline of the heartbeat shown.
  private followStaleDeadline(state: DataState, now: number, cx: Context): void {
    const staleAt = staleAtOf(state);

    if (staleAt === (this.staleDeadline?.staleAt ?? null)) {
      return;
    }

    this.staleDeadline?.task.cancel();
    this.staleDeadline = null;

    if (staleAt === null) {
      return;
    }

    const task = cx.timer.after(staleAt - now, (timerCx) => {
      this.staleDeadline = null;
      timerCx.notify();
    });

    this.staleDeadline = { staleAt, task };
  }

  override render(cx: Context): Element {
    const palette = colors();
    const now = Date.now();
    const data = readDataState(shared, now);

    this.followStaleDeadline(data, now, cx);

    return withTextRole(v_flex(), 'body')
      .id('gallery')
      .size_full()
      .overflow_y_scrollbar()
      .py(spacing.medium)
      .gap(spacing.xlarge)
      .bg(palette.popover)
      .child(section('Data layer', dataLayer(data, now)))
      .child(section('States', states()))
      .child(section('Buttons', buttons()))
      .child(section('List rows', rows()))
      .child(section('Text roles', textSizes()))
      .child(section('Icons', icons()))
      .child(section('Status marks', marks()))
      .child(section('Sidebar parts', sidebarParts()))
      .child(section('Section headers', headers()))
      .child(
        section(
          'Action button and text field',
          actions(this.emptyField, this.focusedField, this.filledField),
        ),
      )
      .child(section('Dialogs', dialogs(this.renameField)))
      .child(section('Tabs', tabs()))
      .child(section('Popup surface', popupSurfaces()))
      .child(section('Search and text', searchAndText(this.search)));
  }
}
