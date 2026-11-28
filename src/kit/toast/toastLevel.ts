export const toastLevels = ['info', 'success', 'warning', 'error'] as const;

export type ToastLevel = (typeof toastLevels)[number];
