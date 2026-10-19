import { expect, it } from 'bun:test';

import { createInputTokenizer } from './inputTokens.ts';
import type { InputToken } from './inputTokens.ts';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const byteOfA = 0x61;

const describeToken = (token: InputToken): string => {
  if (token.kind === 'key') {
    return `key:${token.raw}${token.escapeSent ? ':sent' : ''}`;
  }

  if (token.kind === 'mouse') {
    return `mouse:${token.raw}${token.escapeSent ? ':sent' : ''}`;
  }

  const text = decoder.decode(token.bytes);

  return token.kind === 'paste'
    ? `paste:${text}${token.escapeSent ? ':sent' : ''}`
    : `response:${text}`;
};

const setup = () => {
  const tokenizer = createInputTokenizer();
  let now = 0;

  const read = (input: string | number[], at = now): string[] => {
    now = at;
    const bytes = typeof input === 'string' ? encoder.encode(input) : Uint8Array.from(input);

    return tokenizer.push(bytes, now).map(describeToken);
  };

  const expire = (at: number): string[] => {
    now = at;

    return tokenizer.expire(now).map(describeToken);
  };

  return { read, expire, holding: () => tokenizer.holding() };
};

it('emits a lone Escape at once', () => {
  const { read } = setup();

  expect(read('\x1b')).toEqual(['key:\x1b']);
});

it('emits a cursor key tail after a lone Escape inside the window as a continuation', () => {
  const { read } = setup();

  read('\x1b', 0);

  expect(read('[Ax', 19)).toEqual(['key:\x1b[A:sent', 'key:x']);
});

it('keeps a cursor key tail a continuation when a terminal reply arrives before it', () => {
  const { read } = setup();

  read('\x1b', 0);

  expect(read('\x1b]4;1;rgb:cdcd/0000/0000\x07', 5)).toEqual([
    'response:\x1b]4;1;rgb:cdcd/0000/0000\x07',
  ]);

  expect(read('[A', 10)).toEqual(['key:\x1b[A:sent']);
});

it('reads a cursor key tail after a lone Escape outside the window as plain keys', () => {
  const { read } = setup();

  read('\x1b', 0);

  expect(read('[A', 20)).toEqual(['key:[', 'key:A']);
});

it('completes an arrow delivered in three reads as a continuation of the sent Escape', () => {
  const { read } = setup();

  expect(read('\x1b', 0)).toEqual(['key:\x1b']);
  expect(read('[', 1)).toEqual([]);
  expect(read('A', 2)).toEqual(['key:\x1b[A:sent']);
});

it('completes an arrow whose Escape bracket arrive together', () => {
  const { read } = setup();

  expect(read('\x1b[')).toEqual([]);
  expect(read('A')).toEqual(['key:\x1b[A']);
});

it('keeps a paste whose start Escape arrives alone', () => {
  const { read } = setup();

  read('\x1b', 0);

  expect(read('[200~hi\x1b[201~z', 1)).toEqual(['paste:hi:sent', 'key:z']);
});

it('keeps a paste across three reads and an end marker split in two', () => {
  const { read } = setup();

  expect(read('\x1b[200~one')).toEqual([]);
  expect(read('two\x1b')).toEqual([]);
  expect(read('[201')).toEqual([]);
  expect(read('~')).toEqual(['paste:onetwo']);
});

it('keeps Escape and multibyte characters inside a paste', () => {
  const { read } = setup();

  expect(read('\x1b[200~a\x1bé\x1b[Ab\x1b[201~')).toEqual(['paste:a\x1bé\x1b[Ab']);
});

it('keeps Alt plus a multibyte character after a plain key', () => {
  const { read } = setup();

  expect(read('x\x1béz')).toEqual(['key:x', 'key:\x1bé', 'key:z']);
});

it('keeps two Alt keys in one read', () => {
  const { read } = setup();

  expect(read('\x1bé\x1bü')).toEqual(['key:\x1bé', 'key:\x1bü']);
});

it('waits for the rest of a multibyte character', () => {
  const { read } = setup();

  expect(read([0x1b, 0xc3])).toEqual([]);
  expect(read([0xa9])).toEqual(['key:\x1bé']);
  expect(read([0xe2, 0x82])).toEqual([]);
  expect(read([0xac])).toEqual(['key:€']);
});

