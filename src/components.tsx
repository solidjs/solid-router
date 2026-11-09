/*@refresh skip*/
import type { JSX } from "solid-js";
import { createMemo, splitProps } from "solid-js";
import { isServer } from "solid-js/web";
import { useHref, useLocation, useNavigate, useResolvedPath } from "./routing.js";
import type { Location, Navigator } from "./types.js";
import { normalizePath } from "./utils.js";

/**
 * True when every search param on `linkHref` is present with the same value on
 * `locationSearch`. Extra keys on the location are ignored (partial / subset
 * match), matching the usual filter-link case from #518.
 *
 * A link with no query string only matches a location that also has no search
 * (so an "All" tab with `activeOptions.search` does not stay active on every
 * filter). Repeated keys are compared as a multiset via `getAll`.
 */
function linkSearchMatchesLocation(linkHref: string, locationSearch: string): boolean {
  let linkSearch = "";
  const q = linkHref.indexOf("?");
  if (q !== -1) {
    const hash = linkHref.indexOf("#", q + 1);
    linkSearch = hash === -1 ? linkHref.slice(q + 1) : linkHref.slice(q + 1, hash);
  }
  const linkParams = new URLSearchParams(linkSearch);
  const locationParams = new URLSearchParams(
    locationSearch.startsWith("?") ? locationSearch.slice(1) : locationSearch
  );
  const linkEntries = [...linkParams];
  if (linkEntries.length === 0) {
    return [...locationParams].length === 0;
  }
  // Consume location values so `?tag=a&tag=b` does not match twice against the
  // first `tag=a` on the location.
  const remaining = new Map<string, string[]>();
  for (const key of new Set(locationParams.keys())) {
    remaining.set(key, locationParams.getAll(key));
  }
  for (const [key, value] of linkEntries) {
    const values = remaining.get(key);
    if (!values) return false;
    const at = values.indexOf(value);
    if (at === -1) return false;
    values.splice(at, 1);
  }
  return true;
}

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

export type AnchorActiveOptions = {
  /**
   * When true, active / `aria-current` also require the link's search params to
   * match the current location. Each key present on the link must equal the
   * location (extra location keys are allowed). Default is false so existing
   * path-only matching is unchanged.
   */
  search?: boolean | undefined;
};

export interface AnchorProps extends Omit<JSX.AnchorHTMLAttributes<HTMLAnchorElement>, "state"> {
  href: string;
  replace?: boolean | undefined;
  noScroll?: boolean | undefined;
  state?: unknown | undefined;
  inactiveClass?: string | undefined;
  activeClass?: string | undefined;
  end?: boolean | undefined;
  activeOptions?: AnchorActiveOptions | undefined;
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
  "end",
  "activeOptions"
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
    const pathActive = props.end
      ? path === loc
      : loc.startsWith(path + "/") || loc === path;
    const pathExact = path === loc;
    if (!props.activeOptions?.search) {
      return [pathActive, pathExact];
    }
    const searchMatches = linkSearchMatchesLocation(to_, location.search);
    return [pathActive && searchMatches, pathExact && searchMatches];
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
