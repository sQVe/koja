export type SidebarView = 'projects' | 'inbox';

export const sidebarViewKey = 'sidebar.view';

export const readSidebarView = (stored: string | null): SidebarView =>
  stored === 'inbox' ? 'inbox' : 'projects';

export const storedViewIsInbox = (stored: string | null): boolean =>
  readSidebarView(stored) === 'inbox';
