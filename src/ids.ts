export type PaneId = `pane-${number}` & { readonly brand: 'PaneId' };
export type WorkspaceId = `workspace-${number}` & { readonly brand: 'WorkspaceId' };
export type TabId = `tab-${number}` & { readonly brand: 'TabId' };
export type ClientId = `client-${number}` & { readonly brand: 'ClientId' };

// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the brand exists only in the type.
export const paneId = (number: number): PaneId => `pane-${number}` as PaneId;

// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the brand exists only in the type.
export const clientId = (number: number): ClientId => `client-${number}` as ClientId;

// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the brand exists only in the type.
export const workspaceId = (number: number): WorkspaceId => `workspace-${number}` as WorkspaceId;

// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the brand exists only in the type.
export const tabId = (number: number): TabId => `tab-${number}` as TabId;
