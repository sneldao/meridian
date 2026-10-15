// One audio channel for the whole app. The crew feed and the briefing card
// both speak through this, so voices can never overlap and a cancel kills
// anything still fetching.

export const voiceBus = {
  /** The clip currently playing (or the one being fetched). */
  current: null as HTMLAudioElement | null,
  /** Set synchronously while a clip is being fetched — this is the real lock. */
  busy: false,
  /** Bump to invalidate any in-flight fetch (stop / cancel / new run). */
  gen: 0,
};

export function stopVoiceBus() {
  voiceBus.gen++;
  voiceBus.current?.pause();
  voiceBus.current = null;
  voiceBus.busy = false;
}