it('emits Escape plus an ASCII byte as one Alt key', () => {
  const { read } = setup();

  expect(read('\x1bx')).toEqual(['key:\x1bx']);
});

it('emits Escape then a plain key inside the window without joining them', () => {
  const { read } = setup();

  read('\x1b', 0);

  expect(read('x', 1)).toEqual(['key:x']);
});

it('emits modified keys, function keys and Shift+Tab as keys', () => {
  const { read } = setup();

  expect(read('\x1b[1;5A\x1b[3~\x1b[Z\x1bOP\x1b[1;2P')).toEqual([
    'key:\x1b[1;5A',
    'key:\x1b[3~',
    'key:\x1b[Z',
    'key:\x1bOP',
    'key:\x1b[1;2P',
  ]);
});

it('passes terminal replies through as responses', () => {
  const { read } = setup();

  expect(read('\x1b[?62;4c\x1b]11;rgb:0000/0000/0000\x07\x1b[?2004;2$y\x1b[?1u')).toEqual([
    'response:\x1b[?62;4c',
    'response:\x1b]11;rgb:0000/0000/0000\x07',
    'response:\x1b[?2004;2$y',
    'response:\x1b[?1u',
  ]);
});

it('passes a string reply that ends with Escape backslash and waits for a split one', () => {
  const { read } = setup();

  expect(read('\x1bP>|term\x1b')).toEqual([]);
  expect(read('\\a')).toEqual(['response:\x1bP>|term\x1b\\', 'key:a']);
});

it('treats a cursor position report as a response, even when its row is 1', () => {
  const { read } = setup();

  expect(read('\x1b[1;5R\x1b[12;40R')).toEqual(['response:\x1b[1;5R', 'response:\x1b[12;40R']);
});

it('splits Ctrl+B from the keys around it', () => {
  const { read } = setup();

  expect(read('a\x02b')).toEqual(['key:a', 'key:\x02', 'key:b']);
});

it('drops a stray continuation byte', () => {
  const { read } = setup();

  expect(read([0x80, 0x61])).toEqual(['key:a']);
});

it('emits Alt plus a string introducer key that OpenTUI never answers as a key', () => {
  const { read, holding } = setup();

  expect(read('\x1bX')).toEqual(['key:\x1bX']);
  expect(read('\x1b^')).toEqual(['key:\x1b^']);

  expect(read('\x1bXabc\x07z')).toEqual([
    'key:\x1bX',
    'key:a',
    'key:b',
    'key:c',
    'key:\x07',
    'key:z',
  ]);

  expect(holding()).toBe(false);
});

it('holds an introducer that may start a reply only for the hold window, then emits keys', () => {
  const { read, expire, holding } = setup();

  expect(read('\x1b]1', 0)).toEqual([]);
  expect(holding()).toBe(true);
  expect(expire(49)).toEqual([]);
  expect(expire(50)).toEqual(['key:\x1b]', 'key:1']);
  expect(holding()).toBe(false);
});

it('releases a held introducer when the next read arrives after the window', () => {
  const { read } = setup();

  read('\x1bP', 0);

  expect(read('z', 60)).toEqual(['key:\x1bP', 'key:z']);
});

it('releases a held partial sequence and ends a held partial character after the window', () => {
  const { read, expire } = setup();

  expect(read('\x1b[1;', 0)).toEqual([]);
  expect(expire(50)).toEqual(['key:\x1b[', 'key:1', 'key:;']);
  expect(read([0xc3], 100)).toEqual([]);
  expect(expire(150)).toEqual([]);
  expect(read('a', 151)).toEqual(['key:a']);
});

it('sends a split OSC reply whole to OpenTUI after a lone Escape', () => {
  const { read } = setup();

  read('\x1b', 0);

  expect(read(']11;rgb:0000/0000/0000\x07', 1)).toEqual([
    'response:\x1b]11;rgb:0000/0000/0000\x07',
  ]);
});

