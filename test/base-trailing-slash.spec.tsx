import { render } from "@solidjs/web";
import { vi } from "vitest";
import { createRouter, memoryHistory, useNavigate, type Navigator } from "../src/index.js";

const settle = async () => {
  await new Promise<void>(r => queueMicrotask(() => r()));
  await new Promise(r => setTimeout(r, 0));
};

// `base: import.meta.env.BASE_URL` (Vite) carries a trailing slash, eg. "/app/".
describe("base with a trailing slash", () => {
  beforeEach(() => {
    window.scrollTo = vi.fn();
  });

  test("paths proxy builds single-slash hrefs", () => {
    const Router = createRouter({
      routes: [{ path: "/" }, { path: "/about" }] as const,
      base: "/app/",
      history: memoryHistory("/app/")
    });
    expect(String(Router.paths.about)).toBe("/app/about");
  });

  test("match() resolves under the base", () => {
    const Router = createRouter({
      routes: [{ path: "/" }, { path: "/about" }] as const,
      base: "/app/"
    });
    expect(Router.match("/app/about").map(m => m.match)).toEqual(["/app/about"]);
  });

  test("a base with a scheme is still rejected", () => {
    const Router = createRouter({
      routes: [{ path: "/" }] as const,
      base: "https://example.com/app/",
      history: memoryHistory("/")
    });
    const div = document.createElement("div");
    expect(() => render(() => <Router />, div)).toThrow(/not a valid base path/);
  });

  test("navigate('/about') lands on the about route", async () => {
    const div = document.createElement("div");
    document.body.appendChild(div);
    const history = memoryHistory("/app/");
    let navigate!: Navigator;
    const Router = createRouter({
      routes: [
        {
          path: "/",
          component: () => {
            navigate = useNavigate();
            return <div data-route="home" />;
          }
        },
        { path: "/about", component: () => <div data-route="about" /> }
      ] as const,
      base: "/app/",
      history
    });
    const dispose = render(() => <Router />, div);
    try {
      expect(div.querySelector('[data-route="home"]')).not.toBeNull();
      navigate("/about");
      await settle();
      expect(history.get()).toBe("/app/about");
      expect(div.querySelector('[data-route="about"]')).not.toBeNull();
    } finally {
      dispose();
      div.remove();
    }
  });
});
