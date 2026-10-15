import { storeVoice } from "./cache";

// Forward an upstream audio stream chunk for chunk while collecting the bytes
// for the cache. The enqueue happens on read, never after a full drain, so the
// browser starts playing while ElevenLabs is still synthesising.

export function tapStreamToCache(
  source: ReadableStream<Uint8Array>,
  key: string,
  contentType: string,
): ReadableStream<Uint8Array> {
  let cancelled = false;

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = source.getReader();
      const parts: Uint8Array[] = [];
      let total = 0;
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          parts.push(value);
          total += value.byteLength;
          controller.enqueue(value);
        }
        controller.close();
        // A stopped or aborted clip is a partial waveform; caching it would
        // make every later replay of that line end mid-sentence.
        if (!cancelled && total > 0) {
          const bytes = new Uint8Array(total);
          let offset = 0;
          for (const part of parts) {
            bytes.set(part, offset);
            offset += part.byteLength;
          }
          await storeVoice(key, bytes, contentType);
        }
      } catch (error) {
        controller.error(error);
      } finally {
        reader.releaseLock();
      }
    },
    cancel(reason) {
      cancelled = true;
      return source.cancel(reason);
    },
  });
}
