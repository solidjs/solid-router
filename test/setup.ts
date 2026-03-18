import { vi } from "vitest";

vi.mock("@solidjs/web", async importOriginal => {
  const actual = await importOriginal<typeof import("@solidjs/web")>();

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
