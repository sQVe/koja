import type { IconName } from '../../kit/iconNames.ts';

export interface WindowControl {
  id: string;
  icon: IconName;
  command: string;
}

interface WindowButtonState {
  buttons: boolean;
  maximized: boolean;
}

export const windowControls = (state: WindowButtonState | null): WindowControl[] => {
  if (state?.buttons !== true) {
    return [];
  }

  return [
    { id: 'window-minimize', icon: 'minus', command: 'window.minimize' },
    {
      id: 'window-maximize',
      icon: state.maximized ? 'copy' : 'square',
      command: 'window.maximize',
    },
    { id: 'window-close', icon: 'x', command: 'window.close' },
  ];
};
