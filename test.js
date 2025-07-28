import { describe, it } from "node:test";
import assert from "node:assert";
import tee from "./index.js";

describe("safe-tee", () => {
  it("should tee a ReadableStream into two identical streams when read in parallel", async () => {
    const data = ["chunk1", "chunk2", "chunk3"];
    const source = ReadableStream.from(data);

    const [stream1, stream2] = tee(source);

    // Read from both streams in parallel
    const [results1, results2] = await Promise.all([
      Array.fromAsync(stream1),
      Array.fromAsync(stream2),
    ]);

    assert.deepStrictEqual(results1, data);
    assert.deepStrictEqual(results2, data);
    assert.deepStrictEqual(results1, results2);
  });

  it("should throw TypeError for non-ReadableStream input", () => {
    assert.throws(() => tee("not a stream"), {
      name: "TypeError",
      message: "Argument must be a ReadableStream",
    });

    assert.throws(() => tee(123), TypeError);

    assert.throws(() => tee({}), TypeError);

    assert.throws(() => tee(null), TypeError);
  });

  it("should work with async streams when read in parallel", async () => {
    let i = 0;
    const expectedData = ["async-chunk-0", "async-chunk-1", "async-chunk-2"];
    const asyncSource = new ReadableStream({
      async pull(controller) {
        if (i < 3) {
          await new Promise((resolve) => setTimeout(resolve, 10));
          controller.enqueue(`async-chunk-${i++}`);
        } else {
          controller.close();
        }
      },
    });

    const [stream1, stream2] = tee(asyncSource);

    const [results1, results2] = await Promise.all([
      Array.fromAsync(stream1),
      Array.fromAsync(stream2),
    ]);

    assert.deepStrictEqual(results1, expectedData);
    assert.deepStrictEqual(results2, expectedData);
  });

  it("should handle empty streams", async () => {
    const emptySource = ReadableStream.from([]);

    const [stream1, stream2] = tee(emptySource);

    const reader1 = stream1.getReader();
    const reader2 = stream2.getReader();

    const [result1, result2] = await Promise.all([
      reader1.read(),
      reader2.read(),
    ]);

    assert.strictEqual(result1.done, true);
    assert.strictEqual(result1.value, undefined);
    assert.strictEqual(result2.done, true);
    assert.strictEqual(result2.value, undefined);
  });

  it("should handle different data types", async () => {
    const mixedData = [
      "string",
      42,
      { obj: "value" },
      [1, 2, 3],
      new Uint8Array([1, 2, 3]),
    ];

    const source = ReadableStream.from(mixedData);

    const [stream1, stream2] = tee(source);

    const [results1, results2] = await Promise.all([
      Array.fromAsync(stream1),
      Array.fromAsync(stream2),
    ]);

    assert.deepStrictEqual(results1, mixedData);
    assert.deepStrictEqual(results2, mixedData);
  });

  it("should lock the original stream during teeing", async () => {
    const source = ReadableStream.from(["data"]);

    // Tee the stream
    const [stream1, stream2] = tee(source);

    // Try to get a reader on the original stream - should throw
    assert.throws(() => source.getReader(), {
      name: "TypeError",
    });
  });

  it("should handle large streams efficiently", async () => {
    const chunkCount = 1000;
    const chunks = Array.from({ length: chunkCount }, (_, i) => `chunk-${i}`);

    const source = ReadableStream.from(chunks);

    const [stream1, stream2] = tee(source);

    const [results1, results2] = await Promise.all([
      Array.fromAsync(stream1),
      Array.fromAsync(stream2),
    ]);

    assert.strictEqual(results1.length, chunkCount);
    assert.strictEqual(results2.length, chunkCount);
    assert.deepStrictEqual(results1, results2);
  });

  it("should handle interleaved reading between streams", async () => {
    const source = ReadableStream.from(["A", "B", "C", "D"]);

    const [stream1, stream2] = tee(source);

    const reader1 = stream1.getReader();
    const reader2 = stream2.getReader();

    // Read alternately from streams in parallel
    const [chunk1, chunk2] = await Promise.all([
      reader1.read(),
      reader2.read(),
    ]);

    assert.strictEqual(chunk1.value, "A");
    assert.strictEqual(chunk2.value, "A");

    const [chunk3, chunk4] = await Promise.all([
      reader1.read(),
      reader2.read(),
    ]);

    assert.strictEqual(chunk3.value, "B");
    assert.strictEqual(chunk4.value, "B");

    // Read remaining chunks
    reader1.releaseLock();
    reader2.releaseLock();
    const [remaining1, remaining2] = await Promise.all([
      Array.fromAsync(stream1),
      Array.fromAsync(stream2),
    ]);

    assert.deepStrictEqual(remaining1, ["C", "D"]);
    assert.deepStrictEqual(remaining2, ["C", "D"]);
  });

  it("should respect backpressure with MAX_CHUNK_DIFFERENCE limit", async () => {
    const data = ["chunk1", "chunk2", "chunk3", "chunk4"];
    const source = ReadableStream.from(data);

    const [stream1, stream2] = tee(source);

    const reader1 = stream1.getReader();
    const reader2 = stream2.getReader();

    // Read first chunk from stream1 only
    const firstChunk1 = await reader1.read();
    assert.strictEqual(firstChunk1.value, "chunk1");

    // Try to read second chunk from stream1 - due to backpressure,
    // this will wait until stream2 catches up
    const secondChunk1Promise = reader1.read();

    // Give some time to ensure the read would complete if possible
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Now read from stream2 to allow stream1 to proceed
    const firstChunk2 = await reader2.read();
    assert.strictEqual(firstChunk2.value, "chunk1");

    // Now stream1 should be able to complete its read
    const secondChunk1 = await secondChunk1Promise;
    assert.strictEqual(secondChunk1.value, "chunk2");

    // Clean up by reading remaining chunks
    reader1.releaseLock();
    reader2.releaseLock();
    const [remaining1, remaining2] = await Promise.all([
      Array.fromAsync(stream1),
      Array.fromAsync(stream2),
    ]);

    assert.deepStrictEqual(remaining1, ["chunk3", "chunk4"]);
    assert.deepStrictEqual(remaining2, ["chunk2", "chunk3", "chunk4"]);
  });

  it("should handle stream cancellation", async () => {
    const source = ReadableStream.from(["chunk1", "chunk2", "chunk3"]);

    const [stream1, stream2] = tee(source);

    const reader1 = stream1.getReader();
    const reader2 = stream2.getReader();

    // Read one chunk from each
    await Promise.all([reader1.read(), reader2.read()]);

    // Cancel one stream
    reader1.releaseLock();
    await stream1.cancel();

    // The other stream should still be readable
    const { value } = await reader2.read();
    assert.strictEqual(value, "chunk2");

    // Cancel the second stream
    reader2.releaseLock();
    await stream2.cancel();
  });

  it("should throw TypeError for invalid maxChunkDifference", () => {
    const source = ReadableStream.from(["data"]);

    assert.throws(
      () => tee(source, { maxChunkDifference: -1 }),
      {
        name: "TypeError",
        message: "maxChunkDifference must be a non-negative number",
      }
    );

    assert.throws(
      () => tee(source, { maxChunkDifference: "not a number" }),
      {
        name: "TypeError",
        message: "maxChunkDifference must be a non-negative number",
      }
    );

    assert.throws(
      () => tee(source, { maxChunkDifference: NaN }),
      {
        name: "TypeError",
        message: "maxChunkDifference must be a non-negative number",
      }
    );
  });

  it("should allow custom maxChunkDifference of 0 (lockstep reading)", async () => {
    const data = ["chunk1", "chunk2", "chunk3", "chunk4"];
    const source = ReadableStream.from(data);

    const [stream1, stream2] = tee(source, { maxChunkDifference: 0 });

    // With maxChunkDifference of 0, streams must read in lockstep
    // Reading them in parallel should work
    const [results1, results2] = await Promise.all([
      Array.fromAsync(stream1),
      Array.fromAsync(stream2)
    ]);

    assert.deepStrictEqual(results1, data);
    assert.deepStrictEqual(results2, data);
  });

  it("should allow custom maxChunkDifference of 3", async () => {
    const data = ["chunk1", "chunk2", "chunk3", "chunk4", "chunk5", "chunk6"];
    const source = ReadableStream.from(data);

    const [stream1, stream2] = tee(source, { maxChunkDifference: 3 });

    // Create async iterators that we can control
    const iter1 = stream1[Symbol.asyncIterator]();
    const iter2 = stream2[Symbol.asyncIterator]();

    // Read 4 chunks from stream1 (allowed with difference of 3)
    const results1 = [];
    for (let i = 0; i < 4; i++) {
      const { value } = await iter1.next();
      results1.push(value);
    }
    assert.deepStrictEqual(results1, ["chunk1", "chunk2", "chunk3", "chunk4"]);

    // Now read 1 chunk from stream2 to allow stream1 to continue
    const { value: value2 } = await iter2.next();
    assert.strictEqual(value2, "chunk1");

    // Now we can read more from stream1
    const { value: value1 } = await iter1.next();
    assert.strictEqual(value1, "chunk5");

    // Clean up by reading remaining data in parallel
    const remaining1 = [];
    const remaining2 = [];
    
    await Promise.all([
      (async () => {
        for await (const chunk of iter1) {
          remaining1.push(chunk);
        }
      })(),
      (async () => {
        for await (const chunk of iter2) {
          remaining2.push(chunk);
        }
      })()
    ]);

    assert.deepStrictEqual(remaining1, ["chunk6"]);
    assert.deepStrictEqual(remaining2, ["chunk2", "chunk3", "chunk4", "chunk5", "chunk6"]);
  });

  it("should allow unlimited difference with Infinity", async () => {
    const data = Array.from({ length: 100 }, (_, i) => `chunk-${i}`);
    const source = ReadableStream.from(data);

    const [stream1, stream2] = tee(source, { maxChunkDifference: Infinity });

    // With Infinity, stream1 can read all data without waiting for stream2
    const results1 = await Array.fromAsync(stream1);
    assert.strictEqual(results1.length, 100);

    // Stream2 should still be able to read all data
    const results2 = await Array.fromAsync(stream2);
    assert.deepStrictEqual(results1, results2);
  });
});
