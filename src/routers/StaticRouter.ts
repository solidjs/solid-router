import { getRequestEvent } from "solid-js/web";
import { type RouterProps, createRouterComponent } from "./components";
import type { JSX } from "solid-js";

function getPath(url: string) {
  const u = new URL(url);
  return u.pathname + u.search;
}

export function StaticRouter(props: RouterProps & { url?: string }): JSX.Element {
  let e;
  const obj = {
    value: props.url || ((e = getRequestEvent()) && getPath(e.request.url)) || ""
  };
  return createRouterComponent({
    signal: [() => obj, next => Object.assign(obj, next)]
  })(props);
}
