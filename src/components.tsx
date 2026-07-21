/*@refresh skip*/
import type { JSX } from "@solidjs/web";
import { createMemo, merge, omit } from "solid-js";
import {
  useHref,
  useLinkState,
  useLocation,
  useNavigate,
  useResolvedPath
} from "./routing.js";
import type {
  Location,
  Navigator
} from "./types.js";

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
  const link = useLinkState(
    () => props.href,
    { get end() { return props.end; } }
  );
  const className = createMemo(() =>
    [toClassName(props.class), link.active() ? props.activeClass : props.inactiveClass]
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
      aria-current={link.current() ? "page" : undefined}
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
