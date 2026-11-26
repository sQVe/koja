import { v_flex } from 'gpui-base';
import type { Context, Element } from 'gpui-kit';

import { actionButton, modName, spacing, stateLine } from '../../kit/index.ts';

export const previewError = (onRetry: (cx: Context) => void): Element => {
  const retry = actionButton({ label: 'Retry', enabled: true }).on_click((_event, cx) => {
    cx.stop_propagation();
    onRetry(cx);
  });

  return v_flex()
    .id(`${modName}-preview-error`)
    .size_full()
    .p(spacing.large)
    .child(
      stateLine({ kind: 'error', text: 'The preview could not start.', action: retry, wrap: true }),
    );
};
