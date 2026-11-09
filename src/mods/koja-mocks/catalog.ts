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

const paletteSize: SceneSize = {
  width: overlaySize.pickerListWidth,
  height: overlaySize.wideMenuHeight,
};

const shellSceneSize: SceneSize = {
  width: overlaySize.shellWidth,
  height: overlaySize.shellHeight,
};

const sceneSizes = {
  sidebar: { width: overlaySize.wideMenuWidth, height: overlaySize.wideMenuHeight },
  states: { width: overlaySize.promptWidth, height: overlaySize.worktreeListHeight },
  popup: { width: overlaySize.worktreeListWidth, height: overlaySize.worktreeListHeight },
  controls: { width: overlaySize.worktreeListWidth, height: overlaySize.wideMenuHeight },
  shell: shellSceneSize,
  'pane-headers': {
    width: overlaySize.paneHeadersWidth,
    height: overlaySize.paneHeadersHeight,
  },
  'smoke-1': paletteSize,
  'smoke-2': paletteSize,
  'smoke-3': paletteSize,
  'smoke-4': paletteSize,
  'direction-koja': shellSceneSize,
  'direction-koja-normal': shellSceneSize,
  'sidebar-inbox': shellSceneSize,
  'sidebar-hover': shellSceneSize,
  'sidebar-find': shellSceneSize,
  'sidebar-states': shellSceneSize,
  'overlay-palette': shellSceneSize,
  'overlay-goto': shellSceneSize,
  'overlay-keys': shellSceneSize,
  'overlay-menu': shellSceneSize,
  'overlay-new': shellSceneSize,
  'overlay-menu-normal': shellSceneSize,
  'overlay-new-normal': shellSceneSize,
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
