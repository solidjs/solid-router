// @vitest-environment jsdom
// #595: navigating into a lazy() route whose content reads a query gated
// behind a separate, still-pending query — three async waves in one
// navigation transition (lazy import -> profile -> gated record). The gate
// memo re-runs mid-transition when the profile query re-reads (query()
// returns a fresh `.then` chain per read), superseding the record's
// in-flight fetch while re-parking on the profile. On solid-js < 2.0.0-rc.6
// the superseded flight's stale self pending-source wedged the settle walk
// and the Loading fallback never resolved (solidjs/solid#3226).
import {
  createContext,
  createMemo,
  Errored,
  lazy,
  Loading,
  Show,
  useContext
} from "solid-js";
import { render } from "@solidjs/web";
import type { JSX } from "@solidjs/web";
import { vi } from "vitest";
import { createRouter, memoryHistory, query, useNavigate, useParams } from "../src/index.js";
import type { Navigator } from "../src/index.js";

const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

describe("query gated behind a pending query on a lazy route (#595)", () => {
  const originalScrollTo = window.scrollTo;
  beforeEach(() => {
    window.scrollTo = vi.fn();
  });
  afterAll(() => {
    window.scrollTo = originalScrollTo;
  });

  test("navigation settles through lazy import + profile + gated record", async () => {
    let profileFetches = 0;
    let recordFetches = 0;
    const getProfile = query(async (_key: string) => {
      profileFetches++;
      await wait(80);
      return { name: "Jane", orgId: "org-1" };
    }, "gated-profile");
    const getRecord = query(async (_key: string) => {
      recordFetches++;
      await wait(200);
      return { name: "Record" };
    }, "gated-record");

    const OrgIdContext = createContext<() => string | undefined>(() => undefined);

    function AppShell(props: { children: JSX.Element }) {
      const profile = createMemo(() => getProfile("me"));
      const orgId = createMemo(() => (profile() as any)?.orgId);
      return (
        <div>
          <p>Signed in as: {(profile() as any)?.name ?? "…"}</p>
          <OrgIdContext value={orgId}>
            <div>{props.children}</div>
          </OrgIdContext>
        </div>
      );
    }

    function DetailContent() {
      const params = useParams<{ id: string }>();
      const orgId = useContext(OrgIdContext);
      const record = createMemo(() => {
        const oid = orgId();
        return oid ? getRecord(`${oid}:${params.id}`) : undefined;
      });
      return (
        <Errored fallback={() => <p>record-error</p>}>
          <Loading fallback={<p>record-pending</p>}>
            <Show when={record()}>{(r: any) => <h2>{r().name}</h2>}</Show>
          </Loading>
        </Errored>
      );
    }

    const DetailPage = () => (
      <AppShell>
        <DetailContent />
      </AppShell>
    );

    let navigate!: Navigator;
    const HomePage = () => {
      navigate = useNavigate();
      return <h1>Home</h1>;
    };

    const Router = createRouter({
      routes: [
        { path: "/", component: lazy(() => Promise.resolve({ default: HomePage })) },
        {
          path: "/detail/:id",
          component: lazy(async () => {
            await wait(20);
            return { default: DetailPage };
          })
        }
      ] as const,
      history: memoryHistory()
    });

    const div = document.createElement("div");
    document.body.appendChild(div);
    const dispose = render(() => <Router />, div);
    try {
      for (let i = 0; i < 20 && !div.textContent?.includes("Home"); i++) await wait(10);
      expect(div.textContent).toContain("Home");

      navigate("/detail/42");
      for (let i = 0; i < 100; i++) {
        await wait(20);
        if (div.textContent?.includes("Record")) break;
      }
      expect(div.textContent).toContain("Signed in as: Jane");
      expect(div.textContent).toContain("Record");
      expect(profileFetches).toBe(1);
      expect(recordFetches).toBe(1);
    } finally {
      dispose();
      div.remove();
    }
  }, 20000);
});
