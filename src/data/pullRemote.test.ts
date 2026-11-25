import { describe, expect, test } from 'bun:test';

import { markedRemoteOf, remoteNameOf, remoteNamesOf, remoteOfUrl } from './pullRemote.ts';

describe('remoteNamesOf', () => {
  test('trims names and drops blank lines', () => {
    expect(remoteNamesOf('upstream\n\n  origin  \n')).toEqual(['upstream', 'origin']);
  });

  test('reads no names from blank output', () => {
    expect(remoteNamesOf('\n \n')).toEqual([]);
  });
});

describe('remoteNameOf', () => {
  test('takes the remote marked by gh-resolved', () => {
    expect(remoteNameOf(['origin', 'upstream'], 'upstream')).toBe('upstream');
  });

  test('prefers origin over another remote when none is marked', () => {
    expect(remoteNameOf(['upstream', 'origin'], null)).toBe('origin');
  });

  test('takes the first remote when there is no origin and none is marked', () => {
    expect(remoteNameOf(['upstream', 'deploy'], null)).toBe('upstream');
  });

  test('ignores a marked remote that is not listed', () => {
    expect(remoteNameOf(['origin'], 'upstream')).toBe('origin');
  });

  test('reads no remote from an empty list', () => {
    expect(remoteNameOf([], null)).toBeNull();
  });
});

describe('markedRemoteOf', () => {
  test('reads the remote name from a gh-resolved key', () => {
    expect(markedRemoteOf('remote.upstream.gh-resolved base\n')).toBe('upstream');
  });

  test('reads no marked remote from empty output', () => {
    expect(markedRemoteOf('')).toBeNull();
  });
});

describe('remoteOfUrl', () => {
  test('reads an ssh shorthand', () => {
    expect(remoteOfUrl('git@github.example.com:koja/koja.git')).toEqual({
      host: 'github.example.com',
      owner: 'koja',
      repository: 'koja',
    });
  });

  test('reads an ssh URI with a port', () => {
    expect(remoteOfUrl('ssh://git@github.example.com:22/koja/koja.git')).toEqual({
      host: 'github.example.com',
      owner: 'koja',
      repository: 'koja',
    });
  });

  test('ignores user info in an https remote', () => {
    expect(remoteOfUrl('https://user@github.example.com/koja/koja.git')).toEqual({
      host: 'github.example.com',
      owner: 'koja',
      repository: 'koja',
    });
  });

  test('maps the ssh port 443 endpoint to github.com', () => {
    expect(remoteOfUrl('ssh://git@ssh.github.com:443/koja/koja.git')).toEqual({
      host: 'github.com',
      owner: 'koja',
      repository: 'koja',
    });
  });

  test('keeps a host that only looks like the ssh port 443 endpoint', () => {
    expect(remoteOfUrl('ssh://git@ssh.github.example.com:443/koja/koja.git')).toEqual({
      host: 'ssh.github.example.com',
      owner: 'koja',
      repository: 'koja',
    });
  });

  test('decodes percent-encoded owner and repository names', () => {
    expect(remoteOfUrl('https://github.example.com/koja%2Dteam/koja%2Dapp.git')).toEqual({
      host: 'github.example.com',
      owner: 'koja-team',
      repository: 'koja-app',
    });
  });

  test('keeps a numeric owner as text', () => {
    expect(remoteOfUrl('https://github.example.com/1234/koja.git')).toEqual({
      host: 'github.example.com',
      owner: '1234',
      repository: 'koja',
    });
  });

  test('returns null when a path component cannot be decoded', () => {
    expect(remoteOfUrl('git@github.example.com:koja%ZZ/koja.git')).toBeNull();
  });

  test('returns null for a local path', () => {
    expect(remoteOfUrl('/srv/git/koja.git')).toBeNull();
  });

  test('returns null for a path without an owner and repository', () => {
    expect(remoteOfUrl('https://github.example.com/koja.git')).toBeNull();
  });

  test('returns null for a value that is not a remote URL', () => {
    expect(remoteOfUrl('not a remote')).toBeNull();
  });
});
