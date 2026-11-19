import { v_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';
import type { Program } from 'herdr';

import type { PaneHeaderOptions } from '../../../kit/index.ts';
import { shellSize, spacing } from '../../../kit/index.ts';
import { compactWithMenu, specimen } from './paneCard.ts';

const piProgram: Program = {
  key: 'pi',
  name: 'Pi',
  icon: null,
  tint: false,
  tile: null,
  color: null,
  shell: false,
  agent: true,
};

const paneFolder = '~/code/koja';
const longFolder = '~/code/koja/packages/desktop/src/mods/koja-mocks';
const workerTask = 'Build window shell';
const workerBranch = 'me-1089-window-shell';

const piPane = (extra: Partial<PaneHeaderOptions>): PaneHeaderOptions => {
  const width = extra.width ?? shellSize.wideSpecimenWidth;

  return {
    program: piProgram,
    name: 'Pi',
    folder: paneFolder,
    status: null,
    focused: false,
    zoomed: false,
    ...extra,
    width,
  };
};

const rolePane = (role: string, extra: Partial<PaneHeaderOptions> = {}): PaneHeaderOptions =>
  piPane({ role, ...extra });

export const paneHeadersRolesScene = (): Element =>
  v_flex()
    .flex_1()
    .min_h(0)
    .p(spacing.medium)
    .gap(spacing.medium)
    .child(specimen(rolePane('lead', { status: 'working', focused: true })))
    .child(specimen(rolePane('architect')))
    .child(
      specimen(rolePane('worker', { status: 'working', task: workerTask, branch: workerBranch })),
    )
    .child(specimen(rolePane('scout')))
    .child(specimen(rolePane('reviewer', { status: 'done' })))
    .child(specimen(rolePane('checker')))
    .child(specimen(rolePane('qa')))
    .child(specimen(rolePane('browser', { status: 'blocked' })))
    .child(specimen(piPane({})))
    .child(
      specimen(
        rolePane('architect', {
          task: workerTask,
          branch: workerBranch,
          folder: longFolder,
          width: shellSize.folderCutWidth,
        }),
      ),
    )
    .child(
      compactWithMenu(
        rolePane('architect', {
          status: 'working',
          task: workerTask,
          branch: workerBranch,
          width: shellSize.compactSpecimenWidth,
        }),
      ),
    );
