import { folderNameOf, withoutTrailingSlashes } from './fields.ts';

// A repository's git folder is a `.git` or `.bare` directory inside its checkout, or a folder of
// its own when the checkout keeps its git directory elsewhere.
const checkoutOf = (path: string): string => {
  const trimmed = withoutTrailingSlashes(path);
  const parts = trimmed.split('/');
  const last = parts.at(-1);
  const isGitFolder = last === '.git' || last === '.bare';

  return isGitFolder ? parts.slice(0, -1).join('/') : trimmed;
};

// The git folder can sit anywhere under any name, so the checkout folder names the repository.
export const repoName = (path: string): string => {
  const folder = folderNameOf(checkoutOf(path)) || path;

  return folder.replace(/\.git$/u, '');
};

// A repository is named after its own checkout, because a linked worktree is named after its
// worktree folder. Without one, the git folder's path is the best the facts hold.
export const repositoryNameOf = (mainRoot: string | null, commonDirectory: string): string =>
  repoName(mainRoot ?? commonDirectory);
