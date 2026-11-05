import { panes, props, setShared, shared, spaces, terminals } from 'herdr';

import { modName, recordOf, rollupStatuses, stringOf } from '../../kit/index.ts';
import type { PickerHistory } from './history.ts';
import { createHistory } from './history.ts';
import type { PreviewSession } from './previewLifecycle.ts';
import { resumePreviewSession } from './previewSession.ts';
import type { PickerData } from './rows.ts';

export const history: PickerHistory = createHistory(
  {
    get: (key) => shared(key),
    set: (key, value) => {
      setShared(key, value);
    },
    liveTabs: () => new Set(spaces().flatMap((space) => space.tabs.map((tab) => tab.id))),
  },
  { recent: `${modName}.recent`, focus: `${modName}.focus` },
);

export const isList = (): boolean => recordOf(props())['part'] === 'list';

export const pickerData = (): PickerData => {
  const spaceList = spaces();
  const paneList = panes();
  const terminalList = terminals();

  return {
    spaces: spaceList,
    panes: paneList,
    terminals: terminalList,
    statuses: rollupStatuses(spaceList, paneList, terminalList),
    recent: history.recent(),
    focus: history.focus(),
  };
};

export const previewFromProps = (): PreviewSession | null => {
  const preview = recordOf(recordOf(props())['preview']);
  const folder = stringOf(preview['folder']);
  const statePath = stringOf(preview['state']);
  const viewer = stringOf(preview['viewer']);

  if (folder === null || statePath === null || viewer === null) {
    return null;
  }

  return resumePreviewSession({ address: viewer, folder, statePath });
};
