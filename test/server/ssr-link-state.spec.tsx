// Link state in server HTML (#654), marked by the client's claim rule.
import { renderToString } from "@solidjs/web";
import { provideRequestEvent } from "@solidjs/web/storage";
import { createRouter, hashHistory } from "../../src/index.js";

const anchor = (html: string, text: string) => {
  const m = html.match(new RegExp(`<a\\b[^>]*>${text}</a>`));
  if (!m) throw new Error(`no anchor ${text} in ${html}`);
  return m[0];
};

describe("SSR link state", () => {
  const Layout = (props: any) => {
    const dynamic = () => "/users/2";
    const spread = { href: "/about?tab=x" };
    return (
      <>
        <nav>
          <a href="/">Home</a>
          <a href="/about">About</a>
          <a href="/about?tab=x">AboutTab</a>
          <a href={dynamic()}>User</a>
          <a href="/users">Users</a>
          <a {...spread}>Spread</a>
          <a href="/about" target="_blank">
            Blank
          </a>
          <a href="/about" download>
            Download
          </a>
          <a href="/about" rel="noopener external">
            External
          </a>
          <a href="/about" aria-current="step">
            Step
          </a>
          <a href="https://other.example/about">Other</a>
          <a href="mailto:a@b.c">Mail</a>
          <a href="about">Relative</a>
          <a href="/about" target="">
            EmptyTarget
          </a>
        </nav>
        {props.children}
      </>
    );
  };
  const routes = [
    {
      path: "/",
      component: Layout,
      children: [
        { path: "/", component: () => null },
        { path: "/about", component: () => null },
        { path: "/users/*", component: () => null }
      ]
    }
  ] as const;

  test("marks the current page and active prefixes", async () => {
    const Router = createRouter({ routes });
    const html = await renderToString(() => <Router url="/about" />);
    expect(anchor(html, "About")).toContain('data-active aria-current="page"');
    expect(anchor(html, "Relative")).toContain('data-active aria-current="page"');
    // an empty target is the same window, as on the client
    expect(anchor(html, "EmptyTarget")).toContain('aria-current="page"');
    // a different query is active but not the current page
    expect(anchor(html, "AboutTab")).toContain("data-active");
    expect(anchor(html, "AboutTab")).not.toContain("aria-current");
    expect(anchor(html, "Spread")).not.toContain("aria-current");
    // the root is exact-only
    expect(anchor(html, "Home")).not.toContain("data-active");
    expect(anchor(html, "User")).not.toContain("data-active");
  });

  test("dynamic, spread and prefix anchors", async () => {
    const Router = createRouter({ routes });
    let html = await renderToString(() => <Router url="/users/2/posts" />);
    expect(anchor(html, "User")).toContain("data-active");
    expect(anchor(html, "User")).not.toContain("aria-current");
    expect(anchor(html, "Users")).toContain("data-active");
    html = await renderToString(() => <Router url="/about?tab=x" />);
    expect(anchor(html, "Spread")).toContain('data-active aria-current="page"');
    expect(anchor(html, "About")).not.toContain("aria-current");
  });

  test("anchors the router does not manage stay unmarked", async () => {
    const Router = createRouter({ routes });
    const html = await renderToString(() => <Router url="/about" />);
    for (const text of ["Blank", "Download", "External", "Other", "Mail"])
      expect(anchor(html, text)).not.toMatch(/data-active|aria-current/);
    // an authored aria-current wins and the anchor gets no state at all
    expect(anchor(html, "Step")).toContain('aria-current="step"');
    expect(anchor(html, "Step")).not.toContain("data-active");
  });

  test("absolute same-origin hrefs resolve against the request URL", async () => {
    const Router = createRouter({
      routes: [
        {
          path: "/",
          component: () => (
            <>
              <a href="https://site.example/about">Same</a>
              <a href="https://other.example/about">Cross</a>
            </>
          ),
          children: [{ path: "/about", component: () => null }]
        }
      ] as const
    });
    const html = await provideRequestEvent(
      {
        request: new Request("https://site.example/about"),
        response: { headers: new Headers() },
        locals: {}
      },
      () => renderToString(() => <Router />)
    );
    expect(anchor(html, "Same")).toContain('aria-current="page"');
    expect(anchor(html, "Cross")).not.toContain("data-active");
  });

  test("explicitLinks marks only anchors with a link attribute", async () => {
    const Router = createRouter({
      explicitLinks: true,
      routes: [
        {
          path: "/about",
          component: () => (
            <>
              <a href="/about">Plain</a>
              <a href="/about" link>
                Opted
              </a>
            </>
          )
        }
      ] as const
    });
    const html = await renderToString(() => <Router url="/about" />);
    expect(anchor(html, "Plain")).not.toContain("data-active");
    expect(anchor(html, "Opted")).toContain('data-active aria-current="page"');
  });

  test("a base path covers only anchors under it", async () => {
    const Router = createRouter({
      base: "/app",
      routes: [
        {
          path: "/",
          component: (props: any) => (
            <>
              <a href="/app">Root</a>
              <a href="/app/about">About</a>
              <a href="/about">Outside</a>
              {props.children}
            </>
          ),
          children: [
            { path: "/", component: () => null },
            { path: "/about", component: () => null }
          ]
        }
      ] as const
    });
    const html = await renderToString(() => <Router url="/app/about" />);
    expect(anchor(html, "About")).toContain('aria-current="page"');
    expect(anchor(html, "Root")).not.toContain("data-active");
    expect(anchor(html, "Outside")).not.toContain("data-active");
  });

  test("hash routing marks nothing on the server", async () => {
    const Router = createRouter({
      history: hashHistory(),
      routes: [{ path: "/", component: () => <a href="#/about">Hash</a> }] as const
    });
    const html = await renderToString(() => <Router url="/" />);
    expect(anchor(html, "Hash")).not.toContain("data-active");
  });
});
