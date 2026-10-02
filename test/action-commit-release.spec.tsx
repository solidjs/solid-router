// @vitest-environment jsdom
/**
 * #649: a router action's busy state, settled hooks and submission record
 * release when the action's transition COMMITS — not when its body returns.
 * The body's final slice can start reads (the default revalidation's refetch,
 * a redirect target's data) that hold the transition with the old UI still on
 * screen; until that commits, the form stays `aria-busy`, hooks haven't run
 * and the submission hasn't rendered. Busy state is keyed by the form's action
 * URL, so a morph that strips the attribute or a re-render that replaces the
 * form element gets it back on (re-)claim.
 */
import { action, createMemo, createSignal, For, Loading, Show } from "solid-js";
import { claimElement, redirect, render } from "@solidjs/web";
import {
  action as routerAction,
  createRouter,
  memoryHistory,
  query,
  useAction,
  useSubmissions
} from "../src/index.js";
import type { Submission } from "../src/index.js";

type Deferred<T = void> = {
  promise: Promise<T>;
  resolve: (v: T) => void;
  reject: (e: unknown) => void;
};
const deferred = <T = void,>(): Deferred<T> => {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => ((resolve = res), (reject = rej)));
  return { promise, resolve, reject };
};
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
async function until(fn: () => boolean, timeout = 1000) {
  const start = Date.now();
  while (!fn()) {
    if (Date.now() - start > timeout) throw new Error("timed out");
    await wait(2);
  }
}

let seq = 0;

/**
 * A list fed by a query, and a form posting to an action whose mutation is
 * gated per submission. The action returns a value without flight data, so
 * the default revalidation refetches the list inside the action's
 * transition; `holdRefetch()` gates that refetch, holding the commit.
 */
function setup(
  options: {
    mutation?: (text: string, gate: Promise<unknown>) => Promise<unknown>;
    formAttrs?: Record<string, string>;
    onSubmit?: () => void;
  } = {}
) {
  const id = ++seq;
  const db = ["a"];
  let refetchGate: Deferred | undefined;
  const mutationGates: Deferred<unknown>[] = [];
  const getItems = query(async () => {
    if (refetchGate) await refetchGate.promise;
    return [...db];
  }, `items-649-${id}`);
  const add = routerAction(async (form: FormData) => {
    const gate = deferred<unknown>();
    mutationGates.push(gate);
    const text = String(form.get("text"));
    if (options.mutation) return options.mutation(text, gate.promise);
    const result = await gate.promise;
    db.push(text);
    return result;
  }, `add-649-${id}`);

  const log: string[] = [];
  const settled: Submission<any, any>[] = [];
  const root = document.createElement("div");
  document.body.appendChild(root);
  const rows = () => root.querySelectorAll("li").length;
  const form = () => root.querySelector("form")!;
  const busy = (el: HTMLFormElement = form()) => el.getAttribute("aria-busy");
  const [replaced, setReplaced] = createSignal(false);

  const List = () => {
    const items = createMemo(() => getItems());
    const subs = useSubmissions(add);
    options.onSubmit && add.onSubmit(options.onSubmit);
    add.onSettled(s => {
      settled.push(s);
      log.push(`settled result=${s.result} rows=${rows()}`);
    });
    const Form = (props: { gen: string }) => (
      <form action={add} method="post" data-gen={props.gen} {...options.formAttrs}>
        <input name="text" value="b" />
        <button type="submit">add</button>
      </form>
    );
    return (
      <>
        <ul>
          <For each={items()}>{item => <li>{item}</li>}</For>
        </ul>
        <output>{subs.length}</output>
        <Show when={replaced()} fallback={<Form gen="first" />}>
          <Form gen="second" />
        </Show>
      </>
    );
  };
  const Router = createRouter({
    routes: [{ path: "/", component: List }] as const,
    history: memoryHistory("/")
  });
  const unmount = render(
    () => <Router>{props => <Loading fallback="…">{props.children}</Loading>}</Router>,
    root
  );
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    unmount();
    root.remove();
  };
  fixtures.push(dispose);
  return {
    log,
    settled,
    root,
    rows,
    form,
    busy,
    replaceForm: () => setReplaced(true),
    submissionsOnScreen: () => root.querySelector("output")!.textContent,
    mutation: (i = 0) => mutationGates[i],
    mutationStarted: (n = 1) => until(() => mutationGates.length >= n),
    holdRefetch: () => (refetchGate = deferred()),
    releaseRefetch: () => refetchGate!.resolve(),
    dispose
  };
}

// a failed assertion must not leave a router delegating submits to the next test
const fixtures: (() => void)[] = [];
afterEach(() => fixtures.splice(0).forEach(dispose => dispose()));

