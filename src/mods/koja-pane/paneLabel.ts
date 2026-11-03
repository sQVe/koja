import type { PaneInfo, Program } from 'herdr';

export const paneProgram = (pane: PaneInfo): Program | null =>
  pane.terminal === null ? null : pane.program;

const isNamedProgram = (program: Program): boolean => program.agent || program.shell;

const programName = (program: Program | null): string => {
  if (program === null) {
    return '';
  }

  return isNamedProgram(program) ? program.name : '';
};

const fallbackName = (pane: PaneInfo, program: Program | null): string => {
  if (pane.title !== '') {
    return pane.title;
  }

  const name = program?.name ?? '';

  return name === '' ? 'shell' : name;
};

export const paneName = (pane: PaneInfo): string => {
  const program = paneProgram(pane);

  return programName(program) || fallbackName(pane, program);
};
