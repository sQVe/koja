interface EmptyLine {
  kind: 'empty' | 'loading' | 'error';
  text: string;
}

export const emptyLine = (
  error: string | null,
  loading: boolean,
  root: string | null,
): EmptyLine => {
  if (error !== null) {
    return { kind: 'error', text: error };
  }

  if (loading) {
    return { kind: 'loading', text: 'Loading changes…' };
  }

  return { kind: 'empty', text: root !== null ? 'No uncommitted changes' : 'No folder' };
};
