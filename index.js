/**
 * Creates a tee of a web readable stream, returning an array of two readable streams
 * that will both emit the same data as the original stream.
 * 
 * This is a standalone version of the ReadableStream.prototype.tee() method.
 * 
 * @param {ReadableStream} stream - The source readable stream to tee
 * @returns {[ReadableStream, ReadableStream]} An array containing two readable streams
 */
export default function tee(stream) {
  if (!(stream instanceof ReadableStream)) {
    throw new TypeError('Argument must be a ReadableStream');
  }

  // Use the built-in tee() method of ReadableStream
  return stream.tee();
}

export { tee };