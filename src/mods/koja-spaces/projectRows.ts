import type { Context, Element } from 'gpui-kit';
import { div } from 'gpui-kit';

import { projectHeader, sidebarSize, spacing, stateLine, toggleButton } from '../../kit/index.ts';
import type { Project } from './projects.ts';
import type { GitInfo, ListedSpace } from './tree.ts';

export interface ProjectRowsHost {
  projects: Project[];
  loading: boolean;
  draw: (row: ListedSpace) => Element;
  pullFailed: (git: GitInfo) => boolean;
  retryPull: (git: GitInfo, cx: Context) => void;
  toggleFold: (key: string, cx: Context) => void;
}

const pullErrorText = 'Could not read PRs';

// The list puts the row gap on both sides of this spacer, so the projects sit a group gap apart.
const projectGap = (): Element =>
  div()
    .flex_none()
    .h(sidebarSize.groupGap - 2 * spacing.xxsmall);

const loadingRow = (): Element => stateLine({ kind: 'loading', text: 'Loading…' });

const pullErrorRow = (git: GitInfo, host: ProjectRowsHost): Element =>
  stateLine({
    kind: 'error',
    text: pullErrorText,
    action: toggleButton({ label: 'Retry', active: false }).on_click((_event, cx) => {
      cx.stop_propagation();
      host.retryPull(git, cx);
    }),
  });

const header = (project: Project, host: ProjectRowsHost): Element =>
  projectHeader({
    name: project.name,
    ...(project.machine === null ? {} : { machine: project.machine }),
    folded: project.folded,
    hidden: project.hidden,
    onToggle: (cx) => {
      host.toggleFold(project.key, cx);
    },
  });

const projectBlock = (project: Project, host: ProjectRowsHost): Element[] => {
  const elements = [header(project, host)];
  const { git } = project;

  if (git !== null && host.pullFailed(git)) {
    elements.push(pullErrorRow(git, host));
  }

  return [...elements, ...project.spaces.map((row) => host.draw(row))];
};

// Every row is a direct child of the list, because the cursor scrolls to a child by its index.
export const projectRows = (host: ProjectRowsHost): Element[] => {
  if (host.projects.length === 0) {
    return host.loading ? [loadingRow()] : [];
  }

  return host.projects.flatMap((project, index) => {
    const block = projectBlock(project, host);

    return index === 0 ? block : [projectGap(), ...block];
  });
};
