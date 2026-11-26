export const lastPart = (path: string): string | null =>
  path.split('/').findLast((part) => part !== '') ?? null;

const trimSlashes = (path: string): string => path.replace(/\/+$/u, '');

// A repository's git folder is a `.git` or `.bare` directory inside its checkout, or a folder of
// its own when the checkout keeps its git directory elsewhere.
const checkoutOf = (path: string): string => {
  const trimmed = trimSlashes(path);
  const parts = trimmed.split('/');
  const last = parts.at(-1);
  const isGitFolder = last === '.git' || last === '.bare';

  return isGitFolder ? parts.slice(0, -1).join('/') : trimmed;
};

// The git folder can sit anywhere under any name, so the checkout folder names the repository.
export const repoName = (root: string): string => {
  const folder = lastPart(checkoutOf(root)) ?? root;

  return folder.replace(/\.git$/u, '');
};

export const repoPathName = (path: string): string => repoName(checkoutOf(path));

// A repository is named after its own checkout, because a linked worktree is named after its
// worktree folder. Without one, the git folder's path is the best the facts hold.
export const repositoryNameOf = (mainRoot: string | null, commonDirectory: string): string =>
  mainRoot === null ? repoPathName(commonDirectory) : repoName(mainRoot);
