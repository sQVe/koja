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

  private readonly pullsTried: Record<string, number> = {};

  private readonly fetching = new Set<string>();

  lookup(git: GitInfo | null): Pull | null {
    return pullOf(git, this.pulls);
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

  private fetch(repo: RepoRef, cwd: string, cx: Context): void {
    this.fetching.add(repo.key);

    cx.spawn(async (taskCx) => {
      try {
        const args = ['pr', 'list', '--state', 'all', '--limit', '100', '--json', pullFields];
        const result = await exec('gh', args, { cwd, on: repo.machine });

        if (result.code === 0) {
          this.pulls[repo.key] = {
            fetchedAt: Date.now(),
            list: readPullList(JSON.parse(result.stdout)),
          };

          localStorage.setItem(pullsKey, JSON.stringify(this.pulls));
          taskCx.notify();
        }
      } catch {
        // The machine is away: keep what the rows showed.
      } finally {
        this.fetching.delete(repo.key);
      }
    });
  }
}
