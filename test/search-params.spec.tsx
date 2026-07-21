import { render } from "@solidjs/web";
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
});
