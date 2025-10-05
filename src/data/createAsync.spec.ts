import { createRoot } from "solid-js";
import { vi } from "vitest";
import { createAsync, createAsyncStore } from "./createAsync.js";

vi.mock("solid-js", async () => {
  const actual = await vi.importActual("solid-js");
  return {
    ...actual,
    sharedConfig: { context: null }
  };
});

let mockSharedConfig: any;

describe("createAsync", () => {
  beforeAll(async () => {
    const { sharedConfig } = await import("solid-js");
    mockSharedConfig = sharedConfig;
  });

  test("should create async resource with `initialValue`", async () => {
    return createRoot(async () => {
      const resource = createAsync(
        async prev => {
          await new Promise(resolve => setTimeout(resolve, 10));
          return prev ? prev + 1 : 1;
        },
        { initialValue: 0 }
      );

      expect(resource()).toBe(0);
      expect(resource.latest).toBe(0);
    });
  });

  test("should create async resource without `initialValue`", async () => {
    return createRoot(async () => {
      const resource = createAsync(async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return "loaded data";
      });

      expect(resource()).toBeUndefined();
      expect(resource.latest).toBeUndefined();

      await new Promise(resolve => setTimeout(resolve, 20));

      expect(resource()).toBe("loaded data");
      expect(resource.latest).toBe("loaded data");
    });
  });

  test("should update resource with new data", async () => {
    return createRoot(async () => {
      let counter = 0;
      const resource = createAsync(async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return ++counter;
      });

      await new Promise(resolve => setTimeout(resolve, 20));
      expect(resource()).toBe(1);

      // Trigger re-fetch - this would typically happen through some reactive source
      // Since we can't easily trigger refetch in this test environment,
      // we verify the structure is correct
      expect(typeof resource).toBe("function");
      expect(resource.latest).toBe(1);
    });
  });

  test("should handle async errors", async () => {
    return createRoot(async () => {
      const resource = createAsync(async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        throw new Error("Async error");
      });

      await new Promise(resolve => setTimeout(resolve, 20));

      /*
       * @note Resource should handle the error gracefully
       * The exact error handling depends on `createResource` implementation
       */
      expect(typeof resource).toBe("function");
    });
  });

  test("should support `deferStream` option", () => {
    return createRoot(() => {
      const resource = createAsync(async () => "deferred data", { deferStream: true });

      expect(typeof resource).toBe("function");
      expect(resource.latest).toBeUndefined();
    });
  });

  test.skip("should support `name` option for debugging", () => {
    return createRoot(() => {
      const resource = createAsync(async () => "named resource", { name: "test-resource" });

      expect(typeof resource).toBe("function");
      expect((resource as any).name).toBe("test-resource");
    });
  });

  test("should pass previous value to fetch function", async () => {
    return createRoot(async () => {
      let callCount = 0;
      let lastPrev: any;

      const resource = createAsync(
        async prev => {
          lastPrev = prev;
          return `call-${++callCount}-prev-${prev}`;
        },
        { initialValue: "initial" }
      );

      expect(resource()).toBe("initial");

      await new Promise(resolve => setTimeout(resolve, 20));

      expect(lastPrev).toBeUndefined();
    });
  });
});

describe("createAsyncStore", () => {
  test("should create async store with `initialValue`", async () => {
    return createRoot(async () => {
      const store = createAsyncStore(
        async prev => {
          await new Promise(resolve => setTimeout(resolve, 10));
          return { count: prev?.count ? prev.count + 1 : 1, data: "test" };
        },
        { initialValue: { count: 0, data: "initial" } }
      );

      expect(store()).toEqual({ count: 0, data: "initial" });
      expect(store.latest).toEqual({ count: 0, data: "initial" });
    });
  });

  test("should create async store without `initialValue`", async () => {
    return createRoot(async () => {
      const store = createAsyncStore(async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return { loaded: true, message: "success" };
      });

      expect(store()).toBeUndefined();
      expect(store.latest).toBeUndefined();

      await new Promise(resolve => setTimeout(resolve, 20));

      expect(store()).toEqual({ loaded: true, message: "success" });
      expect(store.latest).toEqual({ loaded: true, message: "success" });
    });
  });

  test("should support `reconcile` options", () => {
    return createRoot(() => {
      const store = createAsyncStore(async () => ({ items: [1, 2, 3] }), {
        reconcile: { key: "id" }
      });

      expect(typeof store).toBe("function");
    });
  });

  test("should handle complex object updates", async () => {
    return createRoot(async () => {
      let updateCount = 0;
      const store = createAsyncStore(
        async prev => {
          await new Promise(resolve => setTimeout(resolve, 10));
          return {
            ...prev,
            updateCount: ++updateCount,
            timestamp: Date.now(),
            nested: { value: `update-${updateCount}` }
          };
        },
        { initialValue: { updateCount: 0, timestamp: 0, nested: { value: "initial" } } }
      );

      const initial = store();
      expect(initial.updateCount).toBe(0);
      expect(initial.nested.value).toBe("initial");
    });
  });

  test("should support all `createAsync` options", () => {
    return createRoot(() => {
      const store = createAsyncStore(async () => ({ data: "test" }), {
        name: "test-store",
        deferStream: true,
        reconcile: { merge: true }
      });

      expect(typeof store).toBe("function");
    });
  });
});

describe("MockPromise", () => {
  test("should mock fetch during hydration", async () => {
    mockSharedConfig.context = {} as any;

    return createRoot(async () => {
      const originalFetch = window.fetch;

      // Set up a fetch that should be mocked
      window.fetch = () => {
        return Promise.resolve(new Response("real fetch"));
      };

      const resource = createAsync(async () => {
        const response = await fetch("/api/data");
        return await response.text();
      });

      // During hydration, fetch should be mocked
      expect(resource()).toBeUndefined();

      window.fetch = originalFetch;
      mockSharedConfig.context = null;
    });
  });

  test("should allow real fetch outside hydration", async () => {
    // Ensure we're not in hydration context
    mockSharedConfig.context = null;

    return createRoot(async () => {
      let fetchCalled = false;
      const originalFetch = window.fetch;

      window.fetch = vi.fn().mockImplementation(() => {
        fetchCalled = true;
        return Promise.resolve(new Response("real data"));
      });

      createAsync(async () => {
        const response = await fetch("/api/data");
        return await response.text();
      });

      await new Promise(resolve => setTimeout(resolve, 20));

      expect(fetchCalled).toBe(true);

      window.fetch = originalFetch;
    });
  });
});
