import { h_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';
import { notify } from 'herdr';

import type { ToastLevel } from '../../kit/index.ts';
import { actionButton, modName, roleText, spacing, toastCard } from '../../kit/index.ts';
import { sample, surfaceSample } from './sample.ts';

const levels: ToastLevel[] = ['info', 'success', 'warning', 'error'];

const messages: Record<ToastLevel, { title: string; body: string }> = {
  info: { title: 'Update available', body: 'Restart to install the new version.' },
  success: { title: 'Build finished', body: 'All checks passed.' },
  warning: { title: 'Checks are stale', body: 'The last check ran 8 minutes ago.' },
  error: { title: 'Build failed', body: 'typecheck exited with code 1.' },
};

const levelSample = (level: ToastLevel): Element => {
  const message = messages[level];

  return sample(
    `${level} toast`,
    surfaceSample(
      'chrome',
      toastCard({
        id: `toast-${level}`,
        level,
        icon: null,
        title: message.title,
        body: message.body,
        fitHeight: true,
      }),
    ),
  );
};

const iconSample = (): Element => {
  const icon = ['mods', modName, 'icons', 'palette.svg'].join('/');

  return sample(
    'Icon instead of the level dot',
    surfaceSample(
      'chrome',
      toastCard({
        id: 'toast-icon',
        level: 'info',
        icon,
        title: 'Update available',
        body: 'Restart to install the new version.',
        fitHeight: true,
      }),
    ),
  );
};

const twoLineSample = (): Element =>
  sample(
    'Two-line body',
    surfaceSample(
      'chrome',
      toastCard({
        id: 'toast-two-line',
        level: 'info',
        icon: null,
        title: 'Two lines',
        body: 'The first line of the body.\nThe second line of the body.',
        fitHeight: true,
      }),
    ),
  );

const loginCommand = 'hc machine login devbox';

const loginBody = (): Element => {
  const command = roleText('detail', loginCommand).flex_1();

  return h_flex()
    .flex_1()
    .min_w(0)
    .gap(spacing.medium)
    .items_center()
    .child(command)
    .child(actionButton({ label: 'Copy', enabled: true }));
};

const loginSample = (): Element =>
  sample(
    'Machine login with a Copy button',
    surfaceSample(
      'chrome',
      toastCard({
        id: 'toast-login',
        level: 'info',
        icon: null,
        title: 'devbox needs a login: run',
        body: loginBody(),
        fitHeight: true,
      }),
    ),
  );

const postNotification = (): Element =>
  actionButton({ label: 'Post a notification', enabled: true }).on_click(() => {
    notify({
      title: 'Gallery notification',
      body: 'Click to open the palette',
      level: 'info',
      timeout: 4000,
      action: { name: 'app.palette' },
    });
  });

export const toasts = (): Element[] => [
  ...levels.map(levelSample),
  iconSample(),
  twoLineSample(),
  loginSample(),
  sample('Post a notification', postNotification()),
];
