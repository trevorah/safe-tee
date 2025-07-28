# safe-tee

A standalone tee() function for Web Streams API ReadableStream objects in Node.js.

## Installation

```bash
npm install safe-tee
```

## Usage

```javascript
const tee = require("safe-tee");

// Create a ReadableStream
const stream = new ReadableStream({
  start(controller) {
    controller.enqueue("Hello");
    controller.enqueue("World");
    controller.close();
  },
});

// Tee the stream into two identical streams
const [stream1, stream2] = tee(stream);

// Read from both streams independently
async function readStream(stream, name) {
  const reader = stream.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      console.log(`${name}:`, value);
    }
  } finally {
    reader.releaseLock();
  }
}

readStream(stream1, "Stream 1");
readStream(stream2, "Stream 2");
```

## Example with fetch()

```javascript
const tee = require("safe-tee");

async function processResponse() {
  const response = await fetch("https://example.com/data");
  const [stream1, stream2] = tee(response.body);

  // Process the same data in two different ways
  const text = await new Response(stream1).text();
  const arrayBuffer = await new Response(stream2).arrayBuffer();

  console.log("Text length:", text.length);
  console.log("ArrayBuffer size:", arrayBuffer.byteLength);
}
```

## API

### `tee(stream)`

Creates a tee of a ReadableStream, returning an array of two new ReadableStream instances that will both emit the same data as the original stream.

#### Parameters

- `stream` (ReadableStream): The source readable stream to tee

#### Returns

- `[ReadableStream, ReadableStream]`: An array containing two readable streams

#### Throws

- `TypeError`: If the provided argument is not a ReadableStream

## TypeScript

TypeScript definitions are included:

```typescript
import tee from "safe-tee";

const source: ReadableStream<string> = new ReadableStream({
  start(controller) {
    controller.enqueue("typed");
    controller.close();
  },
});

const [stream1, stream2]: [ReadableStream<string>, ReadableStream<string>] =
  tee(source);
```

## License

MIT
