// Typed path nodes as `href` during SSR: the server runtime stringifies
// URL-bearing objects on the attribute, so anchors carry the built URL in
// markup with no claim machinery involved (server claims are no-ops).
import { renderToString } from "@solidjs/web";
import { createRouter } from "../../src/index.js";

describe("SSR anchors", () => {
  const Router = createRouter({
    routes: [
      { path: "/", component: () => null },
      {
        path: "/users/:id",
        component: (props: any) => props.children,
        children: [{ path: "/settings", component: () => null }]
      }
    ] as const
  });

  test("typed path nodes stringify on href", async () => {
    const html = await renderToString(() => (
      <nav>
        <a href={Router.paths.users(2)}>User</a>
        <a href={Router.paths.users(2).settings}>Settings</a>
        <a href={Router.paths.users(2, { tab: "x" }, "comments")}>Deep</a>
      </nav>
    ));
    expect(html).toContain('href="/users/2"');
    expect(html).toContain('href="/users/2/settings"');
    expect(html).toContain('href="/users/2?tab=x#comments"');
  });
});
