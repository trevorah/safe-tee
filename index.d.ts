/**
 * Creates a tee of a web readable stream, returning an array of two readable streams
 * that will both emit the same data as the original stream.
 * 
 * This is a standalone version of the ReadableStream.prototype.tee() method.
 * 
 * @param stream - The source readable stream to tee
 * @returns An array containing two readable streams
 */
export default function tee<T = any>(stream: ReadableStream<T>): [ReadableStream<T>, ReadableStream<T>];

export { tee };