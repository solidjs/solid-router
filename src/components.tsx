/*@refresh skip*/
import type { JSX } from "solid-js";
import { createMemo, merge, omit } from "solid-js";
import {
  useHref,
  useLocation,
  useNavigate,
  useResolvedPath
} from "./routing.js";
import type {
  Location,
  Navigator
} from "./types.js";
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

function toClassName(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(toClassName).filter(Boolean).join(" ");
  if (typeof value === "object") {
    return Object.entries(value as Record<string, boolean>)
      .filter(([, enabled]) => enabled)
      .map(([name]) => name)
      .join(" ");
  }
  return "";
}

export function A(props: AnchorProps) {
  props = merge({ inactiveClass: "inactive", activeClass: "active" }, props);
  const rest = omit(
    props,
    "href",
    "state",
    "class",
    "activeClass",
    "inactiveClass",
    "end"
  );
  const to = useResolvedPath(() => props.href);
  const href = useHref(to);
  const location = useLocation();
  const isActive = createMemo(() => {
    const to_ = to();
    if (to_ === undefined) return [false, false];
    const path = normalizePath(to_.split(/[?#]/, 1)[0]).toLowerCase();
    const loc = decodeURI(normalizePath(location.pathname).toLowerCase());
    return [props.end ? path === loc : loc.startsWith(path + "/") || loc === path, path === loc];
  });
  const className = createMemo(() =>
    [toClassName(props.class), isActive()[0] ? props.activeClass : props.inactiveClass]
      .filter(Boolean)
      .join(" ")
  );

  return (
    <a
      {...rest}
      href={href() || props.href}
      state={JSON.stringify(props.state)}
      class={className()}
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
