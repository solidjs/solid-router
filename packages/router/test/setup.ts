import { vi } from "vitest";

vi.mock("solid-js/web", async importOriginal => {
  const actual = await importOriginal<typeof import("solid-js/web")>();

  return {
    ...actual,
    delegateEvents: ((eventNames, document) => {
      const target = document ?? globalThis.window?.document ?? globalThis.document;
      if (!target) return;
      return actual.delegateEvents(eventNames, target);
    }) as typeof actual.delegateEvents,
    isServer: false,
    getRequestEvent: () => null
  };
});
