import type { InputState } from 'gpui-base';

// Herdr makes input states only outside render, so the view makes these once for every scene.
export interface SceneInputs {
  search: InputState;
  field: InputState;
  filledField: InputState;
  command: InputState;
}
