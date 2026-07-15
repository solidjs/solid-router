import { vi } from "vitest";

vi.mock("@solidjs/web", async importOriginal => {
  const actual = await importOriginal<typeof import("@solidjs/web")>();

  return {
    ...actual,
    delegateEvents: ((eventNames: string[]) => {
      // no-op when jsdom hasn't installed a document yet
      if (!(globalThis.window?.document ?? (globalThis as any).document)) return;
      return actual.delegateEvents(eventNames);
    }) as typeof actual.delegateEvents,
    isServer: false,
    getRequestEvent: () => null
  };
});
