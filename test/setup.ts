import { vi } from "vitest";

vi.mock("@solidjs/web", async importOriginal => {
  const actual = await importOriginal<typeof import("@solidjs/web")>();

  return {
    ...actual,
    isServer: false,
    getRequestEvent: () => null
  };
});
