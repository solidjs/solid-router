// @vitest-environment jsdom
import { Suspense, type ParentProps } from "solid-js";
import { render } from "solid-js/web";
import { MemoryRouter, createMemoryHistory } from "../src/index.jsx";
import { FileRoutes } from "../src/fs.js";

const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

describe("FileRoutes rendering", () => {
  test("renders manifest routes inside a Router", async () => {
    const history = createMemoryHistory();
    history.set({ value: "/" });
    const Layout = (props: ParentProps) => (
      <div>
        <nav>nav</nav>
        <Suspense>{props.children}</Suspense>
      </div>
    );
    const root = document.createElement("div");
    document.body.appendChild(root);
    const dispose = render(
      () => (
        <MemoryRouter history={history} root={Layout}>
          <FileRoutes />
        </MemoryRouter>
      ),
      root
    );

    await wait(50);
    expect(root.innerHTML).toContain("Home");

    history.set({ value: "/about" });
    await wait(50);
    expect(root.innerHTML).toContain("About");

    dispose();
    document.body.removeChild(root);
  });
});
