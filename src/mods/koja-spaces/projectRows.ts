import type { Context, Element } from 'gpui-kit';
import { div } from 'gpui-kit';

import type { DropMark } from '../../kit/index.ts';
import { projectHeader, sidebarSize, spacing, stateLine, toggleButton } from '../../kit/index.ts';
import type { Project } from './projects.ts';
import type { GitInfo, ListedSpace } from './tree.ts';

export interface ProjectRowsHost {
  projects: Project[];
  loading: boolean;
  draw: (row: ListedSpace) => Element;
  drawMain: (project: Project, main: ListedSpace) => Element;
  foldDrag: (project: Project) => { dragged: boolean; drop?: DropMark };
  attachFoldDrag: (element: Element, project: Project) => void;
  pullFailed: (git: GitInfo) => boolean;
  retryPull: (git: GitInfo, cx: Context) => void;
  toggleFold: (key: string, cx: Context) => void;
  hovered: string | null;
  onHover: (id: string, hovered: boolean, cx: Context) => void;
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

const foldHeader = (project: Project, host: ProjectRowsHost): Element => {
  const id = `project-${project.key}`;

  const element = projectHeader({
    kind: 'fold',
    ...host.foldDrag(project),
    name: project.name,
    ...(project.machine === null ? {} : { machine: project.machine }),
    folded: project.folded,
    hidden: project.hidden,
    hovered: host.hovered === id,
    onToggle: (cx) => {
      host.toggleFold(project.key, cx);
    },
  })
    .id(id)
    .on_hover((hovered, cx) => {
      host.onHover(id, hovered, cx);
    });

  host.attachFoldDrag(element, project);

  return element;
};

const header = (project: Project, host: ProjectRowsHost): Element =>
  project.main === null ? foldHeader(project, host) : host.drawMain(project, project.main);

const projectBlock = (project: Project, host: ProjectRowsHost): Element[] => {
  const elements = [header(project, host)];
  const { git } = project;

  if (git !== null && host.pullFailed(git)) {
    elements.push(pullErrorRow(git, host));
  }

  return [...elements, ...project.spaces.map((row) => host.draw(row))];
};

export const projectRows = (host: ProjectRowsHost): Element[] => {
  if (host.projects.length === 0) {
    return host.loading ? [loadingRow()] : [];
  }

  return host.projects.flatMap((project, index) => {
    const block = projectBlock(project, host);

    return index === 0 ? block : [projectGap(), ...block];
  });
};
