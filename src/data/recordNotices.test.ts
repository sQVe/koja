import { describe, expect, test } from 'bun:test';

import { createRecordNotices } from './recordNotices.ts';

describe('createRecordNotices', () => {
  test('logs one line per record and rejection per copy', () => {
    const messages: string[] = [];

    const notices = createRecordNotices((message) => {
      messages.push(message);
    });

    notices.report('snapshot', 'malformed');
    notices.report('snapshot', 'malformed');
    notices.report('snapshot', 'newer');
    notices.report('pullReadTimes', 'malformed');
    notices.report('pullReadTimes', 'malformed');
    notices.report('pullReadTimes', 'newer');

    expect(messages).toHaveLength(4);
  });
});
