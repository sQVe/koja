import type { Status } from 'herdr';

/** The status of a tab or a pane, plus a crash, which Herdr's four statuses cannot say. */
export type AttentionStatus = Status | 'crashed';
