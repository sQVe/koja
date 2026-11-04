import { overlaySize, spacing } from '../../kit/size.ts';

export interface Point {
  x: number;
  y: number;
}

interface SceneSize {
  width: number;
  height: number;
}

interface Scene extends SceneSize {
  name: SceneName;
}

export type SceneLookup = { scene: Scene } | { error: string };

const sceneSizes = {
  sidebar: { width: overlaySize.wideMenuWidth, height: overlaySize.wideMenuHeight },
  'smoke-1': { width: overlaySize.pickerListWidth, height: overlaySize.wideMenuHeight },
  'smoke-2': { width: overlaySize.pickerListWidth, height: overlaySize.wideMenuHeight },
  'smoke-3': { width: overlaySize.pickerListWidth, height: overlaySize.wideMenuHeight },
  'smoke-4': { width: overlaySize.pickerListWidth, height: overlaySize.wideMenuHeight },
} as const satisfies Record<string, SceneSize>;

export type SceneName = keyof typeof sceneSizes;

// Logical px from the top left of the window, where every scene window opens.
export const sceneOrigin: Point = { x: spacing.xxlarge, y: overlaySize.topOffset };

const sceneNames = Object.keys(sceneSizes);

const isSceneName = (name: string): name is SceneName => Object.hasOwn(sceneSizes, name);

const knownNames = (): string => `Known scenes: ${sceneNames.join(', ')}.`;

export const findScene = (name: string): SceneLookup => {
  const trimmed = name.trim();

  if (trimmed === '') {
    return { error: `Type a scene name. ${knownNames()}` };
  }

  if (!isSceneName(trimmed)) {
    return { error: `No scene named "${trimmed}". ${knownNames()}` };
  }

  return { scene: { name: trimmed, ...sceneSizes[trimmed] } };
};
