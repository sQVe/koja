export interface CommitRequest {
  message: string;
  busy: boolean;
  loading: boolean;
  contextCurrent: boolean;
  stale: boolean;
}

export const hasText = (text: string): boolean => text.trim() !== '';

const isIdle = (request: CommitRequest): boolean => !request.busy && !request.loading;

const isReady = (request: CommitRequest): boolean =>
  isIdle(request) && request.contextCurrent && !request.stale;

export const canCommit = (request: CommitRequest): boolean =>
  hasText(request.message) && isReady(request);
