import type { Context } from 'gpui-kit';
import { exec } from 'herdr';

import type { Pull, PullCache } from './pulls.ts';
import { pullFields, pullOf, readPullCaches, readPullList } from './pulls.ts';
import type { ReadState } from './readState.ts';
import { readErrorLine, readFailed, readSucceeded } from './readState.ts';
import type { GitInfo, RepoRef } from './tree.ts';
import { repoName } from './tree.ts';

const pullsKey = 'pulls';

const pullsMaxAge = 180_000;

export class PullTracker {
  private pulls: Record<string, PullCache> = readPullCaches(
    JSON.parse(localStorage.getItem(pullsKey) ?? '{}'),
  );

  private readonly readStates: Record<string, ReadState> = Object.fromEntries(
    Object.entries(this.pulls).map(([key, cache]) => [key, readSucceeded(cache.fetchedAt)]),
  );

  private readonly pullsTried: Record<string, number> = {};

  private readonly fetching = new Set<string>();

  lookup(git: GitInfo | null): Pull | null {
    return pullOf(git, this.pulls);
  }

  errorLine(git: GitInfo | null): string | null {
    if (git === null) {
      return null;
    }

    return readErrorLine(this.readStates[git.repo.key], `${repoName(git.root)} PRs`, Date.now());
  }

  refresh(repositories: { repo: RepoRef; cwd: string }[], cx: Context): void {
    const now = Date.now();

    for (const { repo, cwd } of repositories) {
      const last = Math.max(this.pulls[repo.key]?.fetchedAt ?? 0, this.pullsTried[repo.key] ?? 0);

      if (this.fetching.has(repo.key) || now - last < pullsMaxAge) {
        continue;
      }

      this.pullsTried[repo.key] = now;
      this.fetch(repo, cwd, cx);
    }
  }

  retry(repo: RepoRef, cwd: string, cx: Context): void {
    if (this.fetching.has(repo.key)) {
      return;
    }

    this.pullsTried[repo.key] = Date.now();
    this.fetch(repo, cwd, cx);
  }

  private async read(repo: RepoRef, cwd: string): Promise<Pull[] | null> {
    try {
      const args = ['pr', 'list', '--state', 'all', '--limit', '100', '--json', pullFields];
      const result = await exec('gh', args, { cwd, on: repo.machine });

      if (result.code !== 0) {
        return null;
      }

      const value: unknown = JSON.parse(result.stdout);

      if (!Array.isArray(value)) {
        return null;
      }

      return readPullList(value);
    } catch {
      return null;
    }
  }

  private fetch(repo: RepoRef, cwd: string, cx: Context): void {
    this.fetching.add(repo.key);

    cx.spawn(async (taskCx) => {
      try {
        const list = await this.read(repo, cwd);

        if (list === null) {
          this.readStates[repo.key] = readFailed(this.readStates[repo.key]);
        } else {
          const at = Date.now();

          this.pulls[repo.key] = { fetchedAt: at, list };
          this.readStates[repo.key] = readSucceeded(at);
          localStorage.setItem(pullsKey, JSON.stringify(this.pulls));
        }
      } finally {
        this.fetching.delete(repo.key);
        taskCx.notify();
      }
    });
  }
}
