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
  'attention-corner': shellSceneSize,
  'attention-corner-normal': shellSceneSize,
  'attention-mix': shellSceneSize,
  'attention-mix-normal': shellSceneSize,
  'attention-mix-open': shellSceneSize,
  'attention-brief': shellSceneSize,
  'attention-brief-normal': shellSceneSize,
  'direction-koja': shellSceneSize,
  'direction-koja-normal': shellSceneSize,
  'footer-insert': shellSceneSize,
  'footer-normal': shellSceneSize,
  'footer-pending': shellSceneSize,
  'footer-split': shellSceneSize,
  'footer-split-normal': shellSceneSize,
  'footer-lone': shellSceneSize,
  'header-mode-insert': shellSceneSize,
  'header-mode-normal': shellSceneSize,
  'header-mode-pending': shellSceneSize,
  'header-mode-split': shellSceneSize,
  'header-mode-split-normal': shellSceneSize,
  'header-mode-lone': shellSceneSize,
  'sidebar-inbox': shellSceneSize,
  'sidebar-hover': shellSceneSize,
  'sidebar-find': shellSceneSize,
  'sidebar-states': shellSceneSize,
  'shell-attention': shellSceneSize,
  'shell-attention-normal': shellSceneSize,
  'shell-attention-open': shellSceneSize,
  'shell-dialog': shellSceneSize,
  'shell-content': shellSceneSize,
  'shell-pr-view': shellSceneSize,
  'shell-draft-review': shellSceneSize,
  'shell-ticket': shellSceneSize,
  'dialog-close': shellSceneSize,
  'dialog-close-normal': shellSceneSize,
  'dialog-rename': shellSceneSize,
  'dialog-rename-normal': shellSceneSize,
  'dialog-wt-new': shellSceneSize,
  'dialog-wt-open': shellSceneSize,
  'dialog-wt-remove': shellSceneSize,
  'overlay-palette': shellSceneSize,
  'overlay-goto': shellSceneSize,
  'overlay-keys': shellSceneSize,
  'overlay-menu': shellSceneSize,
  'overlay-new': shellSceneSize,
  'overlay-menu-normal': shellSceneSize,
  'overlay-new-normal': shellSceneSize,
  'panels-tabs-stack': shellSceneSize,
  'panels-tabs-changes': shellSceneSize,
  'panels-tabs-workers': shellSceneSize,
  'panels-tabs-files': shellSceneSize,
  'panels-sections': shellSceneSize,
  'panels-spine': shellSceneSize,
  'panels-spine-files': shellSceneSize,
  'panels-docks': shellSceneSize,
  'spine-inline': shellSceneSize,
  'spine-rail': shellSceneSize,
  'spine-pinned': shellSceneSize,
  'rail-busy': shellSceneSize,
  'rail-clean': shellSceneSize,
  'rail-single': shellSceneSize,
  'rail-no-pr': shellSceneSize,
  'rail-main': shellSceneSize,
  'rail-error': shellSceneSize,
  'rail-normal': shellSceneSize,
  'split-two-base': shellSceneSize,
  'split-two-busy': shellSceneSize,
  'split-two-main': shellSceneSize,
  'split-three-base': shellSceneSize,
  'split-three-busy': shellSceneSize,
  'split-three-main': shellSceneSize,
  'space-base': shellSceneSize,
  'space-busy': shellSceneSize,
  'space-clean': shellSceneSize,
  'space-single': shellSceneSize,
  'space-no-pr': shellSceneSize,
  'space-main': shellSceneSize,
  'space-error': shellSceneSize,
  'space-normal': shellSceneSize,
  'draft-review-comment': shellSceneSize,
  'draft-review-range': shellSceneSize,
  'draft-review-file-comment': shellSceneSize,
  'draft-review-edit-line': shellSceneSize,
  'draft-review-edit-file': shellSceneSize,
  'draft-review-saving-failed': shellSceneSize,
  'draft-review-changed-on-disk': shellSceneSize,
  'draft-review-sent': shellSceneSize,
  'draft-review-broken': shellSceneSize,
  'draft-review-plan': shellSceneSize,
  'draft-review-normal': shellSceneSize,
  'ticket-view-container': shellSceneSize,
  'ticket-view-single': shellSceneSize,
  'ticket-view-loading': shellSceneSize,
  'ticket-view-unreachable': shellSceneSize,
  'ticket-view-sync-failed': shellSceneSize,
  'ticket-view-nothing-ready': shellSceneSize,
  'ticket-view-done': shellSceneSize,
  'ticket-view-plain': shellSceneSize,
  'ticket-view-tikk': shellSceneSize,
  'ticket-view-long': shellSceneSize,
  'ticket-view-normal': shellSceneSize,
  'ticket-view-wide': shellSceneSize,
  'content-rail-review': shellSceneSize,
  'content-rail-pr': shellSceneSize,
  'content-rail-ticket': shellSceneSize,
  'content-rail-review-saving-failed': shellSceneSize,
  'content-rail-review-sent': shellSceneSize,
  'content-rail-review-narrow': shellSceneSize,
  'content-rail-pr-checks-failed': shellSceneSize,
  'content-rail-pr-unreachable': shellSceneSize,
  'content-rail-ticket-loading': shellSceneSize,
  'content-rail-ticket-long': shellSceneSize,
  'content-rail-pr-normal': shellSceneSize,
  'pr-tray-bar': shellSceneSize,
  'pr-tray-header': shellSceneSize,
  'pr-tray-section': shellSceneSize,
  'pr-view-blocked': shellSceneSize,
  'pr-view-sent': shellSceneSize,
  'pr-view-ready': shellSceneSize,
  'pr-view-ready-menu': shellSceneSize,
  'pr-view-merge-confirm': shellSceneSize,
  'pr-view-merge-failed': shellSceneSize,
  'pr-view-checks-failed': shellSceneSize,
  'pr-view-unreachable': shellSceneSize,
  'pr-view-normal': shellSceneSize,
  'pr-view-zoomed': shellSceneSize,
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
