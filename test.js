import { describe, it } from 'node:test';
import assert from 'node:assert';
import tee from './index.js';

describe('safe-tee', () => {
  it('should tee a ReadableStream into two identical streams', async () => {
    const data = ['chunk1', 'chunk2', 'chunk3'];
    const source = new ReadableStream({
      start(controller) {
        data.forEach(chunk => controller.enqueue(chunk));
        controller.close();
      }
    });

    const [stream1, stream2] = tee(source);
    
    const reader1 = stream1.getReader();
    const reader2 = stream2.getReader();
    
    const results1 = [];
    const results2 = [];
    
    // Read from both streams
    while (true) {
      const { done, value } = await reader1.read();
      if (done) break;
      results1.push(value);
    }
    
    while (true) {
      const { done, value } = await reader2.read();
      if (done) break;
      results2.push(value);
    }
    
    assert.deepStrictEqual(results1, data);
    assert.deepStrictEqual(results2, data);
    assert.deepStrictEqual(results1, results2);
  });

  it('should throw TypeError for non-ReadableStream input', () => {
    assert.throws(
      () => tee('not a stream'),
      {
        name: 'TypeError',
        message: 'Argument must be a ReadableStream'
      }
    );

    assert.throws(
      () => tee(123),
      TypeError
    );

    assert.throws(
      () => tee({}),
      TypeError
    );

    assert.throws(
      () => tee(null),
      TypeError
    );
  });

  it('should work with async streams', async () => {
    let i = 0;
    const expectedData = ['async-chunk-0', 'async-chunk-1', 'async-chunk-2'];
    const asyncSource = new ReadableStream({
      async pull(controller) {
        if (i < 3) {
          await new Promise(resolve => setTimeout(resolve, 10));
          controller.enqueue(`async-chunk-${i++}`);
        } else {
          controller.close();
        }
      }
    });

    const [stream1, stream2] = tee(asyncSource);
    
    const reader1 = stream1.getReader();
    const reader2 = stream2.getReader();
    const results1 = [];
    const results2 = [];
    
    while (true) {
      const { done, value } = await reader1.read();
      if (done) break;
      results1.push(value);
    }

    while (true) {
      const { done, value } = await reader2.read();
      if (done) break;
      results2.push(value);
    }
    
    assert.deepStrictEqual(results1, expectedData);
    assert.deepStrictEqual(results2, expectedData);
  });

  it('should handle empty streams', async () => {
    const emptySource = new ReadableStream({
      start(controller) {
        controller.close();
      }
    });

    const [stream1, stream2] = tee(emptySource);
    
    const reader1 = stream1.getReader();
    const reader2 = stream2.getReader();
    
    const result1 = await reader1.read();
    const result2 = await reader2.read();
    
    assert.strictEqual(result1.done, true);
    assert.strictEqual(result1.value, undefined);
    assert.strictEqual(result2.done, true);
    assert.strictEqual(result2.value, undefined);
  });

  it('should handle different data types', async () => {
    const mixedData = [
      'string',
      42,
      { obj: 'value' },
      [1, 2, 3],
      new Uint8Array([1, 2, 3])
    ];
    
    const source = new ReadableStream({
      start(controller) {
        mixedData.forEach(chunk => controller.enqueue(chunk));
        controller.close();
      }
    });

    const [stream1, stream2] = tee(source);
    
    const reader1 = stream1.getReader();
    const results = [];
    
    while (true) {
      const { done, value } = await reader1.read();
      if (done) break;
      results.push(value);
    }
    
    assert.deepStrictEqual(results, mixedData);
  });

  it('should handle backpressure at rate of faster consumer', async () => {
    let pullCount = 0;
    const source = new ReadableStream({
      pull(controller) {
        pullCount++;
        if (pullCount <= 10) {
          controller.enqueue(`chunk-${pullCount}`);
        } else {
          controller.close();
        }
      }
    });

    const [stream1, stream2] = tee(source);
    const reader1 = stream1.getReader();
    const reader2 = stream2.getReader();

    // Read 5 chunks from stream1 (faster consumer)
    for (let i = 0; i < 5; i++) {
      await reader1.read();
    }

    // Only read 1 chunk from stream2 (slower consumer)
    await reader2.read();

    // More pulls should have happened due to faster consumer
    assert.ok(pullCount >= 5, `Expected at least 5 pulls, got ${pullCount}`);
  });

  it('should buffer unread data internally when streams consumed at different rates', async () => {
    const chunks = Array.from({ length: 100 }, (_, i) => `chunk-${i}`);
    const source = new ReadableStream({
      start(controller) {
        chunks.forEach(chunk => controller.enqueue(chunk));
        controller.close();
      }
    });

    const [stream1, stream2] = tee(source);
    const reader1 = stream1.getReader();
    const reader2 = stream2.getReader();

    // Read all chunks from stream1 first
    const results1 = [];
    while (true) {
      const { done, value } = await reader1.read();
      if (done) break;
      results1.push(value);
    }

    // Stream2 should still have all data available (buffered internally)
    const results2 = [];
    while (true) {
      const { done, value } = await reader2.read();
      if (done) break;
      results2.push(value);
    }

    assert.deepStrictEqual(results1, chunks);
    assert.deepStrictEqual(results2, chunks);
  });

  it('should lock the original stream during teeing', async () => {
    const source = new ReadableStream({
      start(controller) {
        controller.enqueue('data');
        controller.close();
      }
    });

    // Tee the stream
    const [stream1, stream2] = tee(source);

    // Try to get a reader on the original stream - should throw
    assert.throws(
      () => source.getReader(),
      {
        name: 'TypeError'
      }
    );
  });

  it('should demonstrate that tee creates independent branches', async () => {
    const source = new ReadableStream({
      start(controller) {
        controller.enqueue('A');
        controller.enqueue('B');
        controller.enqueue('C');
        controller.close();
      }
    });

    const [stream1, stream2] = tee(source);
    
    // Create readers
    const reader1 = stream1.getReader();
    const reader2 = stream2.getReader();

    // Read from stream1 first
    const chunk1 = await reader1.read();
    assert.strictEqual(chunk1.value, 'A');
    
    // Read from stream2 - should get same first chunk
    const chunk2 = await reader2.read();
    assert.strictEqual(chunk2.value, 'A');
    
    // Continue reading stream1
    const chunk3 = await reader1.read();
    assert.strictEqual(chunk3.value, 'B');
    
    // Stream2 is independent and gets B as well
    const chunk4 = await reader2.read();
    assert.strictEqual(chunk4.value, 'B');
  });
});