describe("#649 router actions release at the transition's commit", () => {
  test("a held revalidation keeps the form busy, the hooks waiting and the record off screen", async () => {
    const t = setup();
    await until(() => t.rows() === 1);

    t.holdRefetch();
    t.form().requestSubmit();
    expect(t.busy()).toBe("true");
    await t.mutationStarted();
    t.mutation().resolve("ok");

    // the body has returned; its revalidation refetch holds the transition
    await wait(30);
    expect(t.rows()).toBe(1);
    expect(t.busy()).toBe("true");
    expect(t.log).toEqual([]);
    expect(t.submissionsOnScreen()).toBe("0");

    t.releaseRefetch();
    await until(() => t.rows() === 2);
    await until(() => t.log.length > 0);
    expect(t.busy()).toBeNull();
    // the hook observes the committed UI
    expect(t.log).toEqual(["settled result=ok rows=2"]);
    await until(() => t.submissionsOnScreen() === "1");
    t.dispose();
  });

  test("an unheld transition still releases once the new data is on screen", async () => {
    const t = setup();
    await until(() => t.rows() === 1);
    t.form().requestSubmit();
    await t.mutationStarted();
    t.mutation().resolve("ok");
    await until(() => t.log.length > 0);
    expect(t.log).toEqual(["settled result=ok rows=2"]);
    expect(t.busy()).toBeNull();
    t.dispose();
  });

  test("a morph that strips aria-busy is undone by the re-claim while busy, not after", async () => {
    const t = setup();
    await until(() => t.rows() === 1);
    t.form().requestSubmit();
    expect(t.busy()).toBe("true");
    await t.mutationStarted();

    // a server-component morph resets attributes to the server HTML (which
    // never carries aria-busy), then re-claims the element
    t.form().removeAttribute("aria-busy");
    claimElement(t.form());
    expect(t.busy()).toBe("true");

    t.mutation().resolve("ok");
    await until(() => t.log.length > 0);
    expect(t.busy()).toBeNull();

    claimElement(t.form());
    expect(t.busy()).toBeNull();
    t.dispose();
  });

  test("a replacement form element for the same action URL is busy, and released", async () => {
    const t = setup();
    await until(() => t.rows() === 1);
    const first = t.form();
    first.requestSubmit();
    await t.mutationStarted();

    t.replaceForm();
    await until(() => t.form().dataset.gen === "second");
    const second = t.form();
    expect(second).not.toBe(first);
    expect(t.busy(second)).toBe("true");

    t.mutation().resolve("ok");
    await until(() => t.log.length > 0);
    expect(t.busy(second)).toBeNull();
    expect(t.busy(first)).toBeNull();
    t.dispose();
  });

  test("a rejected mutation releases at commit and records the error", async () => {
    const t = setup({
      mutation: async (_, gate) => {
        await gate;
        throw new Error("nope");
      }
    });
    await until(() => t.rows() === 1);
    t.form().requestSubmit();
    await t.mutationStarted();
    expect(t.busy()).toBe("true");
    t.mutation().resolve(undefined);

    await until(() => t.settled.length > 0);
    expect(t.busy()).toBeNull();
    expect((t.settled[0].error as Error).message).toBe("nope");
    await until(() => t.submissionsOnScreen() === "1");
    t.dispose();
  });

  test("a response that fails to decode (a throw before the final slice) releases and records it", async () => {
    const t = setup({
      mutation: async (_, gate) => {
        await gate;
        // handed over whole with a body the router decodes itself: declared
        // JSON (the runtime's body-format header), but not JSON
        return new Response("{not json", { headers: { "X-Server-Function-Format": "8" } });
      }
    });
    await until(() => t.rows() === 1);
    t.form().requestSubmit();
    await t.mutationStarted();
    expect(t.busy()).toBe("true");
    t.mutation().resolve(undefined);

    await until(() => t.settled.length > 0);
    expect(t.busy()).toBeNull();
    expect(t.settled[0].error).toBeInstanceOf(SyntaxError);
    await until(() => t.submissionsOnScreen() === "1");
    t.dispose();
  });

  test("a throwing submit hook (before the mutation runs) releases and records it", async () => {
    const t = setup({
      onSubmit: () => {
        throw new Error("hook");
      }
    });
    await until(() => t.rows() === 1);
    t.form().requestSubmit();

    await until(() => t.settled.length > 0);
    expect(t.busy()).toBeNull();
    expect((t.settled[0].error as Error).message).toBe("hook");
    await until(() => t.submissionsOnScreen() === "1");
    t.dispose();
  });

  test("overlapping submissions keep the form busy until the last one commits", async () => {
    const t = setup();
    await until(() => t.rows() === 1);
    // separate tasks: two submits in one task would share a transition
    t.form().requestSubmit();
    await wait(0);
    t.form().requestSubmit();
    await t.mutationStarted(2);
    expect(t.busy()).toBe("true");

    t.mutation(0).resolve("one");
    await until(() => t.settled.length === 1);
    expect(t.busy()).toBe("true");

    t.mutation(1).resolve("two");
    await until(() => t.settled.length === 2);
    expect(t.busy()).toBeNull();
    t.dispose();
  });

  test("an authored aria-busy is left alone", async () => {
    const t = setup({ formAttrs: { "aria-busy": "false" } });
    await until(() => t.rows() === 1);
    t.form().requestSubmit();
    await t.mutationStarted();
    expect(t.busy()).toBe("false");
    claimElement(t.form());
    expect(t.busy()).toBe("false");

    t.mutation().resolve("ok");
    await until(() => t.settled.length > 0);
    expect(t.busy()).toBe("false");
    t.dispose();
  });

  test("an aria-busy the author rewrites mid-flight is theirs from then on", async () => {
    const t = setup();
    await until(() => t.rows() === 1);
    t.form().requestSubmit();
    await t.mutationStarted();
    expect(t.busy()).toBe("true");

    t.form().setAttribute("aria-busy", "false");
    claimElement(t.form());
    expect(t.busy()).toBe("false");

    t.mutation().resolve("ok");
    await until(() => t.settled.length > 0);
    expect(t.busy()).toBe("false");
    t.dispose();
  });
});

