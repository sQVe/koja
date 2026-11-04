import type { InputState } from 'gpui-base';
import { InputState as InputStates, v_flex } from 'gpui-base';
import type { AsyncContext, Element } from 'gpui-kit';
import { View } from 'gpui-kit';

import { colors, sectionHeader, spacing, textSize } from '../../kit/index.ts';
import { actions } from './actions.ts';
import { buttons } from './buttons.ts';
import { dialogs } from './dialogs.ts';
import { headers } from './headers.ts';
import { icons } from './icons.ts';
import { marks } from './marks.ts';
import { popupSurfaces } from './popup.ts';
import { rows } from './rows.ts';
import { searchAndText } from './searchAndText.ts';
import { sidebarSamples } from './sidebar.ts';
import { tabs } from './tabs.ts';
import { textSizes } from './textSizes.ts';

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

  override init(_props: unknown, _cx: AsyncContext): void {
    this.search.set_value('');
    this.filledField.set_value('Fix the login redirect');
    this.renameField.set_value('Build and test');
  }

  override render(): Element {
    const palette = colors();

    return v_flex()
      .id('gallery')
      .size_full()
      .overflow_y_scrollbar()
      .py(spacing.medium)
      .gap(spacing.xlarge)
      .bg(palette.popover)
      .text_size(textSize.default)
      .text_color(palette.foreground)
      .child(section('Text sizes', textSizes()))
      .child(section('Icons', icons()))
      .child(section('Status marks', marks()))
      .child(section('List rows', rows()))
      .child(section('Sidebar', sidebarSamples()))
      .child(section('Section headers', headers()))
      .child(section('Buttons', buttons()))
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
