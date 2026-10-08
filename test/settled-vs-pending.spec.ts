/**
 * When Solid's `onSettled` fires relative to `isPending`/`latest` of the
 * written signal — the core semantics the router's navigation-pending state
 * leans on (#655). The router registers its settle hook unowned
 * (`runWithOwner(null, …)`) right after the location write, so that is the
 * shape probed here: one signal standing in for the location, a render
 * effect standing in for the route tree (the frame that holds), and a
 * render effect over `isPending` standing in for `useIsRouting`.
 *
 * `|` entries in the logs are checkpoints: everything between two of them
 * happened in one step (a `flush()`, or the macrotask after a resolve).
 */
import {
  createMemo,
  createEffect,
  createRenderEffect,
  createRoot,
  createSignal,
  flush,
  isPending,
  latest,
  onSettled,
  runWithOwner,
  untrack
} from "solid-js";

const tick = () => new Promise<void>(resolve => setTimeout(resolve, 0));

function deferred<T = void>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>(res => (resolve = res));
  return { promise, resolve };
}

/**
 * `/slow*` reads an async node the frame cannot show until it resolves.
 * `extra` runs in the same root, for probes that add readers.
 */
function setup(extra?: (loc: () => string, log: string[]) => void) {
  const log: string[] = [];
  const gates = new Map<string, ReturnType<typeof deferred<string>>>();
  const gate = (key: string) => {
    let d = gates.get(key);
    if (!d) gates.set(key, (d = deferred<string>()));
    return d;
  };
  let dispose!: () => void;
  let set!: (v: string) => void;
  let read!: () => string;
  createRoot(d => {
    dispose = d;
    const [loc, setLoc] = createSignal("/", { ownedWrite: true });
    set = setLoc;
    read = loc;
    const data = createMemo(() => {
      const v = loc();
      return v.startsWith("/slow") ? gate(v).promise : v;
    });
    createRenderEffect(data, v => void log.push(`frame:${v}`));
    createRenderEffect(
      () => isPending(loc),
      p => void log.push(`pending:${p}`)
    );
    extra?.(loc, log);
  });
  flush();
  log.length = 0;
  return {
    log,
    gate,
    mark: (label: string) => void log.push(`| ${label}`),
    write(v: string) {
      set(v);
      runWithOwner(null, () => onSettled(() => void log.push(`settled:${v}`)));
    },
    read: () => read(),
    pendingNow: () => isPending(read),
    latestNow: () => latest(read),
    dispose
  };
}

