export interface SSEEvent {
  event?: string;
  data: string;
  id?: string;
  retry?: number;
}

export class SSEParser {
  private buffer: string = "";
  private onEvent: (event: SSEEvent) => void;

  constructor(onEvent: (event: SSEEvent) => void) {
    this.onEvent = onEvent;
  }

  /**
   * Appends a new text chunk to the buffer and parses any complete events.
   */
  public append(chunk: string) {
    this.buffer += chunk;
    this.processBuffer();
  }

  /**
   * Clears the internal buffer. Useful when starting a new stream.
   */
  public clear() {
    this.buffer = "";
  }

  private processBuffer() {
    while (true) {
      // Find the first occurrence of a double newline (event delimiter)
      const match = this.buffer.match(/\r\n\r\n|\n\n|\r\r/);
      if (!match || match.index === undefined) {
        break; // No complete events in the buffer
      }

      const endIndex = match.index;
      const advance = match[0].length;

      const rawEvent = this.buffer.substring(0, endIndex);
      this.parseEvent(rawEvent);

      // Slice the processed event and its delimiter from the buffer
      this.buffer = this.buffer.substring(endIndex + advance);
    }
  }

  private parseEvent(raw: string) {
    if (!raw.trim()) return; // Ignore empty events (e.g. keep-alive)

    const lines = raw.split(/\r\n|\n|\r/);
    const event: SSEEvent = { data: "" };
    let hasData = false;

    for (const line of lines) {
      // Ignore comments
      if (line.startsWith(':')) {
        continue;
      }

      const colonIdx = line.indexOf(':');
      let field = "";
      let value = "";

      if (colonIdx === -1) {
        field = line;
        value = "";
      } else {
        field = line.substring(0, colonIdx);
        value = line.substring(colonIdx + 1);
        // The SSE spec allows for an optional single leading space
        if (value.startsWith(' ')) {
          value = value.substring(1);
        }
      }

      switch (field) {
        case 'event':
          event.event = value;
          break;
        case 'data':
          if (hasData) {
            event.data += '\n' + value;
          } else {
            event.data = value;
            hasData = true;
          }
          break;
        case 'id':
          event.id = value;
          break;
        case 'retry':
          const retryNum = parseInt(value, 10);
          if (!isNaN(retryNum)) {
            event.retry = retryNum;
          }
          break;
        default:
          if (process.env.NODE_ENV === 'development') {
            console.warn(`[SSEParser] Unrecognized field: ${field}`);
          }
      }
    }

    // According to the SSE spec, if data is empty (never provided), dispatch is aborted
    if (hasData) {
      this.onEvent(event);
    }
  }
}
