/**
 * Creates a tee of a web readable stream, returning an array of two readable streams
 * that will both emit the same data as the original stream.
 * 
 * This implementation responds to backpressure from either branch, limiting how far
 * ahead one stream can get compared to the other.
 * 
 * @param {ReadableStream} stream - The source readable stream to tee
 * @returns {[ReadableStream, ReadableStream]} An array containing two readable streams
 */
export default function tee(stream) {
  if (!(stream instanceof ReadableStream)) {
    throw new TypeError('Argument must be a ReadableStream');
  }

  // Maximum difference in chunks between streams before applying backpressure
  const MAX_CHUNK_DIFFERENCE = 1;

  // Use native tee to get the base streams
  const [nativeStream1, nativeStream2] = stream.tee();

  // Shared coordination state
  const state = {
    count1: 0,
    count2: 0,
    waiting1: null,
    waiting2: null
  };

  // Create coordinated transform streams
  const transform1 = new TransformStream({
    async transform(chunk, controller) {
      // Check if we're too far ahead
      if (state.count1 >= state.count2 + MAX_CHUNK_DIFFERENCE) {
        // Wait for stream2 to catch up
        await new Promise(resolve => {
          state.waiting1 = () => {
            state.count1++;
            controller.enqueue(chunk);
            state.waiting1 = null;
            resolve();
          };
        });
        return;
      }
      
      // Process normally
      state.count1++;
      controller.enqueue(chunk);
      
      // Wake up stream2 if it's waiting
      if (state.waiting2) {
        state.waiting2();
      }
    }
  });

  const transform2 = new TransformStream({
    async transform(chunk, controller) {
      // Check if we're too far ahead  
      if (state.count2 >= state.count1 + MAX_CHUNK_DIFFERENCE) {
        // Wait for stream1 to catch up
        await new Promise(resolve => {
          state.waiting2 = () => {
            state.count2++;
            controller.enqueue(chunk);
            state.waiting2 = null;
            resolve();
          };
        });
        return;
      }
      
      // Process normally
      state.count2++;
      controller.enqueue(chunk);
      
      // Wake up stream1 if it's waiting
      if (state.waiting1) {
        state.waiting1();
      }
    }
  });

  return [
    nativeStream1.pipeThrough(transform1),
    nativeStream2.pipeThrough(transform2)
  ];
}

export { tee };