import { createRoot } from "solid-js";
import { vi } from "vitest";
import { query, revalidate } from "../../src/data/query.js";
import { createMockRouter } from "../helpers.js";

const mockRouter = createMockRouter();

vi.mock("../../src/routing.js", () => ({
  useRouter: () => mockRouter,
  getIntent: () => "navigate",
  getInPreloadFn: () => false
}));

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>(r => (resolve = r));
  return { promise, resolve };
}

describe("query.get after overlapping fetches", () => {
  beforeEach(() => query.clear());

  test("a superseded fetch resolving late does not overwrite the newer value", async () => {
    const calls: ReturnType<typeof deferred<string>>[] = [];
    const q = query(() => {
      const d = deferred<string>();
      calls.push(d);
      return d.promise;
    }, "race");
    await createRoot(async dispose => {
      const first = q();
      revalidate(q.key);
      const second = q();
      expect(calls.length).toBe(2);
      calls[1].resolve("new");
      expect(await second).toBe("new");
      calls[0].resolve("old");
      await first;
      expect(query.get(q.keyFor())).toBe("new");
      dispose();
    });
  });

  test("query.set during an in-flight fetch is not overwritten by the fetch", async () => {
    const d = deferred<string>();
    const q = query(() => d.promise, "raceSet");
    await createRoot(async dispose => {
      const read = q();
      query.set(q.keyFor(), "set-value");
      d.resolve("fetched-before-set");
      await read;
      expect(query.get(q.keyFor())).toBe("set-value");
      dispose();
    });
  });
});
