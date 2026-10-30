import { createComponent } from "solid-js";
import { renderToString } from "solid-js/web";
import { A, Route, StaticRouter } from "../../src/index.jsx";

// On the server <A> takes a fast path that skips `splitProps` and the JSX spread when the
// caller passes nothing beyond the props <A> consumes itself. Anything else, `innerHTML`
// included, falls back to the spread. These cover both, and the cases where the two could
// drift apart.
function renderAt(Comp: () => any, url = "http://localhost/docs/intro"): string {
  const html = renderToString(() => (
    <StaticRouter url={url}>
      <Route path="/docs/intro" component={Comp} />
    </StaticRouter>
  ));
  const start = html.indexOf("<a");
  return (
    html
      .slice(start, html.indexOf("</a>", start) + 4)
      .replace(/ data-hk=("?)[0-9]*\1/g, "")
      // the marker serialises as `link` or `link="true"` depending on whether the element
      // has a spread; the router only ever tests for its presence
      .replace(/ link(="true")?/, " link")
      .replace(/ +>/g, ">")
  );
}

const classOf = (html: string) => /class="([^"]*)"/.exec(html)?.[1];

describe("<A> server rendering", () => {
  test("renders an inactive link", () => {
    expect(renderAt(() => <A href="/other">go</A>)).toBe(
      `<a href="/other" class="inactive" link>go</a>`
    );
  });

  test("renders an active link with aria-current", () => {
    expect(renderAt(() => <A href="/docs/intro">here</A>)).toBe(
      `<a href="/docs/intro" class=" active" link aria-current="page">here</a>`
    );
  });

  test("honours end, activeClass and inactiveClass", () => {
    expect(
      classOf(
        renderAt(() => (
          <A href="/docs" end>
            x
          </A>
        ))
      )
    ).toBe("inactive");
    expect(classOf(renderAt(() => <A href="/docs">x</A>))).toContain("active");
    expect(
      classOf(
        renderAt(() => (
          <A href="/other" activeClass="on" inactiveClass="off">
            x
          </A>
        ))
      )
    ).toBe("off");
  });

  test("folds a user class into the state class", () => {
    expect(
      classOf(
        renderAt(() => (
          <A href="/other" class="btn">
            x
          </A>
        ))
      )
    ).toBe("btn inactive");
  });

  test("omits state unless it is provided", () => {
    expect(renderAt(() => <A href="/other">x</A>)).not.toContain("state=");
    expect(
      renderAt(() => (
        <A href="/other" state={{ a: 1 }}>
          x
        </A>
      ))
    ).toContain(`state="{&quot;a&quot;:1}"`);
  });

  test("reads state once, so a getter is not observed twice", () => {
    let reads = 0;
    const props = {
      href: "/other",
      get state() {
        return { read: ++reads };
      },
      children: "x"
    };
    expect(renderAt(() => createComponent(A, props))).toContain(`state="{&quot;read&quot;:1}"`);
    expect(reads).toBe(1);
  });

  test("resolves relative hrefs and leaves external ones alone", () => {
    expect(renderAt(() => <A href="sibling">x</A>)).toContain(`href="/docs/intro/sibling"`);
    expect(renderAt(() => <A href="https://example.com">x</A>)).toContain(
      `href="https://example.com"`
    );
  });

  test("renders children, including nested elements", () => {
    expect(renderAt(() => <A href="/other">text</A>)).toContain(">text</a>");
    expect(
      renderAt(() => (
        <A href="/other">
          <span>deep</span>
        </A>
      ))
    ).toContain("<span>deep</span>");
    expect(renderAt(() => <A href="/other" />)).toContain("></a>");
  });

  test("forwards extra props via the spread path", () => {
    const html = renderAt(() => (
      <A href="/other" id="lnk" target="_blank" rel="external">
        x
      </A>
    ));
    expect(html).toContain(`id="lnk"`);
    expect(html).toContain(`target="_blank"`);
    expect(html).toContain(`rel="external"`);
    expect(html).toContain(`href="/other"`);
    expect(classOf(html)).toBe("inactive");
  });

  test("merges a classList through the spread path", () => {
    const html = renderAt(() => (
      <A href="/other" classList={{ extra: true, skipped: false }}>
        x
      </A>
    ));
    expect(classOf(html)).toBe("inactive extra");
  });

  // `innerHTML` and `textContent` only work if children stay in the spread, so the fallback
  // must not supply an explicit children expression.
  test("honours innerHTML and textContent", () => {
    expect(renderAt(() => <A href="/other" innerHTML="<b>inside</b>" />)).toContain(
      "<b>inside</b>"
    );
    expect(renderAt(() => <A href="/other" textContent="inside" />)).toContain(">inside</a>");
  });

  test("gives innerHTML precedence over children", () => {
    expect(
      renderAt(() => (
        <A href="/other" innerHTML="<b>ih</b>">
          kids
        </A>
      ))
    ).toContain("<b>ih</b>");
  });

  // Class names are keys of an object literal, so `__proto__` has to land as an own property
  // rather than reassigning a prototype.
  test.each([
    ["class", "/other"],
    ["inactiveClass", "/other"],
    // activeClass only lands on a link whose href matches the current location
    ["activeClass", "/docs/intro"]
  ] as const)("handles a __proto__ value for %s", (key, href) => {
    const html = renderAt(() => createComponent(A, { href, [key]: "__proto__", children: "x" }));
    expect(classOf(html)).toContain("__proto__");
  });

  test("handles a __proto__ key in a user classList", () => {
    const html = renderAt(() => (
      <A href="/other" classList={{ ["__proto__"]: true }}>
        x
      </A>
    ));
    expect(classOf(html)).toContain("__proto__");
  });

  // A non-enumerable own prop still reaches the element via splitProps, so the fast path
  // check must not miss it.
  test("does not drop a non-enumerable own prop", () => {
    const props: any = { href: "/other", children: "x" };
    Object.defineProperty(props, "id", { value: "hidden", enumerable: false });
    expect(renderAt(() => createComponent(A, props))).toContain(`id="hidden"`);
  });

  test("both paths agree on the state classes", () => {
    const fast = renderAt(() => <A href="/docs/intro">x</A>);
    const spread = renderAt(() => (
      <A href="/docs/intro" id="lnk">
        x
      </A>
    ));
    expect(classOf(fast)).toBe(classOf(spread));
    expect(fast.includes(`aria-current="page"`)).toBe(spread.includes(`aria-current="page"`));
  });
});
