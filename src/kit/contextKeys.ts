import type { AsyncContext, Context, Element } from 'gpui-kit';

interface ContextKeys {
  bind: (cx: AsyncContext) => void;
  withKeys: <Root extends Element>(root: Root, press: (key: string, cx: Context) => void) => Root;
}

export const createContextKeys = (
  context: string,
  bindings: { keystroke: string; action: string }[],
): ContextKeys => ({
  // Window focus bindings win at startup. A keys.json reload replaces these bindings.
  bind: (cx: AsyncContext): void => {
    cx.bind_keys(bindings.map((binding) => ({ ...binding, context })));
  },
  withKeys: <Root extends Element>(root: Root, press: (key: string, cx: Context) => void): Root => {
    let element = root.key_context(context);

    for (const { keystroke, action } of bindings) {
      element = element.on_action(action, (_event, cx) => {
        press(keystroke, cx);
      });
    }

    return element;
  },
});
