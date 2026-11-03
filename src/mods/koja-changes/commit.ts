export interface CommitRequest {
  message: string;
  busy: boolean;
  loading: boolean;
  contextCurrent: boolean;
}

export const hasText = (text: string): boolean => text.trim() !== '';

const isIdle = (request: CommitRequest): boolean => !request.busy && !request.loading;

export const canCommit = (request: CommitRequest): boolean =>
  hasText(request.message) && isIdle(request) && request.contextCurrent;
