// @vitest-environment jsdom
import { action, createMemo, createOptimisticStore, Loading } from "solid-js";
import { redirect, render } from "@solidjs/web";
import {
  action as routerAction,
  createRouter,
  memoryHistory,
  query,
  useAction
} from "../src/index.js";

const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

async function textBecomes(root: HTMLElement, text: string, timeout = 1000) {
  const start = Date.now();
  while (root.textContent !== text) {
    if (Date.now() - start > timeout)
      throw new Error(`expected "${text}", still "${root.textContent}"`);
    await wait(5);
  }
}

type Card = { id: string; order: number };

describe("#620 optimistic write reverts when a router action resolves", () => {
  for (const [label, outcome] of [
    ["an Error", () => new Error("rejected")],
    ["a value", () => "ok"],
    ["nothing", () => undefined]
  ] as const) {
    test(`reverts after the action returns ${label}`, async () => {
      const db: Card[] = [
        { id: "a", order: 0 },
        { id: "b", order: 1 }
      ];
      const getCards = query(async () => {
        await wait(5);
        return db.map(c => ({ ...c }));
      }, `cards-620-${label}`);
      const rejectSwap = routerAction(async () => {
        await wait(50);
        return outcome();
      }, `reject-swap-620-${label}`);

      let swap!: () => Promise<unknown>;
      const Cards = () => {
        const data = createMemo(() => getCards());
        const [cards, setCards] = createOptimisticStore(() => data(), [] as Card[]);
        const call = useAction(rejectSwap);
        swap = action(function* () {
          setCards(list => {
            const t = list[0].order;
            list[0].order = list[1].order;
            list[1].order = t;
          });
          yield call();
        });
        return (
          <pre>
            {[...cards]
              .sort((x, y) => x.order - y.order)
              .map(c => c.id)
              .join("")}
          </pre>
        );
      };

      const Router = createRouter({
        routes: [{ path: "/", component: Cards }] as const,
        history: memoryHistory("/")
      });
      const root = document.createElement("div");
      const dispose = render(
        () => <Router>{props => <Loading fallback="…">{props.children}</Loading>}</Router>,
        root
      );

      await textBecomes(root, "ab");
      swap();
      await textBecomes(root, "ba");
      await textBecomes(root, "ab");
      dispose();
    });
  }
});

describe("router action redirects applied inside the transition", () => {
  for (const kind of ["returned", "thrown"] as const) {
    test(`navigates on a ${kind} redirect`, async () => {
      const go = routerAction(async () => {
        await wait(5);
        if (kind === "thrown") throw redirect("/other");
        return redirect("/other");
      }, `redirect-620-${kind}`);

      let call!: () => Promise<unknown>;
      const Home = () => {
        call = useAction(go);
        return <span>home</span>;
      };
      const Router = createRouter({
        routes: [
          { path: "/", component: Home },
          { path: "/other", component: () => <span>other</span> }
        ] as const,
        history: memoryHistory("/")
      });
      const root = document.createElement("div");
      const dispose = render(
        () => <Router>{props => <Loading fallback="…">{props.children}</Loading>}</Router>,
        root
      );

      await textBecomes(root, "home");
      await expect(call()).resolves.toBeUndefined();
      await textBecomes(root, "other");
      dispose();
    });
  }
});
