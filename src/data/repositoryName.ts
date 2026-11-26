const lastPart = (path: string): string | null =>
  path.split('/').findLast((part) => part !== '') ?? null;

// The git folder can sit anywhere under any name, so the checkout folder names the repository.
export const repoName = (root: string): string => {
  const folder = lastPart(root) ?? root;

  return folder.replace(/\.git$/u, '');
};

// A repository's git folder is a `.git` or `.bare` directory inside its checkout, or a folder of
// its own when the checkout keeps its git directory elsewhere.
export const repoPathName = (path: string): string => {
  const parts = path.split('/');
  const last = parts.at(-1);
  const isGitFolder = last === '.git' || last === '.bare';
  const checkout = isGitFolder ? parts.slice(0, -1).join('/') : path;

  return repoName(checkout);
};
