import { createRoot } from "solid-js";
import { vi } from "vitest";
import { GET, getServerFunctionMetadata } from "@solidjs/web/server-functions";
import {
  query,
  revalidate,
  cacheKeyOp,
  hashKey
} from "../../src/data/query.js";
import { createMockRouter } from "../helpers.js";

const mockRouter = createMockRouter();

vi.mock("../../src/routing.js", () => ({
  useRouter: () => mockRouter,
  useNavigate: () => vi.fn(),
  getIntent: () => "navigate",
  getInPreloadFn: () => false,
  createRouterContext: () => mockRouter,
  RouterContextObj: {},
  RouteContextObj: {},
  useRoute: () => mockRouter.base,
  useResolvedPath: () => "/",
  useHref: () => "/",
  useLocation: () => mockRouter.location,
  useRouteData: () => undefined,
  useMatch: () => null,
  useParams: () => ({}),
  useSearchParams: () => [{}, vi.fn()],
  useIsRouting: () => false,
  usePreloadRoute: () => vi.fn(),
  useBeforeLeave: () => vi.fn()
}));

describe("query", () => {
  beforeEach(() => {
    query.clear();
    vi.clearAllTimers();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  test("should create cached function with correct properties", () => {
    return createRoot(() => {
      const testFn = async (id: number) => `data-${id}`;
      const cachedFn = query(testFn, "testQuery");

      expect(typeof cachedFn).toBe("function");
      expect(cachedFn.key).toBe("testQuery");
      expect(typeof cachedFn.keyFor).toBe("function");
      expect(cachedFn.keyFor(123)).toBe("testQuery[123]");
    });
  });

  test("should cache function results", async () => {
    return createRoot(async () => {
      let callCount = 0;
      const testFn = async (id: number) => {
        callCount++;
        return `data-${id}`;
      };
      const cachedFn = query(testFn, "testQuery");

      const result1 = await cachedFn(123);
      const result2 = await cachedFn(123);

      expect(result1).toBe("data-123");
      expect(result2).toBe("data-123");
      expect(callCount).toBe(1);
    });
  });

  test("should cache different arguments separately", async () => {
    return createRoot(async () => {
      let callCount = 0;
      const testFn = async (id: number) => {
        callCount++;
        return `data-${id}`;
      };
      const cachedFn = query(testFn, "testQuery");

      const result1 = await cachedFn(123);
      const result2 = await cachedFn(456);

      expect(result1).toBe("data-123");
      expect(result2).toBe("data-456");
      expect(callCount).toBe(2);
    });
  });

  test("should handle synchronous functions", async () => {
    return createRoot(async () => {
      const testFn = (id: number) => Promise.resolve(`data-${id}`);
      const cachedFn = query(testFn, "testQuery");

      const result1 = await cachedFn(123);
      const result2 = await cachedFn(123);

      expect(result1).toBe("data-123");
      expect(result2).toBe("data-123");
    });
  });

  test("should call GET-declared server functions as-is (no property swap)", async () => {
    return createRoot(async () => {
      // a core `GET(fn)` reference already calls over GET — the reference
      // itself is the right transport, detected by metadata, not by the
      // legacy `.GET` property (which no longer exists)
      const declared = () => Promise.resolve("GET result");
      (declared as any)[Symbol.for("solid.ServerFunctionMetadata")] = { method: "GET" };
      // a leftover legacy-style property must not be consulted
      (declared as any).GET = () => Promise.resolve("wrong transport");

      const cachedFn = query(declared, "serverQuery");
      const result = await cachedFn();

      expect(result).toBe("GET result");
    });
  });

  test("auto-declares GET for undeclared server functions (query implies GET)", async () => {
    return createRoot(async () => {
      // an undeclared server-function reference (metadata brand, no method):
      // query() wraps it with core GET at creation time, so calls go out
      // over the GET transport instead of the reference's default POST
      let bodyCalled = false;
      const serverFn = (() => {
        bodyCalled = true;
        return Promise.resolve("wrong transport");
      }) as any;
      serverFn[Symbol.for("solid.ServerFunctionMetadata")] = {};
      serverFn.id = "auto-get-0";

      const seen: { url?: string; method?: string } = {};
      const originalFetch = globalThis.fetch;
      globalThis.fetch = (async (url: any, init?: RequestInit) => {
        seen.url = String(url);
        seen.method = init?.method;
        // BodyFormat.String — the transport decodes the body as plain text
        return new Response("GET result", {
          headers: { "X-Server-Function-Format": "1", "Content-Type": "text/plain" }
        });
      }) as typeof fetch;
      try {
        const cachedFn = query(serverFn, "autoGetQuery");
        const result = await cachedFn();

        expect(result).toBe("GET result");
        expect(bodyCalled).toBe(false);
        expect(seen.method).toBe("GET");
        expect(seen.url).toContain("id=auto-get-0");
        // the declaration lives on the wrapped reference; the original's
        // metadata is untouched (copy-on-declare)
        expect(getServerFunctionMetadata(serverFn)).toEqual({});
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  test("passes explicitly GET-declared references through (idempotent)", async () => {
    return createRoot(async () => {
      const ref = (() => Promise.resolve("unused")) as any;
      ref[Symbol.for("solid.ServerFunctionMetadata")] = {};
      ref.id = "explicit-get-0";
      const declared = GET(ref);
      expect(getServerFunctionMetadata(declared)?.method).toBe("GET");

      const methods: (string | undefined)[] = [];
      const originalFetch = globalThis.fetch;
      globalThis.fetch = (async (_url: any, init?: RequestInit) => {
        methods.push(init?.method);
        return new Response("ok", {
          headers: { "X-Server-Function-Format": "1", "Content-Type": "text/plain" }
        });
      }) as typeof fetch;
      try {
        const cachedFn = query(declared as any, "explicitGetQuery");
        const result = await cachedFn();

        expect(result).toBe("ok");
        // exactly one GET fetch: query used the declared reference as-is
        expect(methods).toEqual(["GET"]);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  test("leaves plain functions untouched (no GET declaration)", async () => {
    return createRoot(async () => {
      const fetchSpy = vi.fn();
      const originalFetch = globalThis.fetch;
      globalThis.fetch = fetchSpy as any;
      try {
        const plain = async () => "plain result";
        const cachedFn = query(plain, "plainQuery");
        const result = await cachedFn();

        expect(result).toBe("plain result");
        expect(fetchSpy).not.toHaveBeenCalled();
        expect(getServerFunctionMetadata(plain)).toBeUndefined();
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });
});

describe("query.get", () => {
  beforeEach(() => {
    query.clear();
  });

  test("should retrieve cached value", async () => {
    return createRoot(async () => {
      const testFn = async (id: number) => `data-${id}`;
      const cachedFn = query(testFn, "testQuery");

      await cachedFn(123);
      const cached = query.get("testQuery[123]");

      expect(cached).toBe("data-123");
    });
  });

  test("handle non-existent key gracefully", () => {
    expect(() => query.get("nonexistent")).toThrow();
  });
});

describe("query.set", () => {
  beforeEach(() => {
    query.clear();
  });

  test("should set cached value", () => {
    query.set("testKey", "test value");
    const cached = query.get("testKey");

    expect(cached).toBe("test value");
  });

  test("should update existing cached value", async () => {
    return createRoot(async () => {
      const testFn = async () => "original";
      const cachedFn = query(testFn, "testQuery");

      await cachedFn();
      query.set("testQuery[]", "updated");

      const cached = query.get("testQuery[]");
      expect(cached).toBe("updated");
    });
  });
});

describe("query.delete", () => {
  beforeEach(() => {
    query.clear();
  });

  test("should delete cached entry", async () => {
    return createRoot(async () => {
      const testFn = async () => "data";
      const cachedFn = query(testFn, "testQuery");

      await cachedFn();
      expect(query.get("testQuery[]")).toBe("data");

      query.delete("testQuery[]");
      expect(() => query.get("testQuery[]")).toThrow();
    });
  });
});

describe("query.clear", () => {
  beforeEach(() => {
    query.clear();
  });

  test("should clear all cached entries", async () => {
    return createRoot(async () => {
      const testFn1 = async () => "data1";
      const testFn2 = async () => "data2";
      const cachedFn1 = query(testFn1, "query1");
      const cachedFn2 = query(testFn2, "query2");

      await cachedFn1();
      await cachedFn2();

      expect(query.get("query1[]")).toBe("data1");
      expect(query.get("query2[]")).toBe("data2");

      query.clear();

      expect(() => query.get("query1[]")).toThrow();
      expect(() => query.get("query2[]")).toThrow();
    });
  });
});

describe("revalidate", () => {
  beforeEach(() => {
    query.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("should revalidate all cached entries when no key provided", async () => {
    return createRoot(async () => {
      let callCount = 0;
      const testFn = async () => {
        callCount++;
        return `data-${callCount}`;
      };
      const cachedFn = query(testFn, "testQuery");

      const result1 = await cachedFn();
      expect(result1).toBe("data-1");
      expect(callCount).toBe(1);

      await revalidate();
      vi.runAllTimers();

      const result2 = await cachedFn();
      expect(result2).toBe("data-2");
      expect(callCount).toBe(2);
    });
  });

  test("revalidate specific key", async () => {
    return createRoot(async () => {
      let callCount1 = 0;
      let callCount2 = 0;

      const testFn1 = async () => {
        callCount1++;
        return `data1-${callCount1}`;
      };
      const testFn2 = async () => {
        callCount2++;
        return `data2-${callCount2}`;
      };
      const willRevalidateFn = query(testFn1, "query1");
      const willNotRevalidateFn = query(testFn2, "query2");

      await willRevalidateFn();
      await willNotRevalidateFn();
      expect(callCount1).toBe(1);
      expect(callCount2).toBe(1);

      await revalidate(willRevalidateFn.key);
      vi.runAllTimers();

      await willRevalidateFn();
      await willNotRevalidateFn();
      expect(callCount1).toBe(2);
      expect(callCount2).toBe(1);
    });
  });

  test("should force a cache miss synchronously, before the transition applies (#497)", async () => {
    return createRoot(async () => {
      let callCount = 0;
      const testFn = async () => {
        callCount++;
        return `data-${callCount}`;
      };
      const cachedFn = query(testFn, "testQuery");

      const result1 = await cachedFn();
      expect(result1).toBe("data-1");

      // deliberately NOT awaited — a same-tick refetch must still see the cache miss
      const pending = revalidate(cachedFn.key);
      const result2 = await cachedFn();

      expect(result2).toBe("data-2");
      expect(callCount).toBe(2);
      await pending;
    });
  });

  test("should revalidate multiple keys", async () => {
    return createRoot(async () => {
      let callCount1 = 0;
      let callCount2 = 0;
      let callCount3 = 0;
      const testFn1 = async () => {
        callCount1++;
        return `data1-${callCount1}`;
      };
      const testFn2 = async () => {
        callCount2++;
        return `data2-${callCount2}`;
      };
      const testFn3 = async () => {
        callCount3++;
        return `data3-${callCount3}`;
      };
      const cachedFn1 = query(testFn1, "query1");
      const cachedFn2 = query(testFn2, "query2");
      const cachedFn3 = query(testFn3, "query3");

      await cachedFn1();
      await cachedFn2();
      await cachedFn3();

      await revalidate([cachedFn1.key, cachedFn3.key]);
      vi.runAllTimers();

      await cachedFn1();
      await cachedFn2();
      await cachedFn3();
      expect(callCount1).toBe(2);
      expect(callCount2).toBe(1);
      expect(callCount3).toBe(2);
    });
  });
});

describe("cacheKeyOp should", () => {
  beforeEach(() => {
    query.clear();
  });

  test("operate on all entries when no key provided", async () => {
    return createRoot(async () => {
      const testFn1 = async () => "data1";
      const testFn2 = async () => "data2";
      const cachedFn1 = query(testFn1, "query1");
      const cachedFn2 = query(testFn2, "query2");

      await cachedFn1();
      await cachedFn2();

      let operationCount = 0;
      cacheKeyOp(undefined, () => {
        operationCount++;
      });

      expect(operationCount).toBe(2);
    });
  });

  test("operate on specific key", async () => {
    return createRoot(async () => {
      const testFn = async () => "data";
      const cachedFn = query(testFn, "testQuery");

      await cachedFn();

      let operationCount = 0;
      cacheKeyOp(cachedFn.key, () => {
        operationCount++;
      });

      expect(operationCount).toBe(1);
    });
  });

  test("operate on multiple keys", async () => {
    return createRoot(async () => {
      const testFn1 = async () => "data1";
      const testFn2 = async () => "data2";
      const testFn3 = async () => "data3";
      const cachedFn1 = query(testFn1, "query1");
      const cachedFn2 = query(testFn2, "query2");
      const cachedFn3 = query(testFn3, "other");

      await cachedFn1();
      await cachedFn2();
      await cachedFn3();

      let operationCount = 0;
      cacheKeyOp([cachedFn1.key, cachedFn2.key], () => {
        operationCount++;
      });

      expect(operationCount).toBe(2);
    });
  });

  test("handle partial key matches", async () => {
    return createRoot(async () => {
      const testFn1 = async (id: number) => `data1-${id}`;
      const testFn2 = async (id: number) => `data2-${id}`;
      const cachedFn1 = query(testFn1, "query1");
      const cachedFn2 = query(testFn2, "query2");

      await cachedFn1(1);
      await cachedFn1(2);
      await cachedFn2(1);

      let operationCount = 0;
      cacheKeyOp([cachedFn1.key], () => {
        operationCount++;
      });

      expect(operationCount).toBe(2);
    });
  });
});

describe("hashKey should", () => {
  test("generate consistent hash for same input", () => {
    const hash1 = hashKey([1, "test", { key: "value" }]);
    const hash2 = hashKey([1, "test", { key: "value" }]);

    expect(hash1).toBe(hash2);
  });

  test("generate different hash for different input", () => {
    const hash1 = hashKey([1, "test"]);
    const hash2 = hashKey([2, "test"]);

    expect(hash1).not.toBe(hash2);
  });

  test("handle object key ordering consistently", () => {
    const hash1 = hashKey([{ b: 2, a: 1 }]);
    const hash2 = hashKey([{ a: 1, b: 2 }]);

    expect(hash1).toBe(hash2);
  });

  test("handle nested objects", () => {
    const hash1 = hashKey([{ outer: { b: 2, a: 1 } }]);
    const hash2 = hashKey([{ outer: { a: 1, b: 2 } }]);

    expect(hash1).toBe(hash2);
  });

  test("handle arrays", () => {
    const hash1 = hashKey([[1, 2, 3]]);
    const hash2 = hashKey([[1, 2, 3]]);
    const hash3 = hashKey([[3, 2, 1]]);

    expect(hash1).toBe(hash2);
    expect(hash1).not.toBe(hash3);
  });

  test("handle empty arguments", () => {
    const hash = hashKey([]);
    expect(typeof hash).toBe("string");
    expect(hash).toBe("[]");
  });
});
