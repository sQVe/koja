import type { AsyncContext, Context, Element } from 'gpui-kit';

const keyContext = 'KojaModal';

const boundKeys = [
  { keystroke: 'tab', action: 'koja-modal-section-next' },
  { keystroke: 'shift-tab', action: 'koja-modal-section-previous' },
];

// Herdr takes Tab and Shift-Tab for itself in a window that was just started, so the mod binds
// them. A reload of keys.json drops these bindings, and the keys then arrive as raw keys.
export const bindSectionKeys = (cx: AsyncContext): void => {
  cx.bind_keys(boundKeys.map((key) => ({ ...key, context: keyContext })));
};

export const withSectionKeys = <Root extends Element>(
  root: Root,
  press: (key: string, cx: Context) => void,
): Root => {
  let element = root.key_context(keyContext);

  for (const { keystroke, action } of boundKeys) {
    element = element.on_action(action, (_event, cx) => {
      press(keystroke, cx);
    });
  }

  return element;
};
