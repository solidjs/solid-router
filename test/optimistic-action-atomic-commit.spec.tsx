// @vitest-environment jsdom
import { action, createMemo, createOptimisticStore, For, Loading } from "solid-js";
import { render } from "@solidjs/web";
import {
  action as routerAction,
  createRouter,
  memoryHistory,
  query,
  useAction
} from "../src/index.js";

// A router action's default revalidation must commit together with the
// caller's optimistic overlay release. Before #621 `handleResponse` ran after
// the inner Solid action had settled, so the overlay released when that
// action's transition committed while the refetch it started was still in
// flight: the rows re-rendered against the stale query data in between (#619).
//
// Every fetch and the action itself resolve through deferreds owned by the
// test, and committed frames are recorded from a MutationObserver, so the
// assertions are on the exact sequence of DOM commits, not on timing.

type Card = { id: string; order: number };

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(r => (resolve = r));
  return { promise, resolve };
}

// Drain microtasks and a few macrotasks so every settled promise has flushed.
const settle = async (turns = 3) => {
  for (let i = 0; i < turns; i++) await new Promise(r => setTimeout(r, 0));
};

function observeFrames(root: HTMLElement) {
  const frames: string[] = [];
  const observer = new MutationObserver(() => frames.push(root.textContent!));
  observer.observe(root, { childList: true, characterData: true, subtree: true });
  return { frames, disconnect: () => observer.disconnect() };
}

async function textBecomes(root: HTMLElement, text: string) {
  for (let i = 0; i < 100 && root.textContent !== text; i++) await settle(1);
  expect(root.textContent).toBe(text);
}

function setup(label: string, serverSide: (db: Card[]) => unknown) {
  const db: Card[] = [
    { id: "a", order: 0 },
    { id: "b", order: 1 },
    { id: "c", order: 2 }
  ];
  const fetches: ReturnType<typeof deferred<Card[]>>[] = [];
  const getCards = query(() => {
    const d = deferred<Card[]>();
    fetches.push(d);
    return d.promise;
  }, `cards-621-${label}`);
  const settleFetch = (i: number) => fetches[i].resolve(db.map(c => ({ ...c })));

  const server = deferred<void>();
  const swapOnServer = routerAction(async () => {
    await server.promise;
    return serverSide(db);
  }, `swap-621-${label}`);

  let swap!: () => Promise<unknown>;
  const Cards = () => {
    const data = createMemo(() => getCards());
    const [cards, setCards] = createOptimisticStore(() => data(), [] as Card[]);
    const call = useAction(swapOnServer);
    swap = action(function* () {
      setCards(list => {
        const t = list[0].order;
        list[0].order = list[1].order;
        list[1].order = t;
      });
      yield call();
    });
    const sorted = createMemo(() => [...cards].sort((x, y) => x.order - y.order));
    return (
      <ul>
        <For each={sorted()}>
          {(card, i) => (
            <li>
              {card.id}
              {card.order}/{i()}{" "}
            </li>
          )}
        </For>
      </ul>
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
  return { root, dispose, fetches, settleFetch, server, swap: () => swap() };
}

const TRUTH = "a0/0 b1/1 c2/2 ";
const OPTIMISTIC = "b0/0 a1/1 c2/2 ";

// Drives one submission: optimistic write, the action settles while the test
// still holds the refetch it started, then the refetch lands. Returns the
// frames committed between the optimistic write and the end.
async function submit(
  t: ReturnType<typeof setup>,
  betweenSettleAndRefetch: (frames: string[]) => void
) {
  t.settleFetch(0);
  await textBecomes(t.root, TRUTH);
  const { frames, disconnect } = observeFrames(t.root);

  const done = t.swap();
  await settle();
  expect(frames).toEqual([OPTIMISTIC]);
  expect(t.fetches.length).toBe(1);

  // The action settles; its default revalidation starts a refetch that the
  // test still holds.
  t.server.resolve();
  await settle();
  expect(t.fetches.length).toBe(2);
  betweenSettleAndRefetch(frames);

  t.settleFetch(1);
  await done;
  await settle();
  disconnect();
  t.dispose();
  return frames;
}

describe("#621 router action revalidation commits atomically with the optimistic release", () => {
  for (const [label, outcome] of [
    ["returns an Error", () => new Error("rejected")],
    ["leaves the data unchanged", () => undefined]
  ] as const) {
    test(`${label}: exactly [optimistic, truth], the revert waits for the refetch`, async () => {
      const t = setup(label.replace(/\W+/g, "-"), outcome);
      const frames = await submit(t, frames => {
        // Nothing may commit until the refetch lands: the revert and the
        // refetched data are one frame.
        expect(frames).toEqual([OPTIMISTIC]);
      });
      expect(frames).toEqual([OPTIMISTIC, TRUTH]);
    });
  }

  test("commits the change: exactly [optimistic], no intermediate frame", async () => {
    const t = setup("commits", db => {
      const t = db[0].order;
      db[0].order = db[1].order;
      db[1].order = t;
    });
    const frames = await submit(t, frames => expect(frames).toEqual([OPTIMISTIC]));
    // The refetch confirms the optimistic frame; the DOM never changed again.
    expect(frames).toEqual([OPTIMISTIC]);
  });

  test("commits the change and more: exactly [optimistic, truth] with the refetched data", async () => {
    const t = setup("commits-more", db => {
      const t = db[0].order;
      db[0].order = db[1].order;
      db[1].order = t;
      db[2].order = 5;
    });
    const frames = await submit(t, frames => expect(frames).toEqual([OPTIMISTIC]));
    // The part the optimistic write did not predict arrives in the same
    // commit as the release — proof the refetch, not just the release, landed.
    expect(frames).toEqual([OPTIMISTIC, "b0/0 a1/1 c5/2 "]);
  });
});
