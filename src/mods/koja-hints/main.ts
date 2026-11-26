import { h_flex, v_flex } from 'gpui-base';
import type { Context, Element } from 'gpui-kit';
import { View } from 'gpui-kit';
import { layout, props, run } from 'herdr';

import { recordOf, stringOf } from '../../kit/fields.ts';
import { keyHintCard } from '../../kit/keyHintCard.ts';
import type { PartLetter } from '../../kit/keyHints.ts';
import { isPartLetter, partKeyHints } from '../../kit/keyHints.ts';
import { cardPlacement } from './placement.ts';

const shownPart = (): PartLetter | null => {
  const part = stringOf(recordOf(props())['part']);

  return part !== null && isPartLetter(part) ? part : null;
};

const cancelKeys = (_event: unknown, cx: Context): void => {
  cx.stop_propagation();
  run('koja-modal.cancel');
};

export default class KeyHints extends View {
  override render(): Element {
    const root = v_flex().relative().size_full().on_mouse_down('left', cancelKeys);
    const part = shownPart();

    if (part === null) {
      return root;
    }

    const placement = cardPlacement(layout());

    const card = h_flex()
      .absolute()
      .left(placement.left)
      .right(placement.right)
      .bottom(placement.bottom)
      .justify_center()
      .child(keyHintCard(partKeyHints(part)));

    return root.child(card);
  }
}
