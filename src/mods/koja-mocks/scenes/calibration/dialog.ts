import { h_flex, v_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';
import { div } from 'gpui-kit';

import {
  actionButton,
  detailText,
  spacing,
  textSize,
  toggleButton,
} from '../../../../kit/index.ts';

type DialogQuality = 'clean' | 'nearPass' | 'nearFail' | 'clearFail';

const dialogTitle = (quality: DialogQuality): Element => {
  const element = div().font_semibold().child('Delete workspace');

  return quality === 'nearPass'
    ? element.text_size(textSize.default)
    : element.text_size(textSize.large);
};

const dialogActions = (quality: DialogQuality): Element => {
  const actions = h_flex().flex_none().justify_end().gap(spacing.medium);

  if (quality !== 'nearFail') {
    actions.child(toggleButton({ label: 'Cancel', active: false }));
  }

  return actions.child(actionButton({ label: 'Delete', enabled: true }));
};

const dialogScene = (quality: DialogQuality): Element => {
  const root = v_flex().flex_1().min_h(0).p(spacing.xlarge).gap(spacing.large);

  if (quality !== 'clearFail') {
    root.child(dialogTitle(quality));
    root.child(detailText('This removes the space and its settings. Terminals keep running.'));
  }

  return root.child(div().flex_1()).child(dialogActions(quality));
};

export const dialogClean = (): Element => dialogScene('clean');

export const dialogNearPass = (): Element => dialogScene('nearPass');

export const dialogNearFail = (): Element => dialogScene('nearFail');

export const dialogClearFail = (): Element => dialogScene('clearFail');
