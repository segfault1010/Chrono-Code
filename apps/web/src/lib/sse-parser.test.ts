import test from 'node:test';
import assert from 'node:assert';
import { SSEParser, SSEEvent } from './sse-parser';

test('SSEParser', async (t) => {
  await t.test('parses a single complete event', () => {
    const events: SSEEvent[] = [];
    const parser = new SSEParser((e) => events.push(e));

    parser.append('data: hello world\n\n');

    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].data, 'hello world');
  });

  await t.test('handles fragmented chunks safely', () => {
    const events: SSEEvent[] = [];
    const parser = new SSEParser((e) => events.push(e));

    parser.append('data: part 1');
    assert.strictEqual(events.length, 0); // Not complete yet

    parser.append(' and part 2\n');
    assert.strictEqual(events.length, 0); // Still not complete

    parser.append('\n');
    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].data, 'part 1 and part 2');
  });

  await t.test('handles multiple events in a single chunk', () => {
    const events: SSEEvent[] = [];
    const parser = new SSEParser((e) => events.push(e));

    parser.append('data: first\n\ndata: second\n\ndata: third\n\n');

    assert.strictEqual(events.length, 3);
    assert.strictEqual(events[0].data, 'first');
    assert.strictEqual(events[1].data, 'second');
    assert.strictEqual(events[2].data, 'third');
  });

  await t.test('strips optional leading space from values', () => {
    const events: SSEEvent[] = [];
    const parser = new SSEParser((e) => events.push(e));

    parser.append('data:with space\n\ndata: without space\n\n');

    assert.strictEqual(events.length, 2);
    assert.strictEqual(events[0].data, 'with space');
    assert.strictEqual(events[1].data, 'without space');
  });

  await t.test('handles multiple data lines in a single event', () => {
    const events: SSEEvent[] = [];
    const parser = new SSEParser((e) => events.push(e));

    parser.append('data: line 1\ndata: line 2\ndata: line 3\n\n');

    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].data, 'line 1\nline 2\nline 3');
  });

  await t.test('parses event, id, and retry fields', () => {
    const events: SSEEvent[] = [];
    const parser = new SSEParser((e) => events.push(e));

    parser.append('event: custom\nid: 123\nretry: 5000\ndata: payload\n\n');

    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].event, 'custom');
    assert.strictEqual(events[0].id, '123');
    assert.strictEqual(events[0].retry, 5000);
    assert.strictEqual(events[0].data, 'payload');
  });

  await t.test('ignores comments', () => {
    const events: SSEEvent[] = [];
    const parser = new SSEParser((e) => events.push(e));

    parser.append(': this is a comment\ndata: actual data\n: another comment\n\n');

    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].data, 'actual data');
  });

  await t.test('ignores empty events without data', () => {
    const events: SSEEvent[] = [];
    const parser = new SSEParser((e) => events.push(e));

    parser.append('event: ping\n\n: keep-alive\n\n\n\ndata: real data\n\n');

    // The first two events have no 'data' field, so they are discarded
    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].data, 'real data');
  });

  await t.test('supports CRLF and CR delimiters', () => {
    const events: SSEEvent[] = [];
    const parser = new SSEParser((e) => events.push(e));

    parser.append('data: crlf\r\n\r\ndata: cr\r\r');

    assert.strictEqual(events.length, 2);
    assert.strictEqual(events[0].data, 'crlf');
    assert.strictEqual(events[1].data, 'cr');
  });

  await t.test('safely leaves incomplete final buffer', () => {
    const events: SSEEvent[] = [];
    const parser = new SSEParser((e) => events.push(e));

    parser.append('data: good\n\ndata: bad');

    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].data, 'good');

    // The rest of the buffer is pending
    parser.append('\n\n');
    assert.strictEqual(events.length, 2);
    assert.strictEqual(events[1].data, 'bad');
  });
});