describe("onSettled vs isPending (solid 2.0 rc.14)", () => {
  test("no async: settle at the end of the carrying flush; the verdict reader never reads it as pending", () => {
    const t = setup();
    t.write("/a");
    t.mark(`write pending=${t.pendingNow()} latest=${t.latestNow()}`);
    flush();
    expect(t.log).toEqual([
      // unflushed (A28): no verdict, no settle — onSettled never fires synchronously
      "| write pending=false latest=/",
      // a verdict reader sees the screen, and the flush commits the write: no
      // true→false blip (rc.13 logged pending:true before the frame)
      "pending:false",
      "frame:/a",
      "settled:/a"
    ]);
    t.dispose();
  });

  test("held write: verdict true from the parking flush, false and settle in the landing step", async () => {
    const t = setup();
    t.write("/slow");
    flush();
    t.mark(`parked pending=${t.pendingNow()} latest=${t.latestNow()}`);
    t.gate("/slow").resolve("slow-data");
    await tick();
    expect(t.log).toEqual([
      "pending:true",
      "| parked pending=true latest=/slow",
      "frame:slow-data",
      "pending:false",
      "settled:/slow"
    ]);
    t.dispose();
  });

  test("held write superseded by a sync write: both settles fire in the second write's flush, the first's async abandoned", async () => {
    const t = setup();
    t.write("/slow");
    flush();
    t.mark("parked");
    t.write("/b");
    flush();
    t.mark("second flush");
    await tick();
    expect(t.log).toEqual([
      "pending:true",
      "| parked",
      "frame:/b",
      "pending:false",
      // the live queue's run first, then the merged transaction's stash
      "settled:/b",
      "settled:/slow",
      "| second flush"
    ]);
    t.dispose();
  });

  test("held write superseded by another held write: the first's resolve lands nothing; one landing for both", async () => {
    const t = setup();
    t.write("/slow1");
    flush();
    t.write("/slow2");
    flush();
    t.mark("both parked");
    t.gate("/slow1").resolve("one");
    await tick();
    t.mark("first resolved");
    t.gate("/slow2").resolve("two");
    await tick();
    expect(t.log).toEqual([
      "pending:true",
      // the second write re-derives the verdict reader in its parking flush
      "pending:true",
      "| both parked",
      "| first resolved",
      "frame:two",
      "pending:false",
      "settled:/slow1",
      "settled:/slow2"
    ]);
    t.dispose();
  });

  test("written back to the committed value while held: the verdict is false before the flush, both settle in that flush", async () => {
    const t = setup();
    t.write("/slow");
    flush();
    t.write("/");
    t.mark(`write-back unflushed pending=${t.pendingNow()}`);
    flush();
    t.mark("write-back flush");
    await tick();
    expect(t.log).toEqual([
      "pending:true",
      // the write back joins the held node's transaction before its equality
      // gate (A34 (1)): it reads not pending at once (rc.13: still true here)
      "| write-back unflushed pending=false",
      "pending:false",
      "settled:/",
      "settled:/slow",
      "| write-back flush"
    ]);
    t.dispose();
  });

  test("async never resolves: verdict stays true, settle never fires", async () => {
    const t = setup();
    t.write("/slow");
    flush();
    await tick();
    await tick();
    expect(t.log).toEqual(["pending:true"]);
    t.dispose();
  });

  test("same-tick double write: one flush, both settles at its end", () => {
    const t = setup();
    t.write("/a");
    t.write("/b");
    flush();
    expect(t.log).toEqual(["pending:false", "frame:/b", "settled:/a", "settled:/b"]);
    t.dispose();
  });

  test("inside the graph a plain read sees the in-flight value; the frame reading it holds", async () => {
    const t = setup((loc, log) => {
      const seen = createMemo(() => {
        const v = loc();
        log.push(`memo:${v}`);
        return v;
      });
      createRenderEffect(seen, v => void log.push(`effect:${v}`));
    });
    t.log.length = 0;
    t.write("/slow");
    flush();
    t.mark(`parked read()=${t.read()}`);
    t.gate("/slow").resolve("x");
    await tick();
    expect(t.log).toEqual([
      // the memo recomputes under the transition with the in-flight value…
      "memo:/slow",
      "pending:true",
      // …and an untracked read outside any computation is the committed one
      "| parked read()=/",
      "frame:x",
      "effect:/slow",
      "pending:false",
      "settled:/slow"
    ]);
    t.dispose();
  });

  test("an unrelated write during a held navigation commits at once, even if its reader peeks at the location untracked", async () => {
    let setOther!: (v: number) => void;
    const t = setup((loc, log) => {
      const [other, set] = createSignal(0, { ownedWrite: true });
      setOther = set;
      createRenderEffect(
        () => {
          const v = other();
          return `${v}@${untrack(loc)}`;
        },
        v => void log.push(`other:${v}`)
      );
    });
    t.log.length = 0;
    t.write("/slow");
    flush();
    t.mark("parked");
    setOther(1);
    flush();
    t.mark("other written");
    expect(t.log).toEqual(["pending:true", "| parked", "other:1@/", "| other written"]);
    t.dispose();
  });
});

/**
 * Could the router own a pending marker — a plain signal it writes in
 * `navigate()` — instead of asking `isPending`? A flush that parks holds
 * every node it staged in one transaction (the hold model, "one frame
 * concept"), so a write beside the location is the navigation's write, held
 * with it.
 */
