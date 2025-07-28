# safe-tee

A standalone tee() function for Web Streams API ReadableStream objects with backpressure control between branches.

Works in any environment that supports the Web Streams API standard, including modern browsers, Node.js, Deno, and other JavaScript runtimes.

Unlike the native `ReadableStream.tee()` method which allows branches to read independently at different speeds, this implementation coordinates the two streams to prevent one from getting too far ahead of the other. This helps manage memory usage when one branch consumes data much slower than the other.

## Installation

```bash
npm install safe-tee
```

## Usage

```javascript
import tee from "safe-tee";

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
import tee from "safe-tee";

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

## Example with backpressure control

```javascript
import tee from "safe-tee";

// Create a stream with controlled backpressure between branches
const stream = new ReadableStream({
  start(controller) {
    for (let i = 0; i < 10; i++) {
      controller.enqueue(`Chunk ${i}`);
    }
    controller.close();
  },
});

// Allow one stream to be up to 3 chunks ahead of the other
const [stream1, stream2] = tee(stream, { maxChunkDifference: 3 });

// Even if one reader is slower, the faster reader won't get too far ahead
async function slowReader(stream) {
  const reader = stream.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      // Simulate slow processing
      await new Promise(resolve => setTimeout(resolve, 100));
      console.log("Slow reader:", value);
    }
  } finally {
    reader.releaseLock();
  }
}

async function fastReader(stream) {
  const reader = stream.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      console.log("Fast reader:", value);
    }
  } finally {
    reader.releaseLock();
  }
}

Promise.all([slowReader(stream1), fastReader(stream2)]);
```

## API

### `tee(stream, options?)`

Creates a tee of a ReadableStream, returning an array of two new ReadableStream instances that will both emit the same data as the original stream. This implementation responds to backpressure from either branch, limiting how far ahead one stream can get compared to the other.

**Note:** This behavior differs from the native `ReadableStream.tee()` method, which buffers all unread chunks when branches read at different speeds. The `safe-tee` function prevents excessive memory usage by pausing the faster stream until the slower one catches up.

#### Parameters

- `stream` (ReadableStream): The source readable stream to tee
- `options` (Object, optional): Configuration options
  - `maxChunkDifference` (number, default: 1): Maximum difference in chunks between streams before applying backpressure. Must be a non-negative number.

#### Returns

- `[ReadableStream, ReadableStream]`: An array containing two readable streams

#### Throws

- `TypeError`: If the provided argument is not a ReadableStream
- `TypeError`: If maxChunkDifference is not a non-negative number

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

// With options
const [stream3, stream4] = tee(source, { maxChunkDifference: 5 });
```

## License

MIT
