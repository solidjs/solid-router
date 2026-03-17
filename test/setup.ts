import { vi } from "vitest";

vi.mock("solid-js/web", () => ({
  isServer: false,
  delegateEvents: vi.fn(),
  getRequestEvent: () => null
}));
