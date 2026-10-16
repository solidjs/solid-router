// Observe tier: query() stamps the fetch it starts, and every wrapper it
// hands a reader, with when that fetch started (`OBSERVE.attribution
// .markFlight`). A route's preload starts the fetch; the page reads it a
// render pass later (behind its lazy chunk) through a fresh `.then` wrapper,
// and without the stamp both waterfall checks — the client's ASYNC_WATERFALL
// and the server's SSR_BOUNDARY_WATERFALL — read that wrapper as work that
// only started then (solid #4105).
import { OBSERVE, createRoot } from "solid-js";
import { vi } from "vitest";
import { query } from "../../src/data/query.js";
import { createMockRouter } from "../helpers.js";

const mockRouter = createMockRouter();
let intent: string | undefined = "preload";

vi.mock("../../src/routing.js", () => ({
  useRouter: () => mockRouter,
  getIntent: () => intent,
  getInPreloadFn: () => false
}));

// The slot's stamp functions, as a solid-js that carries them provides; the
// test owns the map so it can read the stamps back.
type Slot = {
  markFlight?: (flight: object, startedAt?: number) => void;
  flightOrigin?: (flight: object) => number | undefined;
};
const slot = OBSERVE!.attribution as Slot;
const saved = { markFlight: slot.markFlight, flightOrigin: slot.flightOrigin };
let origins: WeakMap<object, number>;
let clock = 0;

beforeEach(() => {
  query.clear();
  origins = new WeakMap();
  clock = 100;
  slot.markFlight = (flight, startedAt = clock) => {
    if (!(origins.get(flight)! <= startedAt)) origins.set(flight, startedAt);
  };
  slot.flightOrigin = flight => origins.get(flight);
});
afterEach(() => {
  slot.markFlight = saved.markFlight;
  slot.flightOrigin = saved.flightOrigin;
  intent = "preload";
});

describe("query() stamps the flights it hands out", () => {
  test("a later read's wrapper carries the start of the fetch the preload began", async () => {
    let fetches = 0;
    const getUser = query(async (id: string) => {
      fetches++;
      return { id };
    }, "flightUser");

    // The preload starts the fetch at t=100 and hands back the raw promise.
    const preloaded = createRoot(() => getUser("1"));
    expect(origins.get(preloaded)).toBe(100);

    // The page reads it later, through a fresh settle wrapper.
    clock = 250;
    intent = "navigate";
    const read = createRoot(() => getUser("1"));
    expect(fetches).toBe(1);
    expect(read).not.toBe(preloaded);
    expect(origins.get(read)).toBe(100);
    await expect(read).resolves.toEqual({ id: "1" });
  });

  test("a fresh fetch read straight away is stamped when it started", () => {
    intent = "navigate";
    const getPost = query(async (id: string) => ({ id }), "flightPost");
    const read = createRoot(() => getPost("7"));
    expect(origins.get(read)).toBe(100);
  });

  test("a solid-js without the stamp functions is left alone", () => {
    slot.markFlight = undefined;
    slot.flightOrigin = undefined;
    intent = "navigate";
    const getPost = query(async (id: string) => ({ id }), "flightOld");
    expect(() => createRoot(() => getPost("1"))).not.toThrow();
  });
});
