const isInsideHome = (cwd: string, homeFolder: string): boolean => cwd.startsWith(`${homeFolder}/`);

export const folderLabel = (cwd: string | null, homeFolder: string): string => {
  if (cwd === null || cwd === '') {
    return '';
  }

  if (cwd === homeFolder) {
    return '~';
  }

  return isInsideHome(cwd, homeFolder) ? `~${cwd.slice(homeFolder.length)}` : cwd;
};
