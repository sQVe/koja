import { describe, expect, test } from 'bun:test';

import { paneHeaderMenuModel } from './paneHeaderMenuModel.ts';

const actions = {
  zoomed: false,
  onSplitRight: () => undefined,
  onSplitDown: () => undefined,
  onZoom: () => undefined,
  onClose: () => undefined,
};

describe('paneHeaderMenuModel', () => {
  test('lists only the fields that have text', () => {
    const full = paneHeaderMenuModel({
      ...actions,
      task: 'Build window shell',
      branch: 'me-1089-window-shell',
      folder: '~/code/koja',
    });

    const empty = paneHeaderMenuModel({ ...actions, task: 'Build window shell', branch: '' });

    expect(full.fields).toEqual([
      { icon: null, text: 'Build window shell', cut: 'end' },
      { icon: 'git-branch', text: 'me-1089-window-shell', cut: 'middle' },
      { icon: 'folder', text: '~/code/koja', cut: 'middle' },
    ]);

    expect(empty.fields).toEqual([{ icon: null, text: 'Build window shell', cut: 'end' }]);
  });

  test('shows the separator only when a field exists', () => {
    const empty = paneHeaderMenuModel({ ...actions });
    const full = paneHeaderMenuModel({ ...actions, task: 'Build window shell' });

    expect(empty.fields).toEqual([]);
    expect(empty.separator).toBe(false);
    expect(full.separator).toBe(true);
  });

  test('labels the zoom action Restore when the pane is zoomed', () => {
    const zoomed = paneHeaderMenuModel({ ...actions, zoomed: true });
    const plain = paneHeaderMenuModel({ ...actions, zoomed: false });

    expect(zoomed.actions.at(2)).toEqual({
      icon: 'minimize-2',
      label: 'Restore pane',
      action: actions.onZoom,
    });

    expect(plain.actions.at(2)).toEqual({
      icon: 'maximize-2',
      label: 'Zoom pane',
      action: actions.onZoom,
    });
  });

  test('lists the four pane actions in order', () => {
    const model = paneHeaderMenuModel({ ...actions });

    expect(model.actions.map((action) => action.label)).toEqual([
      'Split right',
      'Split down',
      'Zoom pane',
      'Close pane',
    ]);

    expect(model.actions.map((action) => action.icon)).toEqual([
      'columns-2',
      'rows-2',
      'maximize-2',
      'x',
    ]);
  });
});