it('sends split DCS and APC replies whole to OpenTUI after a lone Escape', () => {
  const { read } = setup();

  read('\x1b', 0);

  expect(read('P>|term\x1b\\', 1)).toEqual(['response:\x1bP>|term\x1b\\']);

  read('\x1b', 2);

  expect(read('_Gi=1;OK\x1b\\', 3)).toEqual(['response:\x1b_Gi=1;OK\x1b\\']);
});

it('emits a held Escape introducer after a lone Escape as a continuation key', () => {
  const { read, expire } = setup();

  read('\x1b', 0);
  read(']1', 1);

  expect(expire(60)).toEqual(['key:\x1b]:sent', 'key:1']);
});

it('reads Linux console function keys as keys, also when split', () => {
  const { read } = setup();

  expect(read('\x1b[[A\x1b[[E')).toEqual(['key:\x1b[[A', 'key:\x1b[[E']);
  expect(read('\x1b[[')).toEqual([]);
  expect(read('C')).toEqual(['key:\x1b[[C']);
});

it('keeps a byte order mark character as a key', () => {
  const { read } = setup();

  expect(read('\ufeff')).toEqual(['key:\ufeff']);
  expect(read([0xef, 0xbb])).toEqual([]);
  expect(read([0xbf])).toEqual(['key:\ufeff']);
  expect(read('\x1b\ufeff')).toEqual(['key:\x1b\ufeff']);
});

it('reads unknown complete sequences as keys, complete and split', () => {
  const { read } = setup();

  expect(read('\x1b[a\x1b[d\x1b[2^\x1b[[5~\x1b[0n')).toEqual([
    'key:\x1b[a',
    'key:\x1b[d',
    'key:\x1b[2^',
    'key:\x1b[[5~',
    'key:\x1b[0n',
  ]);

  expect(read('\x1b[')).toEqual([]);
  expect(read('2')).toEqual([]);
  expect(read('^')).toEqual(['key:\x1b[2^']);
  expect(read('\x1b[[')).toEqual([]);
  expect(read('5~')).toEqual(['key:\x1b[[5~']);
});

it('passes every reply OpenTUI asks for as a response', () => {
  const { read } = setup();

  const replies = [
    '\x1b]10;rgb:ffff/ffff/ffff\x1b\\',
    '\x1b]99;i=opentui-notifications:p=?;a=focus\x1b\\',
    '\x1b]1337;Capabilities=Tc\x1b\\',
    '\x1bP1+r4d73=1b5d\x1b\\',
    '\x1bP0+r\x1b\\',
    '\x1bP>|kitty(0.30)\x1b\\',
    '\x1b_Gi=31337;OK\x1b\\',
    '\x1b[?1016;2$y',
    '\x1b[?0u',
    '\x1b[?62;c',
    '\x1b[4;600;800t',
    '\x1b[I',
    '\x1b[O',
    '\x1b[?997;1n',
    '\x1b[?997;2n',
    '\x1b]4;1;rgb:cdcd/0000/0000\x07',
    '\x1b]4;255;#eeeeee\x1b\\',
    '\x1b]12;rgb:ff/ff/ff\x07',
    '\x1b]19;#000000\x07',
  ];

  expect(read(replies.join(''))).toEqual(replies.map((reply) => `response:${reply}`));
});

it('passes a color scheme report split across reads as a response', () => {
  const { read } = setup();

  expect(read('\x1b[?99')).toEqual([]);
  expect(read('7;2nz')).toEqual(['response:\x1b[?997;2n', 'key:z']);
});

it('reads Escape bracket text that is not a reply as an Alt key and its rest', () => {
  const { read, holding } = setup();

  expect(read('\x1b]abc\x07z')).toEqual([
    'key:\x1b]',
    'key:a',
    'key:b',
    'key:c',
    'key:\x07',
    'key:z',
  ]);

  expect(holding()).toBe(false);
  expect(read('\x1b]')).toEqual([]);
  expect(read('a')).toEqual(['key:\x1b]', 'key:a']);
});

