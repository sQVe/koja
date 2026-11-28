import type { Element } from 'gpui-kit';
import { div } from 'gpui-kit';
import { notify } from 'herdr';

import type { ToastCardOptions, ToastLevel } from '../../kit/index.ts';
import {
  actionButton,
  iconPath,
  toastCard,
  toastCommandBody,
  toastLevels,
  toastSize,
} from '../../kit/index.ts';
import { sample, surfaceSample } from './sample.ts';

type ToastSpecimen = Omit<ToastCardOptions, 'fitHeight'>;

const messages: Record<ToastLevel, { title: string; body: string }> = {
  info: { title: 'Update available', body: 'Restart to install the new version.' },
  success: { title: 'Build finished', body: 'All checks passed.' },
  warning: { title: 'Checks are stale', body: 'The last check ran 8 minutes ago.' },
  error: { title: 'Build failed', body: 'typecheck exited with code 1.' },
};

const toastSample = (label: string, card: ToastSpecimen): Element =>
  sample(label, surfaceSample('chrome', toastCard({ ...card, fitHeight: true })));

const levelSample = (level: ToastLevel): Element => {
  const message = messages[level];

  return toastSample(`${level} toast`, {
    id: `toast-${level}`,
    level,
    icon: null,
    title: message.title,
    body: message.body,
  });
};

const iconSample = (): Element => {
  const message = messages.info;

  return toastSample('Icon instead of the level dot', {
    id: 'toast-icon',
    level: 'info',
    icon: { path: iconPath('palette'), tint: true },
    title: message.title,
    body: message.body,
  });
};

const twoLineBody = 'The first line of the body.\nThe second line of the body.';

const twoLineSample = (): Element =>
  toastSample('Two-line body', {
    id: 'toast-two-line',
    level: 'info',
    icon: null,
    title: 'Two lines',
    body: twoLineBody,
  });

const fixedSample = (): Element => {
  const message = messages.error;

  const card = toastCard({
    id: 'toast-fixed',
    level: 'error',
    icon: null,
    title: message.title,
    body: twoLineBody,
    fitHeight: false,
  });

  const frame = div().w(toastSize.width).h(toastSize.windowHeight).child(card);

  return sample('Fixed height, as a notification shows', surfaceSample('chrome', frame));
};

const loginCommand = 'hc machine login devbox';

const loginBody = (): Element =>
  toastCommandBody(loginCommand, actionButton({ label: 'Copy', enabled: true }));

const loginSample = (): Element =>
  toastSample('Machine login with a Copy button', {
    id: 'toast-login',
    level: 'info',
    icon: null,
    title: 'devbox needs a login: run',
    body: loginBody(),
  });

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
  ...toastLevels.map(levelSample),
  iconSample(),
  twoLineSample(),
  fixedSample(),
  loginSample(),
  sample('Post a notification', postNotification()),
];