describe("#649 redirects and composition", () => {
  test("a redirect releases at the commit that puts its target on screen", async () => {
    const targetGate = deferred();
    const getTarget = query(async () => {
      await targetGate.promise;
      return "other";
    }, "target-649-redirect");
    const mutationGate = deferred();
    const go = routerAction(async () => {
      await mutationGate.promise;
      return redirect("/other");
    }, "go-649-redirect");

    const log: string[] = [];
    const root = document.createElement("div");
    document.body.appendChild(root);
    let form!: HTMLFormElement;
    const Home = () => {
      // owner-scoped to the page the redirect unmounts: the commit disposes
      // it before the settle, so it never sees this submission
      go.onSettled(() => void log.push("settled on the unmounted page"));
      return (
        <form ref={form} action={go} method="post">
          <button type="submit">home</button>
        </form>
      );
    };
    const Other = () => {
      const target = createMemo(() => getTarget());
      return <span>{target()}</span>;
    };
    const Router = createRouter({
      routes: [
        { path: "/", component: Home },
        { path: "/other", component: Other }
      ] as const,
      history: memoryHistory("/")
    });
    const dispose = render(
      () => (
        <Router>
          {props => {
            go.onSettled(() => void log.push(`settled text=${root.textContent}`));
            return <Loading fallback="…">{props.children}</Loading>;
          }}
        </Router>
      ),
      root
    );
    try {
      await until(() => root.textContent === "home");
      form.requestSubmit();
      expect(form.getAttribute("aria-busy")).toBe("true");
      mutationGate.resolve();

      // navigated inside the transition; the target's data holds the commit
      await wait(30);
      expect(root.textContent).toBe("home");
      expect(form.getAttribute("aria-busy")).toBe("true");
      expect(log).toEqual([]);

      targetGate.resolve();
      await until(() => log.length > 0);
      expect(log).toEqual(["settled text=other"]);
      expect(form.getAttribute("aria-busy")).toBeNull();
    } finally {
      dispose();
      root.remove();
    }
  });

  test("a nested `yield call()` settles at the outer action's commit", async () => {
    const log: string[] = [];
    const inner = routerAction(async () => {
      await wait(5);
      return "inner";
    }, "inner-649-nested");
    inner.onSettled(s => void log.push(`settled ${s.result}`));

    let outer!: () => Promise<unknown>;
    const outerGate = deferred();
    const Home = () => {
      const subs = useSubmissions(inner);
      const call = useAction(inner);
      outer = action(function* () {
        const v = yield call();
        log.push(`outer got ${v}`);
        // the outer body keeps the shared transition open
        yield outerGate.promise;
        return "outer";
      });
      return <output>{subs.length}</output>;
    };
    const Router = createRouter({
      routes: [{ path: "/", component: Home }] as const,
      history: memoryHistory("/")
    });
    const root = document.createElement("div");
    const dispose = render(
      () => <Router>{props => <Loading fallback="…">{props.children}</Loading>}</Router>,
      root
    );
    try {
      await until(() => root.textContent === "0");
      const done = outer();
      await until(() => log.length > 0);
      await wait(20);
      // the inner promise resolved (the outer body moved on); the inner's
      // settle waits for the outer commit
      expect(log).toEqual(["outer got inner"]);
      expect(root.textContent).toBe("0");

      outerGate.resolve();
      await done;
      await until(() => log.length > 1);
      expect(log).toEqual(["outer got inner", "settled inner"]);
      await until(() => root.textContent === "1");
    } finally {
      dispose();
    }
  });
});