it('releases a reply body that is too long or stops matching, without waiting', () => {
  const { read, holding } = setup();
  const long = `\x1b]11;${'a'.repeat(600)}`;

  expect(read(long).slice(0, 2)).toEqual(['key:\x1b]', 'key:1']);
  expect(holding()).toBe(false);
  expect(read('\x1bP>|x')).toEqual([]);
  expect(read('\x1bz')).toEqual(['key:\x1bP', 'key:>', 'key:|', 'key:x', 'key:\x1bz']);
});

it('emits an unfinished paste after the paste window since its last byte', () => {
  const { read, expire, holding } = setup();

  expect(read('\x1b[200~one', 0)).toEqual([]);
  expect(holding()).toBe(true);
  expect(read('two', 900)).toEqual([]);
  expect(expire(1899)).toEqual([]);
  expect(expire(1900)).toEqual(['paste:onetwo']);
  expect(holding()).toBe(false);
  expect(read('x', 1901)).toEqual(['key:x']);
});

it('emits an unfinished paste when a read arrives after the window', () => {
  const { read } = setup();

  read('\x1b[200~hi', 0);

  expect(read('x', 2000)).toEqual(['paste:hi', 'key:x']);
});

it('releases a terminated string body that is not a complete reply', () => {
  const { read } = setup();

  expect(read('\x1b]\x07')).toEqual(['key:\x1b]', 'key:\x07']);
  expect(read('\x1b]1\x07')).toEqual(['key:\x1b]', 'key:1', 'key:\x07']);
  expect(read('\x1b]11;not-a-color\x07').slice(0, 2)).toEqual(['key:\x1b]', 'key:1']);
  expect(read('\x1b_Garbage\x1b\\').slice(0, 2)).toEqual(['key:\x1b_', 'key:G']);
});

it('releases an unfinished reply body once it is over the length limit', () => {
  const { read, holding } = setup();

  expect(read('\x1b]11;')).toEqual([]);
  expect(read('a'.repeat(510))).not.toEqual([]);
  expect(holding()).toBe(false);
});

// Mutation runs would repeat this 1 s test for every mutant, so they skip it.
const itUnlessMutating = process.env['KOJA_MUTATION'] === '1' ? it.skip : it;

itUnlessMutating(
  'keeps a large paste that arrives in many reads, in time linear in its size',
  () => {
    const tokenizer = createInputTokenizer();
    const chunk = new Uint8Array(4096).fill(byteOfA);
    const reads = (16 * 1024 * 1024) / chunk.length;
    const started = performance.now();

    tokenizer.push(encoder.encode('\x1b[200~'), 0);

    for (let read = 0; read < reads; read += 1) {
      tokenizer.push(chunk, 0);
    }

    const tokens = tokenizer.push(encoder.encode('\x1b[201~'), 0);
    const elapsedMs = performance.now() - started;
    const [token] = tokens;

    expect(tokens).toHaveLength(1);
    expect(token?.kind === 'paste' ? token.bytes.length : 0).toBe(reads * chunk.length);
    // Copying the open paste on every read takes several seconds for this size.
    expect(elapsedMs).toBeLessThan(3000);
  },
);

it('emits an SGR mouse report as one mouse token and a key after it as a key', () => {
  const { read } = setup();

  expect(read('\x1b[<0;5;3Mx')).toEqual(['mouse:\x1b[<0;5;3M', 'key:x']);
  expect(read('\x1b[<35;120;40m')).toEqual(['mouse:\x1b[<35;120;40m']);
});

it('joins an SGR mouse report cut across two reads', () => {
  const { read } = setup();

  expect(read('\x1b[<64;1')).toEqual([]);
  expect(read('2;7Mq')).toEqual(['mouse:\x1b[<64;12;7M', 'key:q']);
});

it('splits one SGR mouse report at every boundary into one mouse token', () => {
  const report = '\x1b[<0;12;7M';

  for (let cut = 1; cut < report.length; cut += 1) {
    const { read } = setup();
    const first = read(report.slice(0, cut), 0);
    const second = read(report.slice(cut), 1);
    const sent = cut === 1 ? ':sent' : '';

    expect(first.concat(second).filter((token) => token.startsWith('mouse:'))).toEqual([
      `mouse:${report}${sent}`,
    ]);

    expect(first.concat(second)).toEqual(
      cut === 1 ? ['key:\x1b', `mouse:${report}:sent`] : [`mouse:${report}`],
    );
  }
});

