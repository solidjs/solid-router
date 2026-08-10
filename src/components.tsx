/*@refresh skip*/
import type { JSX } from "solid-js";
import { createMemo, splitProps } from "solid-js";
import { isServer } from "solid-js/web";
import { useHref, useLocation, useNavigate, useResolvedPath } from "./routing.js";
import type { Location, Navigator } from "./types.js";
import { normalizePath } from "./utils.js";

declare module "solid-js" {
  namespace JSX {
    interface AnchorHTMLAttributes<T> {
      state?: string;
      noScroll?: boolean;
      replace?: boolean;
      preload?: boolean;
      link?: boolean;
    }
  }
}

export interface AnchorProps extends Omit<JSX.AnchorHTMLAttributes<HTMLAnchorElement>, "state"> {
  href: string;
  replace?: boolean | undefined;
  noScroll?: boolean | undefined;
  state?: unknown | undefined;
  inactiveClass?: string | undefined;
  activeClass?: string | undefined;
  end?: boolean | undefined;
}
// Every <A> on a page normalizes the same `location.pathname`, so a one entry cache
// collapses that work to once per navigation instead of once per link. Pure function
// of the input, so a stale or missed entry can only cost a recompute.
let lastPathname: string | undefined;
let lastNormalizedPathname: string;
function normalizeLocationPath(pathname: string): string {
  if (pathname !== lastPathname) {
    lastNormalizedPathname = decodeURI(normalizePath(pathname).toLowerCase().replace(/\/$/, ""));
    lastPathname = pathname;
  }
  return lastNormalizedPathname;
}

// Props <A> consumes itself. `children` is deliberately absent: leaving it in `rest` keeps
// the spread path byte for byte identical to before, including `innerHTML`/`textContent`
// precedence over children and the order a `ref` observes.
const SPLIT_PROPS = [
  "href",
  "state",
  "class",
  "activeClass",
  "inactiveClass",
  "end"
] as const satisfies readonly (keyof AnchorProps)[];

// The fast path renders children explicitly, so a link that only has children still
// qualifies for it. Anything outside this set, `innerHTML` included, takes the spread path.
const FAST_PATH_PROPS: ReadonlySet<string> = new Set([...SPLIT_PROPS, "children"]);

export function A(props: AnchorProps) {
  // `splitProps` plus the JSX spread is the bulk of the per link cost, and neither is
  // needed when the caller passes nothing beyond the props <A> consumes itself. Server
  // only: a render pass there is one shot, so the key set cannot grow after this check,
  // which it can on the client when the caller uses a reactive spread. The branch is
  // constant folded out of client builds.
  //
  // Own property names rather than `for...in`: a non-enumerable own prop still reaches the
  // element through `splitProps`, so missing one here would silently drop it.
  let fastPath = false;
  if (isServer) {
    fastPath = true;
    for (const key of Object.getOwnPropertyNames(props)) {
      if (!FAST_PATH_PROPS.has(key)) {
        fastPath = false;
        break;
      }
    }
  }

  const to = useResolvedPath(() => props.href);
  const href = useHref(to);
  const location = useLocation();
  const isActive = createMemo(() => {
    const to_ = to();
    if (to_ === undefined) return [false, false];
    // trailing slashes are ignored so `/route` and `/route/` share active state
    const path = normalizePath(to_.split(/[?#]/, 1)[0]).toLowerCase().replace(/\/$/, "");
    const loc = normalizeLocationPath(location.pathname);
    return [props.end ? path === loc : loc.startsWith(path + "/") || loc === path, path === loc];
  });
  // One read, so a getter backed `state` is not observed twice
  const state = () => {
    const value = props.state;
    return value === undefined ? undefined : JSON.stringify(value);
  };

  if (fastPath) {
    return (
      <a
        href={href() || props.href}
        state={state()}
        classList={{
          ...(props.class && { [props.class]: true }),
          [props.inactiveClass ?? "inactive"]: !isActive()[0],
          [props.activeClass ?? "active"]: isActive()[0]
        }}
        link
        aria-current={isActive()[1] ? "page" : undefined}
      >
        {props.children}
      </a>
    );
  }

  const [, rest] = splitProps(props, [...SPLIT_PROPS]);

  return (
    <a
      {...rest}
      href={href() || props.href}
      state={state()}
      classList={{
        ...(props.class && { [props.class]: true }),
        [props.inactiveClass ?? "inactive"]: !isActive()[0],
        [props.activeClass ?? "active"]: isActive()[0],
        ...rest.classList
      }}
      link
      aria-current={isActive()[1] ? "page" : undefined}
    />
  );
}

export interface NavigateProps {
  href: ((args: { navigate: Navigator; location: Location }) => string) | string;
  state?: unknown;
}

export function Navigate(props: NavigateProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { href, state } = props;
  const path = typeof href === "function" ? href({ navigate, location }) : href;
  navigate(path, { replace: true, state });
  return null;
}
