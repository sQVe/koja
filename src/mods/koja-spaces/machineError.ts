export interface MachineErrorPlacement {
  kind: 'line' | 'mark';
  text: string;
}

export const machineErrorPlacement = (
  error: string | null,
  collapsed: boolean,
): MachineErrorPlacement | null => {
  if (error === null) {
    return null;
  }

  return { kind: collapsed ? 'mark' : 'line', text: error };
};
