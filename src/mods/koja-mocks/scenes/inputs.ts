import type { InputState } from 'gpui-base';

import type { SceneName } from '../catalog.ts';
import type { MixState } from '../directions/attention/mix.ts';

// Herdr makes input states only outside render, so the view makes these once for every scene.
export interface SceneInputs {
  attention?: MixState;
  search: InputState;
  field: InputState;
  filledField: InputState;
  command: InputState;
}

type SceneFieldName = Exclude<keyof SceneInputs, 'attention'>;

// The field each scene draws that takes the keyboard when its window opens, so a reader sees the
// caret where typing goes.
export const sceneFields: Partial<Record<SceneName, SceneFieldName>> = {
  popup: 'search',
  controls: 'filledField',
  'smoke-1': 'command',
  'smoke-2': 'command',
  'smoke-3': 'command',
  'smoke-4': 'command',
};

export const sceneField = (name: SceneName, inputs: SceneInputs): InputState | null => {
  const field = sceneFields[name];

  return field === undefined ? null : inputs[field];
};
