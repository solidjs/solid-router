// @vitest-environment jsdom
// Settled submissions belong to the page that made them: a client navigation
// clears them (as 1.x did), committing with the navigation, while an action
// that navigates still shows its own outcome on the page it lands on.
import { createMemo, Loading } from "solid-js";
import { render } from "@solidjs/web";
import {
  createRouter,
  formAction,
  memoryHistory,
  query,
  useNavigate,
  useSubmissions
} from "../src/index.js";

const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
async function until(fn: () => boolean, timeout = 1000) {
  const start = Date.now();
  while (!fn()) {
    if (Date.now() - start > timeout) throw new Error("timed out");
    await wait(2);
  }
}

const fixtures: (() => void)[] = [];
afterEach(() => fixtures.splice(0).forEach(dispose => dispose()));

let seq = 0;
function setup(mutation: (form: FormData, nav: (to: string) => void) => Promise<unknown>) {
  const id = ++seq;
  let release!: () => void;
  const gate = new Promise<void>(r => (release = r));
  const slow = query(async () => {
    await gate;
    return "slow";
  }, `slow-${id}`);
  let nav!: (to: string) => void;
  const save = formAction((form: FormData) => mutation(form, to => nav(to)), `save-${id}`);
  const root = document.createElement("div");
  document.body.appendChild(root);

  const Page = (props: { name: string }) => (
    <form action={save} method="post">
      <input name="v" value={props.name} />
      <button type="submit">{props.name}</button>
    </form>
  );
  const Slow = () => {
    const v = createMemo(() => slow());
    return <p>{v()}</p>;
  };
  const Router = createRouter({
    routes: [
      { path: "/", component: () => <Page name="home" /> },
      { path: "/b", component: () => <Page name="b" /> },
      { path: "/slow", component: Slow }
    ] as const,
    history: memoryHistory("/")
  });
  const unmount = render(
    () => (
      <Router>
        {props => {
          const subs = useSubmissions(save);
          nav = useNavigate();
          return (
            <>
              <output>{subs.map(s => String(s.error?.message ?? s.result)).join(",")}</output>
              <Loading fallback="…">{props.children}</Loading>
            </>
          );
        }}
      </Router>
    ),
    root
  );
  fixtures.push(() => {
    unmount();
    root.remove();
  });
  return {
    root,
    shown: () => root.querySelector("output")!.textContent,
    submit: () => root.querySelector("form")!.requestSubmit(),
    nav: (to: string) => nav(to),
    release
  };
}

describe("submissions clear on navigation", () => {
  test("a navigation clears the page's settled submissions", async () => {
    const t = setup(async () => {
      throw new Error("Too short");
    });
    await until(() => !!t.root.querySelector("form"));
    t.submit();
    await until(() => t.shown() === "Too short");

    t.nav("/b");
    await until(() => t.root.querySelector("button")?.textContent === "b");
    expect(t.shown()).toBe("");
  });

  test("the clear commits with the navigation, not when it starts", async () => {
    const t = setup(async () => {
      throw new Error("Too short");
    });
    await until(() => !!t.root.querySelector("form"));
    t.submit();
    await until(() => t.shown() === "Too short");

    t.nav("/slow");
    await wait(30);
    // the old page is still on screen while the navigation is held
    expect(t.root.querySelector("button")?.textContent).toBe("home");
    expect(t.shown()).toBe("Too short");

    t.release();
    await until(() => t.root.querySelector("p")?.textContent === "slow");
    expect(t.shown()).toBe("");
  });

  test("an action that navigates keeps its own outcome", async () => {
    const t = setup(async (_form, nav) => {
      nav("/b");
      return "saved";
    });
    await until(() => !!t.root.querySelector("form"));
    t.submit();
    await until(() => t.root.querySelector("button")?.textContent === "b");
    await wait(10);
    expect(t.shown()).toBe("saved");
  });
});
