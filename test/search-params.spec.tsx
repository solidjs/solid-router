import { render } from "@solidjs/web";
import { createMemo } from "solid-js";
import { vi } from "vitest";
import { createRouter, memoryHistory, useSearchParams, useNavigate, useLocation } from "../src/index.js";
import type { Location, Navigator } from "../src/index.js";
import { awaitPromise } from "./helpers.js";

describe("useSearchParams", () => {
  test("two synchronous setSearchParams calls both apply", async () => {
    let set!: ReturnType<typeof useSearchParams>[1];
    let params!: ReturnType<typeof useSearchParams>[0];

    const Index = () => {
      [params, set] = useSearchParams();
      return null;
    };

    const Router = createRouter({
      routes: [{ path: "/", component: Index }] as const,
      history: memoryHistory()
    });

    const dispose = render(() => <Router />, document.body);

    try {
      set({ a: "1" });
      set({ b: "2" });
      await awaitPromise();
      expect(params.a).toBe("1");
      expect(params.b).toBe("2");
    } finally {
      document.body.innerHTML = "";
      dispose();
    }
  });

  test("setSearchParams during a pending navigation applies to the target route", async () => {
    let set!: ReturnType<typeof useSearchParams>[1];
    let navigate!: Navigator;
    let location!: Location;

    const Index = () => {
      [, set] = useSearchParams();
      navigate = useNavigate();
      location = useLocation();
      return null;
    };

    const Router = createRouter({
      routes: [
        { path: "/", component: Index },
        { path: "/other", component: () => null }
      ] as const,
      history: memoryHistory()
    });

    const dispose = render(() => <Router />, document.body);

    try {
      await awaitPromise();
      navigate("/other", { scroll: false });
      set({ a: "1" });
      await awaitPromise();
      expect(location.pathname).toBe("/other");
      expect(location.search).toBe("?a=1");
    } finally {
      document.body.innerHTML = "";
      dispose();
    }
  });

  test("pathname or hash navigation with the same search keeps query consumers stable", async () => {
    let navigate!: Navigator;
    let location!: Location;
    let snapshot!: () => Record<string, any>;
    let runs = 0;

    const Page = () => {
      navigate = useNavigate();
      location = useLocation();
      snapshot = createMemo(() => {
        runs++;
        return { ...location.query };
      });
      return null;
    };

    const history = memoryHistory("/one?tag=a&tag=b&empty=#start");
    const Router = createRouter({
      routes: [{ path: "/*rest", component: Page }] as const,
      history
    });

    const dispose = render(() => <Router />, document.body);

    try {
      await vi.waitFor(() => expect(location.pathname).toBe("/one"));
      const query = location.query;
      const first = snapshot();
      expect(first).toEqual({ tag: ["a", "b"], empty: "" });
      expect(runs).toBe(1);

      navigate("/two?tag=a&tag=b&empty=#start", { scroll: false });
      await vi.waitFor(() => expect(location.pathname).toBe("/two"));
      expect(snapshot()).toBe(first);
      expect(location.query.tag).toBe(first.tag);

      navigate("/two?tag=a&tag=b&empty=#end", { scroll: false });
      await vi.waitFor(() => expect(location.hash).toBe("#end"));
      expect(snapshot()).toBe(first);
      expect(location.query.tag).toBe(first.tag);
      expect(runs).toBe(1);

      navigate("/two?tag=c#end", { scroll: false });
      await vi.waitFor(() => expect(snapshot()).toEqual({ tag: "c" }));
      expect(runs).toBe(2);

      history.back();
      await vi.waitFor(() => expect(location.search).toBe("?tag=a&tag=b&empty="));
      expect(snapshot()).toEqual({ tag: ["a", "b"], empty: "" });

      history.forward();
      await vi.waitFor(() => expect(location.search).toBe("?tag=c"));
      expect(snapshot()).toEqual({ tag: "c" });
      expect(location.query).toBe(query);
    } finally {
      document.body.innerHTML = "";
      dispose();
    }
  });
});
