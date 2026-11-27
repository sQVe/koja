export type SidebarView = 'projects' | 'inbox';

export const sidebarViewKey = 'sidebar.view';

export const readSidebarView = (stored: string | null): SidebarView =>
  stored === 'inbox' ? 'inbox' : 'projects';
