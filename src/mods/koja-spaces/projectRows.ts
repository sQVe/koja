import type { Context, Element } from 'gpui-kit';

import type { DropMark } from '../../kit/index.ts';
import { projectHeader, stateLine, toggleButton } from '../../kit/index.ts';
import { groupedList } from './groupedList.ts';
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

const pullErrorRow = (git: GitInfo, host: ProjectRowsHost): Element => {
  const retry = toggleButton({ label: 'Retry', active: false }).on_click((_event, cx) => {
    cx.stop_propagation();
    host.retryPull(git, cx);
  });

  return stateLine({ kind: 'error', text: pullErrorText, action: retry });
};

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
  const blocks = host.projects.map((project) => projectBlock(project, host));

  return groupedList(blocks, host.loading);
};
