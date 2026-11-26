import { h_flex, v_flex } from 'gpui-base';
import type { Context, Element } from 'gpui-kit';
import { View } from 'gpui-kit';
import { layout, props, run } from 'herdr';

import { numberOf, recordOf, stringOf } from '../../kit/fields.ts';
import { keyHintCard } from '../../kit/keyHintCard.ts';
import type { KeyHintOptions, PartLetter } from '../../kit/keyHints.ts';
import { isPartLetter, partKeyHints } from '../../kit/keyHints.ts';
import { listKeys } from '../../kit/normalKeys.ts';
import { cardPlacement } from './placement.ts';

const shownHints = (): { part: PartLetter; options: KeyHintOptions } | null => {
  const values = recordOf(props());
  const part = stringOf(values['part']);

  if (part === null || !isPartLetter(part)) {
    return null;
  }

  const layer = values['list'] === true ? listKeys : [];

  return { part, options: { layer, count: numberOf(values['count']) } };
};

const cancelKeys = (_event: unknown, cx: Context): void => {
  cx.stop_propagation();
  run('koja-modal.cancel');
};

export default class KeyHints extends View {
  override render(): Element {
    const root = v_flex().relative().size_full().on_mouse_down('left', cancelKeys);
    const hints = shownHints();

    if (hints === null) {
      return root;
    }

    const placement = cardPlacement(layout());

    const card = h_flex()
      .absolute()
      .left(placement.left)
      .right(placement.right)
      .bottom(placement.bottom)
      .justify_center()
      .child(keyHintCard(partKeyHints(hints.part, hints.options)));

    return root.child(card);
  }
}
