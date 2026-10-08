// @vitest-environment jsdom
import { vi } from "vitest";
import { render } from "solid-js/web";
import { A, MemoryRouter, Route, createMemoryHistory, useNavigate } from "../src/index.jsx";

// jsdom has no scrollTo, and navigating triggers the router's scroll handling
window.scrollTo = vi.fn() as any;

function mount(url: string, Comp: () => any) {
  const history = createMemoryHistory();
  history.set({ value: url });
  const root = document.createElement("div");
  document.body.appendChild(root);
  const dispose = render(
    () => (
      <MemoryRouter history={history}>
        <Route path="/docs/intro" component={Comp} />
        <Route path="/other" component={Comp} />
      </MemoryRouter>
    ),
    root
  );
  return {
    anchor: () => root.querySelector("a")!,
    dispose: () => {
      dispose();
      root.remove();
    }
  };
}

// Client behaviour of <A>. The server only fast path is covered in test/ssr/anchor.spec.tsx;
// everything here goes through the `splitProps` + spread path, as it does in a browser.
describe("<A>", () => {
  test("resolves href and marks itself inactive", () => {
    const { anchor, dispose } = mount("/docs/intro", () => <A href="/other">go</A>);
    expect(anchor().getAttribute("href")).toBe("/other");
    expect(anchor().className).toBe("inactive");
    expect(anchor().hasAttribute("aria-current")).toBe(false);
    expect(anchor().hasAttribute("link")).toBe(true);
    expect(anchor().textContent).toBe("go");
    dispose();
  });

  test("marks itself active on an exact match", () => {
    const { anchor, dispose } = mount("/docs/intro", () => <A href="/docs/intro">here</A>);
    expect(anchor().className).toBe("active");
    expect(anchor().getAttribute("aria-current")).toBe("page");
    dispose();
  });

  test("marks itself active for a parent path unless end is set", () => {
    const parent = mount("/docs/intro", () => <A href="/docs">parent</A>);
    expect(parent.anchor().className).toBe("active");
    expect(parent.anchor().hasAttribute("aria-current")).toBe(false);
    parent.dispose();

    const end = mount("/docs/intro", () => (
      <A href="/docs" end>
        parent
      </A>
    ));
    expect(end.anchor().className).toBe("inactive");
    end.dispose();
  });

  test("ignores trailing slashes and case when matching", () => {
    const slash = mount("/docs/intro", () => <A href="/docs/intro/">x</A>);
    expect(slash.anchor().className).toBe("active");
    slash.dispose();

    const upper = mount("/docs/intro", () => <A href="/DOCS/Intro">x</A>);
    expect(upper.anchor().className).toBe("active");
    upper.dispose();
  });

  test("honours activeClass and inactiveClass", () => {
    const off = mount("/docs/intro", () => (
      <A href="/other" activeClass="on" inactiveClass="off">
        x
      </A>
    ));
    expect(off.anchor().className).toBe("off");
    off.dispose();

    const on = mount("/docs/intro", () => (
      <A href="/docs/intro" activeClass="on" inactiveClass="off">
        x
      </A>
    ));
    expect(on.anchor().className).toBe("on");
    on.dispose();
  });

  test("keeps a user supplied class alongside the active state class", () => {
    const { anchor, dispose } = mount("/docs/intro", () => (
      <A href="/other" class="btn">
        x
      </A>
    ));
    expect(anchor().classList.contains("btn")).toBe(true);
    expect(anchor().classList.contains("inactive")).toBe(true);
    dispose();
  });

  test("merges a user supplied classList", () => {
    const { anchor, dispose } = mount("/docs/intro", () => (
      <A href="/other" classList={{ extra: true, skipped: false }}>
        x
      </A>
    ));
    expect(anchor().classList.contains("extra")).toBe(true);
    expect(anchor().classList.contains("skipped")).toBe(false);
    expect(anchor().classList.contains("inactive")).toBe(true);
    dispose();
  });

  test("serialises state only when it is provided", () => {
    const without = mount("/docs/intro", () => <A href="/other">x</A>);
    expect(without.anchor().hasAttribute("state")).toBe(false);
    without.dispose();

    const withState = mount("/docs/intro", () => (
      <A href="/other" state={{ a: 1 }}>
        x
      </A>
    ));
    expect(withState.anchor().getAttribute("state")).toBe(JSON.stringify({ a: 1 }));
    withState.dispose();
  });

  test("forwards unknown props to the anchor", () => {
    const { anchor, dispose } = mount("/docs/intro", () => (
      <A href="/other" id="lnk" target="_blank" rel="external" aria-label="go">
        x
      </A>
    ));
    expect(anchor().id).toBe("lnk");
    expect(anchor().getAttribute("target")).toBe("_blank");
    expect(anchor().getAttribute("rel")).toBe("external");
    expect(anchor().getAttribute("aria-label")).toBe("go");
    expect(anchor().getAttribute("href")).toBe("/other");
    expect(anchor().className).toBe("inactive");
    dispose();
  });

  test("forwards the router's own passthrough attributes", () => {
    const { anchor, dispose } = mount("/docs/intro", () => (
      <A href="/other" replace noScroll preload={false}>
        x
      </A>
    ));
    expect(anchor().hasAttribute("replace")).toBe(true);
    expect(anchor().hasAttribute("noScroll")).toBe(true);
    expect(anchor().getAttribute("preload")).toBe("false");
    dispose();
  });

  test("resolves a relative href against the current route", () => {
    const { anchor, dispose } = mount("/docs/intro", () => <A href="sibling">x</A>);
    expect(anchor().getAttribute("href")).toBe("/docs/intro/sibling");
    dispose();
  });

  test("leaves an external href untouched", () => {
    const { anchor, dispose } = mount("/docs/intro", () => <A href="https://example.com">x</A>);
    expect(anchor().getAttribute("href")).toBe("https://example.com");
    dispose();
  });

  test("renders nested children", () => {
    const { anchor, dispose } = mount("/docs/intro", () => (
      <A href="/other">
        <span>deep</span>
      </A>
    ));
    expect(anchor().querySelector("span")!.textContent).toBe("deep");
    dispose();
  });

  // upstream inserts children through the spread, so a `ref` runs after they are in place
  test("a ref sees the children already inserted", () => {
    let seen: string | undefined;
    const { dispose } = mount("/docs/intro", () => (
      <A href="/other" ref={(el: HTMLAnchorElement) => (seen = el.textContent ?? undefined)}>
        child
      </A>
    ));
    expect(seen).toBe("child");
    dispose();
  });

  test.each([
    ["no extra props", () => <A href="/other">x</A>],
    [
      "with extra props",
      () => (
        <A href="/other" id="lnk">
          x
        </A>
      )
    ]
  ])("updates the active class on navigation (%s)", async (_name, Link) => {
    let navigate!: ReturnType<typeof useNavigate>;
    const Page = () => {
      navigate = useNavigate();
      return Link();
    };
    const { anchor, dispose } = mount("/docs/intro", Page);

    expect(anchor().className).toBe("inactive");
    expect(anchor().hasAttribute("aria-current")).toBe(false);

    navigate("/other");
    await vi.waitFor(() => expect(anchor().className).toBe("active"));

    expect(anchor().getAttribute("aria-current")).toBe("page");

    dispose();
  });
});