describe("a router-owned pending marker (solid 2.0 rc.14)", () => {
  function withMarker() {
    let setMarker!: (v: string | undefined) => void;
    const t = setup((_loc, log) => {
      const [marker, set] = createSignal<string | undefined>(undefined, { ownedWrite: true });
      setMarker = set;
      createRenderEffect(marker, v => void log.push(`marker:${v}`));
    });
    t.log.length = 0;
    return { ...t, setMarker: (v: string | undefined) => setMarker(v) };
  }

  test("written in the same tick as the location: held with the navigation, shows only at the landing", async () => {
    const t = withMarker();
    t.write("/slow");
    t.setMarker("/slow");
    flush();
    t.mark("parked");
    t.gate("/slow").resolve("x");
    await tick();
    expect(t.log).toEqual([
      "pending:true",
      "| parked",
      "frame:x",
      "marker:/slow",
      "pending:false",
      "settled:/slow"
    ]);
    t.dispose();
  });

  test("written in a later tick (after the parking flush): commits at once", async () => {
    const t = withMarker();
    t.write("/slow");
    flush();
    t.mark("parked");
    t.setMarker("/slow");
    flush();
    t.mark("marker written");
    expect(t.log).toEqual(["pending:true", "| parked", "marker:/slow", "| marker written"]);
    t.dispose();
  });

  test("written in a later tick and read beside the held location: still commits at once, beside the committed location", async () => {
    let setMarker!: (v: string | undefined) => void;
    const t = setup((loc, log) => {
      const [marker, set] = createSignal<string | undefined>(undefined, { ownedWrite: true });
      setMarker = set;
      // the claims sweep's shape: one effect over the location and the marker
      createRenderEffect(
        () => `${loc()}|${marker()}`,
        v => void log.push(`sweep:${v}`)
      );
    });
    t.log.length = 0;
    t.write("/slow");
    flush();
    t.mark("parked");
    setMarker("/slow");
    flush();
    t.mark("marker written");
    t.gate("/slow").resolve("x");
    await tick();
    t.mark("landed");
    expect(t.log).toEqual([
      "pending:true",
      "| parked",
      "sweep:/|/slow",
      "| marker written",
      "frame:x",
      "pending:false",
      "sweep:/slow|/slow",
      "settled:/slow",
      "| landed"
    ]);
    t.dispose();
  });

  test("written in a later tick but read by a user effect beside the held location: held to the landing", async () => {
    let setMarker!: (v: string | undefined) => void;
    const t = setup((loc, log) => {
      const [marker, set] = createSignal<string | undefined>(undefined, { ownedWrite: true });
      setMarker = set;
      // scroll restoration's shape: a user effect over the location and the marker
      createEffect(
        () => `${loc()}|${marker()}`,
        v => void log.push(`user:${v}`)
      );
      createRenderEffect(marker, v => void log.push(`marker:${v}`));
    });
    t.log.length = 0;
    t.write("/slow");
    flush();
    t.mark("parked");
    setMarker("/slow");
    flush();
    t.mark("marker written");
    t.gate("/slow").resolve("x");
    await tick();
    t.mark("landed");
    expect(t.log).toEqual([
      "pending:true",
      "| parked",
      "| marker written",
      "frame:x",
      "marker:/slow",
      "user:/slow|/slow",
      "pending:false",
      "settled:/slow",
      "| landed"
    ]);
    t.dispose();
  });

  test("onSettled settles the tick it is registered in: registered after the parking flush, it does not wait for the navigation", async () => {
    const t = withMarker();
    t.write("/slow");
    flush();
    t.setMarker("/slow");
    runWithOwner(null, () => onSettled(() => t.setMarker(undefined)));
    flush();
    t.mark("later tick flushed");
    expect(t.log).toEqual([
      "pending:true",
      "marker:/slow",
      "marker:undefined",
      "| later tick flushed"
    ]);
    t.dispose();
  });

  test("cleared from the write's own onSettled: committed in the landing flush, after the frame and the verdict", async () => {
    let setMarker!: (v: string | undefined) => void;
    const t = setup((_loc, log) => {
      const [marker, set] = createSignal<string | undefined>(undefined, { ownedWrite: true });
      setMarker = set;
      createRenderEffect(marker, v => void log.push(`marker:${v}`));
    });
    t.log.length = 0;
    t.write("/slow");
    runWithOwner(null, () => onSettled(() => setMarker(undefined)));
    flush();
    setMarker("/slow");
    flush();
    t.mark("marker shown");
    t.gate("/slow").resolve("x");
    await tick();
    expect(t.log).toEqual([
      "pending:true",
      "marker:/slow",
      "| marker shown",
      "frame:x",
      "pending:false",
      "settled:/slow",
      "marker:undefined"
    ]);
    t.dispose();
  });
});

describe("onSettled ownership (solid 2.0 rc.14)", () => {
  test("owned onSettled is a tracked effect: it waits for its owner's first settle, not a write", async () => {
    const log: string[] = [];
    const d = deferred<string>();
    const dispose = createRoot(dispose => {
      const data = createMemo(() => d.promise);
      createRenderEffect(data, v => void log.push(`frame:${v}`));
      onSettled(() => void log.push("settled"));
      return dispose;
    });
    flush();
    log.push("| mounted");
    d.resolve("x");
    await tick();
    expect(log).toEqual(["| mounted", "frame:x", "settled"]);
    dispose();
  });
});
