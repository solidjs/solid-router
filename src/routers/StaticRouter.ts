import { getRequestEvent } from "solid-js/web";
import { type BaseRouterProps, createRouterComponent } from "./components.jsx";
import type { JSX } from "solid-js";

function getPath(url: string) {
  const u = new URL(url);
  return u.pathname + u.search;
}

export type StaticRouterProps = BaseRouterProps & { url?: string };

export function StaticRouter(props: StaticRouterProps): JSX.Element {
  let e;
  const url = props.url || ((e = getRequestEvent()) && getPath(e.request.url)) || ""
  const obj = {
    value: props.transformUrl ? props.transformUrl(url) : url,
    rawPath: url,
  };
  return createRouterComponent({
    signal: [() => obj, next => Object.assign(obj, next)]
  })(props);
}