it('keeps a CSI < sequence that is not a mouse report a key', () => {
  const { read } = setup();

  expect(read('\x1b[<0;5;3Z')).toEqual(['key:\x1b[<0;5;3Z']);
  expect(read('\x1b[<0;5M')).toEqual(['key:\x1b[<0;5M']);
});

const rawKeys = (tokens: string[]): string[] => tokens.map((token) => token.slice('key:'.length));

it('sends a string reply with bytes around a valid body to the pane as keys', () => {
  const sequences = [
    '\x1b]4;4;1;#aabbcc\x07',
    '\x1b]4;1;#aabbccdd\x07',
    '\x1b]99;\x0199;x\x07',
    '\x1b]99;ab\x01\x07',
    '\x1b]1337;x1337;Capabilities=\x07',
    '\x1b]1337;Capabilities=a\x01\x07',
    '\x1bP1+r=zz0+r\x1b\\',
    '\x1bP1+rzz\x1b\\',
    '\x1bP>|\x01>|x\x1b\\',
    '\x1bP>|x\x01\x1b\\',
    '\x1b_GGi=1;a\x1b\\',
    '\x1b_Gi=1;a\x01\x1b\\',
  ];

  for (const sequence of sequences) {
    const { read, holding } = setup();
    const tokens = read(sequence);

    expect(tokens.every((token) => token.startsWith('key:'))).toBe(true);
    expect(rawKeys(tokens).join('')).toBe(sequence);
    expect(holding()).toBe(false);
  }
});

it('sends a CSI sequence with extra parameter bytes before a reply shape to the pane as keys', () => {
  const sequences = [
    '\x1b[1?1;2$y',
    '\x1b[1?31u',
    '\x1b[1?62;c',
    '\x1b[14;4;600;800t',
    '\x1b[1;1;5R',
    '\x1b[1I',
    '\x1b[1O',
    '\x1b[1?997;1n',
    '\x1b[1<0;5;3M',
  ];

  for (const sequence of sequences) {
    const { read } = setup();

    expect(read(sequence)).toEqual([`key:${sequence}`]);
  }
});

it('passes a Kitty keyboard flags reply with several digits as a response', () => {
  const { read } = setup();

  expect(read('\x1b[?31u\x1b[?u')).toEqual(['response:\x1b[?31u', 'response:\x1b[?u']);
});

it('keeps the edge bytes of CSI and SS3 sequences inside them', () => {
  const { read } = setup();

  expect(read('\x1b[@')).toEqual(['key:\x1b[@']);
  expect(read('\x1b[~')).toEqual(['key:\x1b[~']);
  expect(read('\x1b[ q')).toEqual(['key:\x1b[ q']);
  expect(read('\x1b[?1;2~')).toEqual(['key:\x1b[?1;2~']);
  expect(read('\x1bO@')).toEqual(['key:\x1bO@']);
  expect(read('\x1bO~')).toEqual(['key:\x1bO~']);
  expect(read('\x1b[\x7f')).toEqual(['key:\x1b[', 'key:\x7f']);
  expect(read('\x1bO\x7f')).toEqual(['key:\x1bO', 'key:\x7f']);
  expect(read('\x1bO ')).toEqual(['key:\x1bO', 'key: ']);
});

it('reads characters of every UTF-8 length, plain and after Escape', () => {
  const characters = ['£', 'ß', 'ߙ', 'क', '€', '\u{ffff}', '😀', '\u{10ffff}'];

  for (const character of characters) {
    const { read } = setup();

    expect(read(character)).toEqual([`key:${character}`]);
    expect(read(`\x1b${character}`)).toEqual([`key:\x1b${character}`]);
  }
});

it('splits every UTF-8 length at each byte into one key', () => {
  for (const character of ['£', 'क', '😀']) {
    const bytes = [...encoder.encode(character)];

    for (let cut = 1; cut < bytes.length; cut += 1) {
      const { read } = setup();

      expect(read(bytes.slice(0, cut))).toEqual([]);
      expect(read(bytes.slice(cut))).toEqual([`key:${character}`]);
    }
  }
});

