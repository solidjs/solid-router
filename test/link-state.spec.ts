import { claimElementTree } from "@solidjs/web";
import { createRoot, createSignal } from "solid-js";
import { setupLinkClaims } from "../src/claims.js";
import { createRouter, hashHistory, useLinkState } from "../src/index.js";
import { createRouterContext, RouterContextObj } from "../src/routing.js";
import type { LocationChange } from "../src/types.js";

describe("hash-history link state", () => {
  const page = window.location.href;
  afterEach(() => window.history.replaceState(null, "", page));

  test.each(["/", "/applications"])("claims logical targets at %s", pathname => {
    window.history.replaceState(null, "", "/#/" + pathname.slice(1));
    createRoot(dispose => {
      try {
        const signal = createSignal<LocationChange>({ value: pathname }, { ownedWrite: true });
        const router = createRouterContext({ signal, utils: hashHistory().utils }, () => []);
        const targets: (string | undefined)[] = [];
        setupLinkClaims(router, false, () => ({
          track: () => true,
          pending: target => {
            targets.push(target);
            return target === "/applications";
          }
        }));
        const links = ["#/", "#/applications"].map(href => {
          const anchor = document.createElement("a");
          anchor.setAttribute("href", href);
          claimElementTree(anchor);
          return anchor;
        });
        expect(targets).toEqual(["/", "/applications"]);
        for (const [index, anchor] of links.entries()) {
          const current = index === (pathname === "/" ? 0 : 1);
          expect(anchor.hasAttribute("data-active")).toBe(current);
          expect(anchor.getAttribute("aria-current")).toBe(current ? "page" : null);
          expect(anchor.hasAttribute("data-pending")).toBe(index === 1);
        }
        links[0].setAttribute("href", "#/applications");
        claimElementTree(links[0]);
        expect(links[0].hasAttribute("data-active")).toBe(pathname === "/applications");
      } finally {
        dispose();
      }
    });
  });

  test.each(["", "/app"])(
    "resolves hook display strings without changing logical paths (base %s)",
    base => {
      window.history.replaceState(null, "", `${base || "/"}#${base}/applications`);
      createRoot(dispose => {
        try {
          const history = hashHistory();
          const Router = createRouter({
            base,
            history,
            routes: [{ path: "/" }, { path: "/applications" }]
          });
          const signal = createSignal<LocationChange>(
            { value: `${base}/applications?b=2&a=1` },
            { ownedWrite: true }
          );
          const router = createRouterContext(
            { signal, utils: history.utils },
            () => [],
            undefined,
            {
              base
            }
          );
          let links!: ReturnType<typeof useLinkState>[];
          let home!: ReturnType<typeof useLinkState>;
          let node!: ReturnType<typeof useLinkState>;
          const context = RouterContextObj({
            value: router,
            get children() {
              const hrefs = [
                Router.paths.applications({ a: "1", b: "2" }, "section"),
                `#${base}/applications?a=1&b=2#section`,
                `${base}/applications?a=1&b=2#section`,
                "applications?a=1&b=2#section"
              ];
              links = hrefs.map(href => useLinkState(() => href));
              home = useLinkState(() => Router.paths());
              node = useLinkState(() => Router.paths.applications);
              return null;
            }
          }) as () => unknown;
          context();
          for (const link of links) {
            expect(link.current()).toBe(true);
            expect(link.active()).toBe(true);
          }
          expect(home.current()).toBe(false);
          expect(home.active()).toBe(false);
          expect(node.current()).toBe(false);
          expect(node.active()).toBe(true);
        } finally {
          dispose();
        }
      });
    }
  );
});
