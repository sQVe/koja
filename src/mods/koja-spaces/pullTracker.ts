import type { Context } from 'gpui-kit';
import { exec } from 'herdr';

import type { Pull, PullCache } from './pulls.ts';
import { pullFields, pullOf, readPullCaches, readPullList } from './pulls.ts';
import type { GitInfo, RepoRef } from './tree.ts';

const pullsKey = 'pulls';

const pullsMaxAge = 180_000;

export class PullTracker {
  private pulls: Record<string, PullCache> = readPullCaches(
    JSON.parse(localStorage.getItem(pullsKey) ?? '{}'),
  );

  private readonly failedRepos = new Set<string>();

  private readonly pullsTried: Record<string, number> = {};

  private readonly fetching = new Set<string>();

  lookup(git: GitInfo | null): Pull | null {
    return pullOf(git, this.pulls);
  }

  failed(git: GitInfo): boolean {
    return this.failedRepos.has(git.repo.key);
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
      const remotes = await exec('git', ['remote'], { cwd, on: repo.machine });

      if (remotes.code !== 0) {
        return null;
      }

      if (remotes.stdout.trim() === '') {
        return [];
      }

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
          this.failedRepos.add(repo.key);
        } else {
          this.pulls[repo.key] = { fetchedAt: Date.now(), list };
          this.failedRepos.delete(repo.key);
          localStorage.setItem(pullsKey, JSON.stringify(this.pulls));
        }
      } finally {
        this.fetching.delete(repo.key);
        taskCx.notify();
      }
    });
  }
}
