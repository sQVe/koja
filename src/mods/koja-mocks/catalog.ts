import { overlaySize, spacing } from '../../kit/size.ts';

export interface Point {
  x: number;
  y: number;
}

export type SceneName = 'sidebar';

interface Scene {
  name: SceneName;
  width: number;
  height: number;
}

export type SceneLookup = { scene: Scene } | { error: string };

// Logical px from the top left of the window, where every scene window opens.
export const sceneOrigin: Point = { x: spacing.xxlarge, y: overlaySize.topOffset };

const sceneSizes: Record<SceneName, { width: number; height: number }> = {
  sidebar: { width: overlaySize.wideMenuWidth, height: overlaySize.wideMenuHeight },
};

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
