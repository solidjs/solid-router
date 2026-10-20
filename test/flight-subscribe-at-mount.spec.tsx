// Single flight belongs to the router, not the action layer: a mounted Router
// subscribes to the server function transport whether or not any action
// exists, so a server function called straight from an event handler still
// gets its revalidation and redirect applied. `singleFlight: false` never
// subscribes, and unmounting unsubscribes.
import { render } from "@solidjs/web";
import { vi } from "vitest";

const subscriptions = vi.hoisted(() => ({ active: 0, total: 0 }));
vi.mock("@solidjs/web/server-functions", async importOriginal => ({
  ...(await importOriginal<typeof import("@solidjs/web/server-functions")>()),
  subscribeFlightData: () => {
    subscriptions.active++;
    subscriptions.total++;
    return () => subscriptions.active--;
  }
}));

import { createRouter, memoryHistory } from "../src/index.js";

function mount(singleFlight?: boolean) {
  const Router = createRouter({
    history: memoryHistory(),
    singleFlight,
    routes: [{ path: "/", component: () => <div>Home</div> }]
  });
  const div = document.createElement("div");
  const dispose = render(() => <Router />, div);
  return dispose;
}

describe("flight consumer subscription", () => {
  beforeEach(() => {
    subscriptions.active = 0;
    subscriptions.total = 0;
  });

  test("a router with no actions subscribes at mount and unsubscribes on unmount", () => {
    const dispose = mount();
    expect(subscriptions.active).toBe(1);
    dispose();
    expect(subscriptions.active).toBe(0);
  });

  test("singleFlight: false never subscribes", () => {
    const dispose = mount(false);
    expect(subscriptions.total).toBe(0);
    dispose();
  });
});
