import { flush, onCleanup } from "solid-js";
import { render } from "@solidjs/web";
import { describe, expect, it } from "vitest";
import { createRouter, useNavigate, useParams } from "../src/index.js";
import { memoryHistory } from "../src/index.js";

// Route contexts are reference-reused when the matched route definition
// (route.key) is unchanged, so the outlet's keyed Show (#588) keeps the
// subtree — a param-only navigation must never remount the component.
describe("same route, different params", () => {
  it("does not unmount/remount the route component", async () => {
    let mounts = 0;
    let cleanups = 0;
    let nav!: ReturnType<typeof useNavigate>;
    let lastId = "";

    function User() {
      nav = useNavigate();
      const params = useParams();
      mounts++;
      onCleanup(() => cleanups++);
      return <p>{(lastId = params.id as string) && params.id}</p>;
    }

    const history = memoryHistory("/user/1");
    const Router = createRouter({
      history,
      routes: [{ path: "/user/:id", component: User }]
    });

    const el = document.createElement("div");
    const dispose = render(() => <Router />, el);
    flush();
    await Promise.resolve();
    flush();
    expect(el.textContent).toBe("1");
    expect(mounts).toBe(1);

    nav("/user/2", { scroll: false });
    flush();
    await new Promise(r => setTimeout(r, 10));
    flush();

    expect(el.textContent).toBe("2");
    expect(lastId).toBe("2");
    expect(mounts).toBe(1);
    expect(cleanups).toBe(0);

    dispose();
  });
});