it('reads continuation bytes only after a lead and drops stray ones', () => {
  const { read } = setup();

  expect(read([0xc3, 0x80])).toEqual(['key:\u00c0']);
  expect(read([0xc3, 0xbf])).toEqual(['key:ÿ']);
  expect(read([0x80])).toEqual([]);
  expect(read([0xbf])).toEqual([]);
  expect(read([0xc0, 0x61])).toEqual(['key:a']);
  expect(read([0xc1, 0x61])).toEqual(['key:a']);
  expect(read([0xf5, 0x61])).toEqual(['key:a']);
  expect(read([0xc3, 0x61])).toEqual(['key:a']);
  expect(read([0xc3, 0x7f])).toEqual(['key:\x7f']);
  expect(read([0xc3, 0xc0, 0x61])).toEqual(['key:a']);
  expect(read([0xe2, 0x82, 0x61])).toEqual(['key:a']);
  expect(read([0xf0, 0x9f, 0x98, 0x61])).toEqual(['key:a']);
  expect(read([0xf5, 0x80, 0x80, 0x80])).toEqual([]);
  expect(read([0xf8, 0x80, 0x80, 0x80])).toEqual([]);
});

it('opens the continuation window only for a lone Escape at the end of a read', () => {
  const inputs = ['\x1bx', 'x', '\x1b\x1bx'];

  for (const input of inputs) {
    const { read } = setup();

    read(input, 0);

    expect(read('[A', 5)).toEqual(['key:[', 'key:A']);
  }
});

it('keeps the continuation window open after a read of replies alone only', () => {
  const reply = '\x1b]4;1;rgb:cdcd/0000/0000\x07';
  const open = setup();

  open.read('\x1b', 0);
  open.read(reply, 5);

  expect(open.read('[A', 10)).toEqual(['key:\x1b[A:sent']);

  const closers = ['', `${reply}x`, '\x1b[200~p\x1b[201~'];

  for (const closer of closers) {
    const { read } = setup();

    read('\x1b', 0);
    read(closer, 5);

    expect(read('[A', 10)).toEqual(['key:[', 'key:A']);
  }
});

it('measures the continuation window from the Escape at any clock time', () => {
  const { read, expire } = setup();

  read('\x1b', 1000);

  expect(read('[A', 1019)).toEqual(['key:\x1b[A:sent']);

  read('\x1b', 5000);

  expect(read('[A', 5020)).toEqual(['key:[', 'key:A']);

  read('\x1b', 6000);
  expire(6010);

  expect(read('[A', 6015)).toEqual(['key:\x1b[A:sent']);
});

it('counts the hold window from the first held byte', () => {
  const { read, expire, holding } = setup();

  expect(read('\x1b]', 1000)).toEqual([]);
  expect(read('1', 1030)).toEqual([]);
  expect(expire(1049)).toEqual([]);
  expect(expire(1050)).toEqual(['key:\x1b]', 'key:1']);
  expect(holding()).toBe(false);
});

it('starts a new hold window for bytes held after earlier tokens', () => {
  const { read, expire } = setup();

  expect(read('\x1b]', 1000)).toEqual([]);
  expect(read('\x1b]', 1020)).toEqual(['key:\x1b]']);
  expect(expire(1060)).toEqual([]);
  expect(expire(1070)).toEqual(['key:\x1b]']);
});

it('starts a new hold window for a hold after a released one', () => {
  const { read, expire } = setup();

  read('\x1b]1', 0);
  expire(50);
  read('\x1b]1', 1000);

  expect(expire(1049)).toEqual([]);
  expect(expire(1050)).toEqual(['key:\x1b]', 'key:1']);
});

it('holds only the cut token after complete tokens, and releases only it', () => {
  const { read, expire } = setup();

  expect(read('ab\x1b]1', 0)).toEqual(['key:a', 'key:b']);
  expect(expire(50)).toEqual(['key:\x1b]', 'key:1']);
});

it('completes an SS3 key at the start of a read, split or whole', () => {
  const { read, holding } = setup();

  expect(read('\x1bOP')).toEqual(['key:\x1bOP']);
  expect(read('\x1bO')).toEqual([]);
  expect(holding()).toBe(true);
  expect(read('P')).toEqual(['key:\x1bOP']);
  expect(read('\x1bO1')).toEqual(['key:\x1bO', 'key:1']);
});

