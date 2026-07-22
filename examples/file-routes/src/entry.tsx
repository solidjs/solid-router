/* @refresh reload */
import { A, Router } from "@solidjs/router";
import { FileRoutes } from "@solidjs/router/fs";
import { Suspense, type ParentProps } from "solid-js";
import { render } from "solid-js/web";

function Layout(props: ParentProps) {
  return (
    <>
      <nav>
        <A href="/">Home</A> · <A href="/about">About</A> · <A href="/blog">Blog</A>
      </nav>
      <Suspense>{props.children}</Suspense>
    </>
  );
}

render(
  () => (
    <Router root={Layout}>
      <FileRoutes />
    </Router>
  ),
  document.getElementById("app")!
);
