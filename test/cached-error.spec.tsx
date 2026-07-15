// @vitest-environment jsdom
import { ErrorBoundary, Suspense, type ParentProps } from "solid-js";
import { render } from "solid-js/web";
import {
  MemoryRouter,
  Route,
  createMemoryHistory,
  query,
  createAsync,
  useNavigate
} from "../src/index.jsx";

const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

describe("#385 error from cached preload as value", () => {
  test("error stays an error on cache-hit renders", async () => {
    const failing = query(async () => {
      throw new Error("boom-385");
    }, "failing385");

    let nav!: ReturnType<typeof useNavigate>;
    const rendered: any[] = [];

    const Test = () => {
      const data = createAsync(() => failing());
      return (
        <span>
          {(() => {
            const v = data();
            rendered.push(v);
            return `value:${String(v)}`;
          })()}
        </span>
      );
    };
    const Layout = (props: ParentProps) => {
      nav = useNavigate();
      return <div>{props.children}</div>;
    };

    const history = createMemoryHistory();
    history.set({ value: "/test" });
    const root = document.createElement("div");
    const dispose = render(
      () => (
        <MemoryRouter
          history={history}
          root={props => (
            <Layout>
              <ErrorBoundary fallback={err => <p>caught:{err.message}</p>}>
                <Suspense>{props.children}</Suspense>
              </ErrorBoundary>
            </Layout>
          )}
        >
          <Route path="/" component={() => <span>home</span>} />
          <Route path="/test" component={Test} preload={() => failing()} />
        </MemoryRouter>
      ),
      root
    );

    await wait(50);
    expect(root.innerHTML).toContain("caught:boom-385");

    // navigate away and back within the cache window — the cached rejected
    // promise is served from cache on the return trip
    nav("/", { scroll: false });
    await wait(50);
    expect(root.innerHTML).toContain("home");

    nav("/test", { scroll: false });
    await wait(50);

    // the error must surface via the boundary, never as a resolved value
    expect(rendered.filter(v => v !== undefined)).toEqual([]);
    expect(root.innerHTML).toContain("caught:boom-385");

    dispose();
  });
});
