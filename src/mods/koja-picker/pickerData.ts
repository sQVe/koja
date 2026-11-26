import { panes, props, setShared, shared, spaces, terminals } from 'herdr';

import { modName, recordOf, rollupStatuses, stringOf } from '../../kit/index.ts';
import type { PickerHistory } from './history.ts';
import { createHistory } from './history.ts';
import type { PreviewSession } from './previewLifecycle.ts';
import { resumePreviewSession } from './previewSession.ts';
import type { PickerData } from './rows.ts';
import { spaceFacts } from './spaceFacts.ts';

type PickerPart = 'list' | 'preview-header' | 'preview-error' | 'footer';

export const history: PickerHistory = createHistory(
  {
    get: (key) => shared(key),
    set: (key, value) => {
      setShared(key, value);
    },
    liveTabs: () => {
      const tabIds = spaces().flatMap((space) => space.tabs.map((tab) => tab.id));

      return new Set(tabIds);
    },
  },
  { recent: `${modName}.recent`, focus: `${modName}.focus` },
);

const parts: PickerPart[] = ['list', 'preview-header', 'preview-error', 'footer'];

const isPart = (value: string | null): value is PickerPart => parts.some((part) => part === value);

// null is the copy that `mod.open` starts, which runs the preview and opens the picker itself.
export const pickerPart = (): PickerPart | null => {
  const part = stringOf(recordOf(props())['part']);

  return isPart(part) ? part : null;
};

export const pickerData = (): PickerData => {
  const spaceList = spaces();
  const paneList = panes();
  const terminalList = terminals();

  return {
    spaces: spaceList,
    panes: paneList,
    terminals: terminalList,
    statuses: rollupStatuses(spaceList, paneList, terminalList),
    facts: spaceFacts(spaceList, paneList),
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
