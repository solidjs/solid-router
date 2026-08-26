import { flush } from "solid-js";
import { render, redirect, isHref } from "@solidjs/web";
import { beforeEach, describe, expect, it } from "vitest";
import { createRouter, hashHistory, useNavigate, useLocation } from "../src/index.js";

// #582: paths() output under hashHistory is a display href (`#/page1`), but
// navigate()/redirect() speak logical paths. Nodes carry their logical path
// under the global Href brand; display strings (terminated paths calls,
// redirect Location headers) start with `#` and are mapped back through
// parsePath. Raw user strings are logical paths and are never parsed.
describe("hashHistory navigation (#582)", () => {
  const settle = async () => {
    flush();
    await new Promise(r => setTimeout(r, 10));
    flush();
  };

  let nav!: ReturnType<typeof useNavigate>;
  let location!: ReturnType<typeof useLocation>;
  let el: HTMLDivElement;
  let dispose: () => void;
  let paths: any;

  const setup = async () => {
    window.location.hash = "#/";
    const Home = () => {
      nav = useNavigate();
      location = useLocation();
      return <p>home</p>;
    };
    const Page1 = () => {
      nav = useNavigate();
      location = useLocation();
      return <p>page1</p>;
    };
    const Router = createRouter({
      history: hashHistory(),
      routes: [
        { path: "/", component: Home },
        { path: "/page1", component: Page1 }
      ]
    });
    paths = Router.paths;
    el = document.createElement("div");
    dispose = render(() => <Router />, el);
    await settle();
    expect(el.textContent).toBe("home");
  };

  beforeEach(async () => {
    await setup();
  });

  it("navigates with a paths node (logical path via the Href brand)", async () => {
    expect(`${paths.page1}`).toBe("#/page1");
    nav(paths.page1, { scroll: false });
    await settle();
    expect(el.textContent).toBe("page1");
    expect(window.location.hash).toBe("#/page1");
    dispose();
  });

  it("navigates with a terminated paths call (display string with search)", async () => {
    const target = paths.page1({ q: "1" });
    expect(target).toBe("#/page1?q=1");
    nav(target, { scroll: false });
    await settle();
    expect(el.textContent).toBe("page1");
    expect(location.search).toBe("?q=1");
    expect(window.location.hash).toBe("#/page1?q=1");
    dispose();
  });

  it("navigates with a plain logical path string", async () => {
    nav("/page1", { scroll: false });
    await settle();
    expect(el.textContent).toBe("page1");
    expect(window.location.hash).toBe("#/page1");
    dispose();
  });

  it("keeps in-page anchors on the current route", async () => {
    nav("#section", { scroll: false });
    await settle();
    expect(el.textContent).toBe("home");
    expect(location.hash).toBe("#section");
    dispose();
  });

  it("round-trips a redirect(paths node) Location header", async () => {
    // the brand keeps redirect() from throwing; whatever form the Location
    // header carries (display today, logical once @solidjs/web unwraps the
    // brand) must route — this is the client leg of an action redirect
    expect(isHref(paths.page1)).toBe(true);
    const res = redirect(paths.page1);
    const target = res.headers.get("Location")!;
    nav(target, { scroll: false });
    await settle();
    expect(el.textContent).toBe("page1");
    expect(window.location.hash).toBe("#/page1");
    dispose();
  });
});
