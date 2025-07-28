/**
 * Creates a tee of a web readable stream, returning an array of two readable streams
 * that will both emit the same data as the original stream.
 *
 * This implementation responds to backpressure from either branch, limiting how far
 * ahead one stream can get compared to the other.
 *
 * @param {ReadableStream} stream - The source readable stream to tee
 * @param {Object} [options] - Optional configuration
 * @param {number} [options.maxChunkDifference=1] - Maximum difference in chunks between streams before applying backpressure
 * @returns {[ReadableStream, ReadableStream]} An array containing two readable streams
 */
export default function tee(stream, options = {}) {
  if (!(stream instanceof ReadableStream)) {
    throw new TypeError("Argument must be a ReadableStream");
  }

  const { maxChunkDifference = 1 } = options;

  if (typeof maxChunkDifference !== "number" || maxChunkDifference < 0 || isNaN(maxChunkDifference)) {
    throw new TypeError("maxChunkDifference must be a non-negative number");
  }

  const [rawStream1, rawStream2] = stream.tee();

  let chunkCount1 = 0;
  let chunkCount2 = 0;

  let waiting1 = null;
  let waiting2 = null;

  const transform1 = new TransformStream({
    async transform(chunk, controller) {
      // Check if we're too far ahead
      if (chunkCount1 > chunkCount2 + maxChunkDifference) {
        // Wait for stream2 to catch up
        await new Promise((resolve) => {
          waiting1 = () => {
            waiting1 = null;
            resolve();
          };
        });
      }

      chunkCount1++;
      controller.enqueue(chunk);

      if (waiting2) {
        waiting2();
      }
    },
  });

  const transform2 = new TransformStream({
    async transform(chunk, controller) {
      // Check if we're too far ahead
      if (chunkCount2 > chunkCount1 + maxChunkDifference) {
        // Wait for stream1 to catch up
        await new Promise((resolve) => {
          waiting2 = () => {
            waiting2 = null;
            resolve();
          };
        });
      }

      chunkCount2++;
      controller.enqueue(chunk);

      if (waiting1) {
        waiting1();
      }
    },
  });

  return [
    rawStream1.pipeThrough(transform1),
    rawStream2.pipeThrough(transform2),
  ];
}