it('reads an SS3 tail after a lone Escape inside the window as a continuation', () => {
  const { read } = setup();

  read('\x1b', 0);

  expect(read('OA', 5)).toEqual(['key:\x1bOA:sent']);
});

it('keeps two Escapes as two keys', () => {
  const { read } = setup();

  expect(read('\x1b\x1b')).toEqual(['key:\x1b', 'key:\x1b']);
  expect(read('\x1b\x1bx')).toEqual(['key:\x1b', 'key:\x1bx']);
});

it('reads Escape before invalid UTF-8 as a key and drops the cut character', () => {
  const { read } = setup();

  expect(read([0x1b, 0xc3, 0x61])).toEqual(['key:\x1b', 'key:a']);
});

it('releases a held Escape and a cut character one token at a time', () => {
  const { read, expire, holding } = setup();

  expect(read([0x1b, 0xc3], 0)).toEqual([]);
  expect(expire(50)).toEqual(['key:\x1b']);
  expect(holding()).toBe(true);
  expect(expire(99)).toEqual([]);
  expect(expire(100)).toEqual([]);
  expect(holding()).toBe(false);
});

it('sends a valid string reply over the length limit to the pane as keys', () => {
  const { read, holding } = setup();
  const long = `\x1b]99;${'a'.repeat(600)}\x07`;
  const tokens = read(long);

  expect(tokens.every((token) => token.startsWith('key:'))).toBe(true);
  expect(rawKeys(tokens).join('')).toBe(long);
  expect(holding()).toBe(false);
  expect(read(`\x1b]99;${'a'.repeat(400)}\x07`)).toHaveLength(1);
});

it('sends a reply body cut by Escape and a non-backslash to the pane as keys', () => {
  const { read, holding } = setup();

  expect(read('\x1b]4;\x1bx')).toEqual(['key:\x1b]', 'key:4', 'key:;', 'key:\x1bx']);
  expect(holding()).toBe(false);
  expect(read('\x1b]4;\x1b')).toEqual([]);
  expect(holding()).toBe(true);
});

it('keeps a backslash inside a reply body', () => {
  const { read } = setup();

  expect(read('\x1b]99;a\\b\x07')).toEqual(['response:\x1b]99;a\\b\x07']);
});

it('holds a cut reply that starts late in a long read', () => {
  const { read, holding } = setup();
  const keys = read(`${'x'.repeat(600)}\x1b]99;ab`);

  expect(keys).toHaveLength(600);
  expect(holding()).toBe(true);
  expect(read('\x07')).toEqual(['response:\x1b]99;ab\x07']);
});

it('cuts a CSI with a bad byte or over 64 bytes to Escape bracket', () => {
  const { read, holding } = setup();

  expect(read('\x1b[1\x01a')).toEqual(['key:\x1b[', 'key:1', 'key:\x01', 'key:a']);
  expect(read('\x1b[1\x7fa')).toEqual(['key:\x1b[', 'key:1', 'key:\x7f', 'key:a']);

  const long = read(`\x1b[${'1'.repeat(70)}`);

  expect(long).toHaveLength(71);
  expect(long[0]).toBe('key:\x1b[');
  expect(holding()).toBe(false);
});

it('keeps the sent flag off a key after a resumed continuation', () => {
  const { read } = setup();

  read('\x1b', 0);

  expect(read('[', 1)).toEqual([]);
  expect(read('A', 2)).toEqual(['key:\x1b[A:sent']);
  expect(read('x', 3)).toEqual(['key:x']);
});

it('keeps held bytes when a continuation tail arrives after a reply that left a hold', () => {
  const { read } = setup();

  read('\x1b', 0);

  expect(read('\x1b]4;1;rgb:cdcd/0000/0000\x07\x1b]1', 5)).toEqual([
    'response:\x1b]4;1;rgb:cdcd/0000/0000\x07',
  ]);

  expect(read('[A', 10)).toEqual(['key:\x1b]', 'key:1', 'key:[', 'key:A']);
});
