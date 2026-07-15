import { render } from "@solidjs/web";
import { createEffect, createMemo, Loading } from "solid-js";
import { vi } from "vitest";
import {
  A,
  MemoryRouter,
  Route,
  createMemoryHistory,
  useNavigate,
  useParams,
  type Navigator
} from "../src/index.js";

const settle = async (ms = 0) => {
  await new Promise<void>(resolve => queueMicrotask(() => resolve()));
  await new Promise(resolve => setTimeout(resolve, ms));
};

describe("Client navigation should", () => {
  const originalScrollTo = window.scrollTo;
  beforeEach(() => {
    window.scrollTo = vi.fn();
  });
  afterAll(() => {
    window.scrollTo = originalScrollTo;
  });

  test("update rendered routes after clicking links", async () => {
    const div = document.createElement("div");
    document.body.appendChild(div);

    const dispose = render(
      () => (
        <MemoryRouter>
          <Route
            path="/"
            component={() => (
              <>
                <A href="/about">About</A>
                <div data-route="home">Home page</div>
              </>
            )}
          />
          <Route path="/about" component={() => <div data-route="about">About page</div>} />
        </MemoryRouter>
      ),
      div
    );

    try {
      expect(div.querySelector('[data-route="home"]')?.textContent).toBe("Home page");
      expect(div.querySelector('[data-route="about"]')).toBeNull();

      const link = div.querySelector("a");
      expect(link).toBeTruthy();

      const event = new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
        button: 0
      });
      Object.defineProperty(event, "composedPath", {
        value: () => [link!, div, document.body, document, window]
      });

      link!.dispatchEvent(event);
      await new Promise<void>(resolve => queueMicrotask(() => resolve()));
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(div.querySelector('[data-route="about"]')?.textContent).toBe("About page");
      expect(div.querySelector('[data-route="home"]')).toBeNull();
    } finally {
      dispose();
      div.remove();
    }
  });

  test("keep params stable in outgoing components when navigating away", async () => {
    const div = document.createElement("div");
    document.body.appendChild(div);

    const observed: (string | undefined)[][] = [];
    let navigate!: Navigator;

    const history = createMemoryHistory();
    history.set({ value: "/users/1/comments" });

    const Users = () => {
      const params = useParams();
      navigate = useNavigate();
      createEffect(
        () => [params.id, params.view] as const,
        ([id, view]) => {
          observed.push([id, view]);
        }
      );
      return <div data-route="users">{params.id}</div>;
    };

    const dispose = render(
      () => (
        <MemoryRouter history={history}>
          <Route path="/users/:id/:view" component={Users} />
          <Route path="/about" component={() => <div data-route="about">About page</div>} />
        </MemoryRouter>
      ),
      div
    );

    try {
      await settle();
      expect(div.querySelector('[data-route="users"]')?.textContent).toBe("1");
      expect(observed).toEqual([["1", "comments"]]);

      // Same-route param navigation should update params.
      navigate("/users/2/likes");
      await settle();
      expect(div.querySelector('[data-route="users"]')?.textContent).toBe("2");
      expect(observed).toEqual([
        ["1", "comments"],
        ["2", "likes"]
      ]);

      // Navigating away must not re-run the outgoing route's effects with
      // another route's (empty) params.
      navigate("/about");
      await settle();
      expect(div.querySelector('[data-route="about"]')?.textContent).toBe("About page");
      expect(div.querySelector('[data-route="users"]')).toBeNull();
      expect(observed).toEqual([
        ["1", "comments"],
        ["2", "likes"]
      ]);
    } finally {
      dispose();
      div.remove();
    }
  });

  test("not refetch with empty params in outgoing components suspended by a Loading boundary", async () => {
    const div = document.createElement("div");
    document.body.appendChild(div);

    const fetched: (string | undefined)[][] = [];
    let navigate!: Navigator;

    const history = createMemoryHistory();
    history.set({ value: "/users/1/comments" });

    const Users = () => {
      const params = useParams();
      navigate = useNavigate();
      const data = createMemo(async () => {
        fetched.push([params.id, params.view]);
        return `${params.id}-${params.view}`;
      });
      return <div data-route="users">{data()}</div>;
    };

    const About = () => {
      const data = createMemo(async () => {
        await new Promise(resolve => setTimeout(resolve, 25));
        return "About page";
      });
      return <div data-route="about">{data()}</div>;
    };

    const dispose = render(
      () => (
        <MemoryRouter
          history={history}
          root={props => (
            <Loading fallback={<div data-loading>loading</div>}>{props.children}</Loading>
          )}
        >
          <Route path="/users/:id/:view" component={Users} />
          <Route path="/about" component={About} />
        </MemoryRouter>
      ),
      div
    );

    try {
      await settle(10);
      expect(div.querySelector('[data-route="users"]')?.textContent).toBe("1-comments");
      expect(fetched).toEqual([["1", "comments"]]);

      // Navigating to a suspending route keeps the outgoing tree alive while
      // the new one settles; it must not refetch with the new route's params.
      navigate("/about");
      await settle(50);
      expect(div.querySelector('[data-route="about"]')?.textContent).toBe("About page");
      expect(fetched).toEqual([["1", "comments"]]);
    } finally {
      dispose();
      div.remove();
    }
  });

  test("expose child params to parent layouts", async () => {
    const div = document.createElement("div");
    document.body.appendChild(div);

    let navigate!: Navigator;

    const history = createMemoryHistory();
    history.set({ value: "/users/1" });

    const Layout = (props: { children?: any }) => {
      const params = useParams();
      navigate = useNavigate();
      return (
        <>
          <div data-layout-id>{params.id ?? "none"}</div>
          {props.children}
        </>
      );
    };

    const dispose = render(
      () => (
        <MemoryRouter history={history}>
          <Route path="/users" component={Layout}>
            <Route path="/" component={() => <div data-route="index">Index</div>} />
            <Route path="/:id" component={() => <div data-route="user">User</div>} />
          </Route>
        </MemoryRouter>
      ),
      div
    );

    try {
      await settle();
      expect(div.querySelector("[data-layout-id]")?.textContent).toBe("1");

      navigate("/users/2");
      await settle();
      expect(div.querySelector("[data-layout-id]")?.textContent).toBe("2");

      navigate("/users");
      await settle();
      expect(div.querySelector('[data-route="index"]')).toBeTruthy();
      expect(div.querySelector("[data-layout-id]")?.textContent).toBe("none");
    } finally {
      dispose();
      div.remove();
    }
  });

  test("call preload with the route's own params during navigation", async () => {
    const div = document.createElement("div");
    document.body.appendChild(div);

    const preloadedParams: (string | undefined)[] = [];
    let navigate!: Navigator;

    const history = createMemoryHistory();
    history.set({ value: "/users/1" });

    const Home = () => {
      navigate = useNavigate();
      return <div data-route="users">Users</div>;
    };

    const dispose = render(
      () => (
        <MemoryRouter history={history}>
          <Route path="/users/:id" component={Home} />
          <Route
            path="/posts/:postId"
            preload={({ params }) => {
              preloadedParams.push(params.postId);
            }}
            component={() => <div data-route="post">Post</div>}
          />
        </MemoryRouter>
      ),
      div
    );

    try {
      await settle();
      navigate("/posts/42");
      await settle();
      expect(div.querySelector('[data-route="post"]')).toBeTruthy();
      expect(preloadedParams).toEqual(["42"]);
    } finally {
      dispose();
      div.remove();
    }
  });
});
