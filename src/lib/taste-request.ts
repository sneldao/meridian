export function createTasteRequestScope() {
  let current: AbortController | null = null;
  return {
    begin() {
      current?.abort();
      const controller = new AbortController();
      current = controller;
      return { signal: controller.signal, isCurrent: () => current === controller && !controller.signal.aborted };
    },
    cancel() { current?.abort(); current = null; },
  };
}
