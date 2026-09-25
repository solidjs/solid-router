// @vitest-environment jsdom
import { action, createMemo, createOptimisticStore, Loading } from "solid-js";
import { render } from "@solidjs/web";
import {
  action as routerAction,
  createRouter,
  memoryHistory,
  query,
  useAction
} from "../src/index.js";

const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

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
        await wait(20);
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

      await wait(30);
      expect(root.textContent).toBe("ab");

      swap();
      await wait(5);
      expect(root.textContent).toBe("ba");

      await wait(100);
      expect(root.textContent).toBe("ab");
      dispose();
    });
  }
});
