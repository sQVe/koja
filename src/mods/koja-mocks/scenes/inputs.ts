import type { InputState } from 'gpui-base';

import type { MixState } from '../directions/attention/mix.ts';

// Herdr makes input states only outside render, so the view makes these once for every scene.
export interface SceneInputs {
  attention?: MixState;
  search: InputState;
  field: InputState;
  filledField: InputState;
  command: InputState;
}
