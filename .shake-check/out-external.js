import { isServer, createComponent, memo, registerElementClaim, delegateEvents, getRequestEvent } from '@solidjs/web';
import { createContext, untrack, onCleanup, getOwner, createRenderEffect, createSignal, createMemo, runWithOwner, createRoot, useContext, flush, sharedConfig, createComponent as createComponent$1 } from 'solid-js';

const hasSchemeRegex = /^(?:[a-z0-9]+:)?\/\//i;
const trimPathRegex = /^\/+|(\/)\/+$/g;
const mockBase = "http://sr";
function normalizePath(path, omitSlash = false) {
  const s = path.replace(trimPathRegex, "$1");
  return s ? omitSlash || /^[?#]/.test(s) ? s : "/" + s : "";
}

/** Pathname stripped of search/hash and trailing slash, lowercased — the form link matching compares. */
const comparablePath = path => normalizePath(path.split(/[?#]/, 1)[0]).toLowerCase().replace(/\/$/, "");
function resolvePath(base, path, from) {
  if (hasSchemeRegex.test(path)) {
    return undefined;
  }
  const basePath = normalizePath(base);
  const fromPath = from && normalizePath(from);
  let result = "";
  if (!fromPath || path.startsWith("/")) {
    result = basePath;
  } else if (fromPath.toLowerCase().indexOf(basePath.toLowerCase()) !== 0) {
    result = basePath + fromPath;
  } else {
    result = fromPath;
  }
  return (result || "/") + normalizePath(path, !result);
}
function joinPaths(from, to) {
  return normalizePath(from).replace(/\/*(\*.*)?$/g, "") + normalizePath(to);
}
function extractSearchParams(url) {
  const params = {};
  url.searchParams.forEach((value, key) => {
    if (key in params) {
      if (Array.isArray(params[key])) params[key].push(value);else params[key] = [params[key], value];
    } else params[key] = value;
  });
  return params;
}
function createMatcher(path, partial, matchFilters) {
  const [pattern, splat] = path.split("/*", 2);
  const segments = pattern.split("/").filter(Boolean);
  const len = segments.length;
  return location => {
    const locSegments = location.split("/");
    // tolerate a single leading and trailing slash, but reject empty interior
    // segments so `/foo//bar` doesn't silently match `/foo/bar` (#567)
    if (locSegments[0] === "") locSegments.shift();
    if (locSegments.length && locSegments[locSegments.length - 1] === "") locSegments.pop();
    if (locSegments.includes("")) return null;
    const lenDiff = locSegments.length - len;
    if (lenDiff < 0 || lenDiff > 0 && splat === undefined && !partial) {
      return null;
    }
    const match = {
      path: len ? "" : "/",
      params: {}
    };
    const matchFilter = s => matchFilters === undefined ? undefined : matchFilters[s];
    for (let i = 0; i < len; i++) {
      const segment = segments[i];
      const dynamic = segment[0] === ":";
      const locSegment = dynamic ? locSegments[i] : locSegments[i].toLowerCase();
      const key = dynamic ? segment.slice(1) : segment.toLowerCase();
      if (dynamic && matchSegment(locSegment, matchFilter(key))) {
        match.params[key] = locSegment;
      } else if (dynamic || !matchSegment(locSegment, key)) {
        return null;
      }
      match.path += `/${locSegment}`;
    }
    if (splat) {
      const remainder = lenDiff ? locSegments.slice(-lenDiff).join("/") : "";
      if (matchSegment(remainder, matchFilter(splat))) {
        match.params[splat] = remainder;
      } else {
        return null;
      }
    }
    return match;
  };
}
function matchSegment(input, filter) {
  const isEqual = s => s === input;
  if (filter === undefined) {
    return true;
  } else if (typeof filter === "string") {
    return isEqual(filter);
  } else if (typeof filter === "function") {
    return filter(input);
  } else if (Array.isArray(filter)) {
    return filter.some(isEqual);
  } else if (filter instanceof RegExp) {
    return filter.test(input);
  }
  return false;
}
function scoreRoute(route) {
  const [pattern, splat] = route.pattern.split("/*", 2);
  const segments = pattern.split("/").filter(Boolean);
  return segments.reduce((score, segment) => score + (segment.startsWith(":") ? 2 : 3), segments.length - (splat === undefined ? 0 : 1));
}
function createMemoObject(fn) {
  const map = new Map();
  const owner = getOwner();
  return new Proxy({}, {
    get(_, property) {
      if (!map.has(property)) {
        runWithOwner(owner, () => map.set(property, createMemo(() => fn()[property])));
      }
      return map.get(property)();
    },
    getOwnPropertyDescriptor() {
      return {
        enumerable: true,
        configurable: true
      };
    },
    ownKeys() {
      return Reflect.ownKeys(fn());
    },
    has(_, property) {
      return property in fn();
    }
  });
}
function mergeSearchString(search, params) {
  const merged = new URLSearchParams(search);
  Object.entries(params).forEach(([key, value]) => {
    if (value == null || value === "" || value instanceof Array && !value.length) {
      merged.delete(key);
    } else {
      if (value instanceof Array) {
        // Delete all instances of the key before appending
        merged.delete(key);
        value.forEach(v => {
          merged.append(key, String(v));
        });
      } else {
        merged.set(key, String(value));
      }
    }
  });
  const s = merged.toString();
  return s ? `?${s}` : "";
}
function expandOptionals(pattern) {
  let match = /(\/?\:[^\/]+)\?/.exec(pattern);
  if (!match) return [pattern];
  let prefix = pattern.slice(0, match.index);
  let suffix = pattern.slice(match.index + match[0].length);
  const prefixes = [prefix, prefix += match[1]];

  // This section handles adjacent optional params. We don't actually want all permuations since
  // that will lead to equivalent routes which have the same number of params. For example
  // `/:a?/:b?/:c`? only has the unique expansion: `/`, `/:a`, `/:a/:b`, `/:a/:b/:c` and we can
  // discard `/:b`, `/:c`, `/:b/:c` by building them up in order and not recursing. This also helps
  // ensure predictability where earlier params have precidence.
  while (match = /^(\/\:[^\/]+)\?/.exec(suffix)) {
    prefixes.push(prefix += match[1]);
    suffix = suffix.slice(match[0].length);
  }
  return expandOptionals(suffix).reduce((results, expansion) => [...results, ...prefixes.map(p => p + expansion)], []);
}

/**
 * The compiler claims every `a[href]` (and `form[action]`, which this handler
 * ignores) at creation, and the runtime re-claims on `href` writes. This
 * consumer gives each router-managed anchor the link-state vocabulary without
 * a wrapper component:
 *
 * - `aria-current="page"` — the location matches the link exactly
 * - `data-active` — exact or prefix match
 * - `data-pending` — the link is the target of an in-flight navigation
 *
 * Elements are claimed at creation, so late mounts (`<Show>`, `<For>`,
 * portals) are correct immediately. Each anchor gets one render effect owned
 * by the component that created it, so state tracks the location live and is
 * disposed with the element's owner. Re-claims are one-shot untracked
 * recomputes: the effect already subscribed to the location on its first run
 * and reads the element's current `href` from the DOM each time, so a new
 * `href` only needs the immediate refresh.
 */
function setupLinkClaims(router, explicitLinks) {
  const basePath = router.base.path();
  // per-element record; `current` remembers whether we set `aria-current`,
  // so user-authored values (steppers, breadcrumbs) are never stripped
  const claimed = new WeakMap();
  function isSvg(el) {
    return el.namespaceURI === "http://www.w3.org/2000/svg";
  }

  /** The comparable pathname when the router manages this anchor, else `undefined`. */
  function managedPath(a) {
    if (explicitLinks && !a.hasAttribute("link")) return;
    const svg = isSvg(a);
    // claims fire at creation while the element is still in the template's
    // inert fragment, where the `href` property is not resolved — resolve the
    // raw attribute against the live document instead
    const href = svg ? a.href.baseVal : a.getAttribute("href");
    const target = svg ? a.target.baseVal : a.target;
    if (target || !href) return;
    const rel = (a.getAttribute("rel") || "").split(/\s+/);
    if (a.hasAttribute("download") || rel.includes("external")) return;
    let url;
    try {
      url = new URL(href, document.baseURI);
    } catch {
      return;
    }
    if (url.origin !== window.location.origin || basePath && url.pathname && !url.pathname.toLowerCase().startsWith(basePath.toLowerCase())) return;
    return comparablePath(url.pathname);
  }
  function linkState(a) {
    // read reactive sources unconditionally so the owning effect stays
    // subscribed even while the anchor is not router-managed
    const loc = decodeURI(comparablePath(router.location.pathname));
    const routing = router.isRouting();
    const path = managedPath(a);
    // the root path is a prefix of everything, so it only matches exactly —
    // there is no per-anchor `end` opt-out like useLinkState has
    const matches = target => path !== undefined && (target === path || path !== "" && target.startsWith(path + "/"));
    // effects observe the committed location during a transition, so the
    // in-flight target comes from pendingTarget — readable here because the
    // isRouting write flushes after the target is assigned
    const pending = routing && !!router.pendingTarget && matches(decodeURI(comparablePath(router.pendingTarget.value)));
    return {
      active: matches(loc),
      pending,
      exact: path !== undefined && loc === path
    };
  }
  function apply(a, rec, {
    active,
    pending,
    exact
  }) {
    active ? a.setAttribute("data-active", "") : a.removeAttribute("data-active");
    pending ? a.setAttribute("data-pending", "") : a.removeAttribute("data-pending");
    if (exact !== rec.current) {
      exact ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current");
      rec.current = exact;
    }
  }
  const refresh = (a, rec) => untrack(() => apply(a, rec, linkState(a)));
  onCleanup(registerElementClaim(node => {
    if (node.nodeName.toUpperCase() !== "A") return;
    const a = node;
    // re-claim (href changed): the claiming write runs inside another
    // effect, so refresh without leaking subscriptions into it
    const existing = claimed.get(a);
    if (existing) return refresh(a, existing);
    const rec = {
      current: false
    };
    claimed.set(a, rec);
    // claims fire during component setup, so an owner is present in
    // practice; without one, state is still correct at creation
    getOwner() ? createRenderEffect(() => linkState(a), state => apply(a, rec, state)) : refresh(a, rec);
  }));
}
function setupNativeEvents({
  preload = true,
  explicitLinks = false,
  actionBase = "/_server",
  transformUrl
} = {}) {
  return router => {
    const basePath = router.base.path();
    const navigateFromRoute = router.navigatorFactory(router.base);
    let preloadTimeout;
    let lastElement;
    function isSvg(el) {
      return el.namespaceURI === "http://www.w3.org/2000/svg";
    }
    function handleAnchor(evt) {
      if (evt.defaultPrevented || evt.button !== 0 || evt.metaKey || evt.altKey || evt.ctrlKey || evt.shiftKey) return;
      const a = evt.composedPath().find(el => el instanceof Node && el.nodeName.toUpperCase() === "A");
      if (!a || explicitLinks && !a.hasAttribute("link")) return;
      const svg = isSvg(a);
      const href = svg ? a.href.baseVal : a.href;
      const target = svg ? a.target.baseVal : a.target;
      if (target || !href && !a.hasAttribute("state")) return;
      const rel = (a.getAttribute("rel") || "").split(/\s+/);
      if (a.hasAttribute("download") || rel && rel.includes("external")) return;
      const url = svg ? new URL(href, document.baseURI) : new URL(href);
      if (url.origin !== window.location.origin || basePath && url.pathname && !url.pathname.toLowerCase().startsWith(basePath.toLowerCase())) return;
      return [a, url];
    }
    function handleAnchorClick(evt) {
      const res = handleAnchor(evt);
      if (!res) return;
      const [a, url] = res;
      const to = router.parsePath(url.pathname + url.search + url.hash);
      const state = a.getAttribute("state");
      evt.preventDefault();
      navigateFromRoute(to, {
        resolve: false,
        replace: a.hasAttribute("replace"),
        scroll: !a.hasAttribute("noscroll"),
        state: state ? JSON.parse(state) : undefined
      });
    }
    function handleAnchorPreload(evt) {
      const res = handleAnchor(evt);
      if (!res) return;
      const [a, url] = res;
      transformUrl && (url.pathname = transformUrl(url.pathname));
      router.preloadRoute(url, a.getAttribute("preload") !== "false");
    }
    function handleAnchorMove(evt) {
      clearTimeout(preloadTimeout);
      const res = handleAnchor(evt);
      if (!res) return lastElement = null;
      const [a, url] = res;
      if (lastElement === a) return;
      transformUrl && (url.pathname = transformUrl(url.pathname));
      preloadTimeout = setTimeout(() => {
        router.preloadRoute(url, a.getAttribute("preload") !== "false");
        lastElement = a;
      }, 20);
    }
    function handleFormSubmit(evt) {
    }

    // ensure delegated event run first
    delegateEvents(["click", "submit"]);
    document.addEventListener("click", handleAnchorClick);
    if (preload) {
      document.addEventListener("mousemove", handleAnchorMove, {
        passive: true
      });
      document.addEventListener("focusin", handleAnchorPreload, {
        passive: true
      });
      document.addEventListener("touchstart", handleAnchorPreload, {
        passive: true
      });
    }
    document.addEventListener("submit", handleFormSubmit);
    onCleanup(() => {
      document.removeEventListener("click", handleAnchorClick);
      if (preload) {
        document.removeEventListener("mousemove", handleAnchorMove);
        document.removeEventListener("focusin", handleAnchorPreload);
        document.removeEventListener("touchstart", handleAnchorPreload);
      }
      document.removeEventListener("submit", handleFormSubmit);
    });
  };
}

// ---------------------------------------------------------------------------
// RoutePaths<R> — the proxy's type, derived from the route tree
// ---------------------------------------------------------------------------

/** Collects a maximal run of required params (and a trailing splat) into one call's argument tuple. */

/** The search param types a route end carries: input builds URLs, output is what parsing returns. */

/** Terminating calls available on every route end: zero-arg, or search object plus optional hash. */

/**
 * The type of a router instance's `paths` proxy for a given route tree.
 * Requires the tree to be a literal tuple (`as const` or a `const` type
 * param); non-literal trees fall back to an untyped proxy.
 */

/** Extracts the params record a paths node binds, as runtime (string-valued) params. */

// ---------------------------------------------------------------------------
// Runtime
// ---------------------------------------------------------------------------

const encodeParam = value => String(value).split("/").map(encodeURIComponent).join("/");

/**
 * Creates the runtime path proxy. It is instance-scoped: `renderPath` comes
 * from the router's history adapter (eg. hash routing prefixes `#`), and
 * `base` is baked into every produced path.
 */
function createPathsProxy(renderPath = p => p, base = "") {
  const toHref = (pathname, suffix = "") => renderPath(pathname || "/") + suffix;
  function node(pathname) {
    const build = (...args) => {
      let path = pathname;
      for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (typeof arg === "object" && arg !== null) {
          // a search object terminates; an optional hash string may follow
          const hash = typeof args[i + 1] === "string" ? `#${args[i + 1]}` : "";
          return toHref(path, mergeSearchString("", arg) + hash);
        }
        path += `/${encodeParam(arg)}`;
      }
      // zero-arg calls terminate; param-only calls stay chainable
      return args.length ? node(path) : toHref(path);
    };
    return new Proxy(build, {
      get(_, prop) {
        if (prop === "toString") return () => toHref(pathname);
        if (typeof prop === "symbol") return prop === Symbol.toPrimitive ? () => toHref(pathname) : undefined;
        return node(`${pathname}/${prop}`);
      }
    });
  }
  return node(normalizePath(base));
}

function createBeforeLeave() {
  let listeners = new Set();
  function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }
  let ignore = false;
  function confirm(to, options) {
    if (ignore) return !(ignore = false);
    const e = {
      to,
      options,
      defaultPrevented: false,
      preventDefault: () => e.defaultPrevented = true
    };
    for (const l of listeners) l.listener({
      to,
      options,
      // delegate to the shared event so later listeners' preventDefault
      // calls are observable from earlier listeners
      get defaultPrevented() {
        return e.defaultPrevented;
      },
      preventDefault: e.preventDefault,
      from: l.location,
      retry: force => {
        force && (ignore = true);
        l.navigate(to, {
          ...options,
          resolve: false
        });
      }
    });
    return !e.defaultPrevented;
  }
  return {
    subscribe,
    confirm
  };
}

// The following supports browser initiated blocking (eg back/forward)

let depth;
function saveCurrentDepth() {
  if (!window.history.state || window.history.state._depth == null) {
    window.history.replaceState({
      ...window.history.state,
      _depth: window.history.length - 1
    }, "");
  }
  depth = window.history.state._depth;
}
if (!isServer) {
  saveCurrentDepth();
}
function keepDepth(state) {
  return {
    ...state,
    _depth: window.history.state && window.history.state._depth
  };
}
function notifyIfNotBlocked(notify, block) {
  let ignore = false;
  return () => {
    const prevDepth = depth;
    saveCurrentDepth();
    const delta = prevDepth == null ? null : depth - prevDepth;
    if (ignore) {
      ignore = false;
      return;
    }
    if (delta && block(delta)) {
      ignore = true;
      window.history.go(-delta);
    } else {
      notify();
    }
  };
}

// The flash cookie's name and one-shot clearing — split from the codec in
// flash.ts so the router core can consume the cookie eagerly (the clear must
// be appended before streaming flushes the response headers, and an unread
// outcome must not haunt a later request) without carrying the encode/decode
// machinery into client bundles that never load the action layer.

const FLASH_COOKIE = "flash";
const FLASH_MATCHER = new RegExp(`(?:^|;\\s*)${FLASH_COOKIE}=([^;]+)`);

/** Whether a Cookie header carries a flash cookie (readable or not). */
function hasFlashCookie(cookieHeader) {
  return !!cookieHeader && FLASH_MATCHER.test(cookieHeader);
}

/** The Set-Cookie value clearing the flash cookie after it has been read. */
function clearFlashCookie() {
  return `${FLASH_COOKIE}=; Max-Age=0; Path=/`;
}

const MAX_REDIRECTS = 100;

/** Consider this API opaque and internal. It is likely to change in the future. */
const RouterContextObj = createContext();
const RouteContextObj = createContext();
function useOptionalContext(context) {
  try {
    return useContext(context);
  } catch {
    return undefined;
  }
}

// Encodes a static path segment like `encodeURIComponent`, but leaves RFC 3986
// pchar characters (sub-delims / ":" / "@") literal, matching how browsers
// report them in `location.pathname`. Non-ASCII characters (eg. CJK paths) are
// still percent-encoded exactly as before, since browsers encode those too.
const encodeSegment = s => encodeURIComponent(s).replace(/%(2B|40|3A|24|26|2C|3B|3D)/g, m => decodeURIComponent(m));
function createRoutes(routeDef, base = "") {
  const {
    component,
    preload,
    children,
    info
  } = routeDef;
  const isLeaf = !children || Array.isArray(children) && !children.length;
  const shared = {
    key: routeDef,
    component,
    preload,
    info
  };
  return asArray(routeDef.path).reduce((acc, originalPath) => {
    for (const expandedPath of expandOptionals(originalPath)) {
      const path = joinPaths(base, expandedPath);
      let pattern = isLeaf ? path : path.split("/*", 1)[0];
      pattern = pattern.split("/").map(s => {
        return s.startsWith(":") || s.startsWith("*") ? s : encodeSegment(s);
      }).join("/");
      acc.push({
        ...shared,
        originalPath,
        pattern,
        matcher: createMatcher(pattern, !isLeaf, routeDef.matchFilters)
      });
    }
    return acc;
  }, []);
}
function createBranch(routes, index = 0) {
  return {
    routes,
    score: scoreRoute(routes[routes.length - 1]) * 10000 - index,
    matcher(location) {
      const matches = [];
      for (let i = routes.length - 1; i >= 0; i--) {
        const route = routes[i];
        const match = route.matcher(location);
        if (!match) {
          return null;
        }
        matches.unshift({
          ...match,
          route
        });
      }
      return matches;
    }
  };
}
function asArray(value) {
  return Array.isArray(value) ? value : [value];
}
function createBranches(routeDef, base = "", stack = [], branches = []) {
  const routeDefs = asArray(routeDef);
  for (let i = 0, len = routeDefs.length; i < len; i++) {
    const def = routeDefs[i];
    if (def && typeof def === "object") {
      if (!def.hasOwnProperty("path")) def.path = "";
      const routes = createRoutes(def, base);
      for (const route of routes) {
        stack.push(route);
        const isEmptyArray = Array.isArray(def.children) && def.children.length === 0;
        if (def.children && !isEmptyArray) {
          createBranches(def.children, route.pattern, stack, branches);
        } else {
          const branch = createBranch([...stack], branches.length);
          branches.push(branch);
        }
        stack.pop();
      }
    }
  }

  // Stack will be empty on final return
  return stack.length ? branches : branches.sort((a, b) => b.score - a.score);
}
function getRouteMatches(branches, location) {
  for (let i = 0, len = branches.length; i < len; i++) {
    const match = branches[i].matcher(location);
    if (match) {
      return match;
    }
  }
  return [];
}
function mergeParams(matches) {
  const params = {};
  for (let i = 0; i < matches.length; i++) {
    Object.assign(params, matches[i].params);
  }
  return params;
}
function createLocation(path, state, queryWrapper) {
  const origin = new URL(mockBase);
  const url = createMemo((prev = origin) => {
    const path_ = path();
    try {
      // anchor rooted paths against the origin explicitly - a path with
      // doubled leading slashes would otherwise parse as protocol-relative
      return new URL(path_[0] === "/" ? mockBase + path_ : path_, origin);
    } catch (err) {
      console.error(`Invalid path ${path_}`);
      return prev;
    }
  }, {
    equals: (a, b) => a.href === b.href
  });
  const pathname = createMemo(() => url().pathname);
  const search = createMemo(() => url().search);
  const hash = createMemo(() => url().hash);
  const key = () => "";
  const queryFn = createMemo(() => extractSearchParams(url()));
  return {
    get pathname() {
      return pathname();
    },
    get search() {
      return search();
    },
    get hash() {
      return hash();
    },
    get state() {
      return state();
    },
    get key() {
      return key();
    },
    query: queryWrapper ? queryWrapper(queryFn) : createMemoObject(queryFn)
  };
}

/**
 * Rendezvous between the router and the data layer's single-flight consumer.
 * The Router registers itself at mount (unless `singleFlight={false}`); the
 * action side provides the consumer factory when the first action is created
 * (see data/action.ts). Whichever side arrives first waits for the other, so
 * an action module loaded lazily (a code-split route) still attaches to the
 * already-mounted router — and a router-only app, where no action ever
 * loads, never subscribes to the transport, so the server is never asked to
 * collect.
 */
let flightConsumerFactory;
const flightRouters = new Map();
function registerFlightRouter(router) {
  flightRouters.set(router, flightConsumerFactory);
  return () => {
    const unsubscribe = flightRouters.get(router);
    flightRouters.delete(router);
    unsubscribe && unsubscribe();
  };
}
let intent;
function getIntent() {
  return intent;
}
function createRouterContext(integration, branches, getContext, options = {}) {
  const {
    signal: [source, setSource],
    utils = {}
  } = integration;
  const parsePath = utils.parsePath || (p => p);
  const renderPath = utils.renderPath || (p => p);
  const beforeLeave = utils.beforeLeave || createBeforeLeave();
  const basePath = resolvePath("", options.base || "");
  const initialSource = untrack(source);
  if (basePath === undefined) {
    throw new Error(`${basePath} is not a valid base path`);
  } else if (basePath && !initialSource.value) {
    setSource({
      value: basePath,
      replace: true,
      scroll: false
    });
  }
  const [isRouting, setIsRouting] = createSignal(false, {
    ownedWrite: true
  });

  // Navigate override written from event handlers.
  const [navigateTarget, setNavigateTarget] = createSignal(undefined, {
    ownedWrite: true
  });

  // Keep track of last target, so that last call to navigate wins
  let lastTransitionTarget;

  // source() remains canonical for native history changes; navigateTarget()
  // temporarily overrides it for in-flight programmatic navigation.
  const effective = createMemo(() => navigateTarget() ?? source());
  const location = createLocation(() => effective().value, () => effective().state, utils.queryWrapper);
  const referrers = [];
  if (isServer) {
    const e = getRequestEvent();
    if (e && !(e.router && e.router.submission)) {
      const cookieHeader = e.request.headers.get("cookie");
      if (hasFlashCookie(cookieHeader)) {
        // one-shot: clear it even when unreadable so it can't haunt later renders
        if (e.response && e.response.headers) e.response.headers.append("Set-Cookie", clearFlashCookie());
      }
    }
  }
  let submissions;
  const matches = createMemo(() => {
    if (typeof options.transformUrl === "function") {
      return getRouteMatches(branches(), options.transformUrl(location.pathname));
    }
    return getRouteMatches(branches(), location.pathname);
  });
  const buildParams = () => mergeParams(matches());
  const wrapParams = utils.paramsWrapper ? getParams => utils.paramsWrapper(getParams, branches) : getParams => createMemoObject(getParams);
  const params = wrapParams(buildParams);
  const baseRoute = {
    pattern: basePath,
    params,
    path: () => basePath,
    outlet: () => null,
    resolvePath(to) {
      return resolvePath(basePath, to);
    }
  };
  return {
    base: baseRoute,
    location,
    params,
    wrapParams,
    isRouting,
    get pendingTarget() {
      return lastTransitionTarget;
    },
    renderPath,
    parsePath,
    navigatorFactory,
    matches,
    beforeLeave,
    preloadRoute,
    singleFlight: options.singleFlight === undefined ? true : options.singleFlight,
    get submissions() {
      return submissions ||= createSignal(isServer ? initSubmissions() : [], {
        ownedWrite: true
      });
    }
  };
  function navigateFromRoute(route, to, options) {
    // Untrack in case someone navigates in an effect - don't want to track `reference` or route paths
    untrack(() => {
      if (typeof to === "number") {
        if (!to) ; else if (utils.go) {
          utils.go(to);
        } else {
          console.warn("Router integration does not support relative routing");
        }
        return;
      }
      // typed path proxy nodes coerce to their href
      if (typeof to !== "string") to = to.toString();
      const queryOnly = !to || to[0] === "?";
      const {
        replace,
        resolve,
        scroll,
        state: nextState
      } = {
        replace: false,
        resolve: !queryOnly,
        scroll: true,
        ...options
      };
      const resolvedTo = resolve ? route.resolvePath(to) : resolvePath(queryOnly && location.pathname || "", to);
      if (resolvedTo === undefined) {
        throw new Error(`Path '${to}' is not a routable path`);
      } else if (referrers.length >= MAX_REDIRECTS) {
        throw new Error("Too many redirects");
      }
      const current = effective();
      if (resolvedTo !== current.value || nextState !== current.state) {
        if (isServer) {
          const e = getRequestEvent();
          e && (e.response = {
            status: 302,
            headers: new Headers({
              Location: resolvedTo
            })
          });
          setSource({
            value: resolvedTo,
            replace,
            scroll,
            state: nextState
          });
        } else if (beforeLeave.confirm(resolvedTo, options)) {
          referrers.push({
            value: current.value,
            replace,
            scroll,
            state: current.state
          });
          const newTarget = {
            value: resolvedTo,
            state: nextState
          };
          const firstNavigation = lastTransitionTarget === undefined;
          intent = "navigate";
          // assign the target before flushing so effects that run for the
          // isRouting flip (e.g. pending link state) can read it
          lastTransitionTarget = newTarget;
          if (firstNavigation) {
            setIsRouting(true);
            flush();
          }
          if (lastTransitionTarget === newTarget) {
            setNavigateTarget({
              ...lastTransitionTarget
            });
            queueMicrotask(() => {
              if (lastTransitionTarget !== newTarget) return;
              intent = undefined;
              navigateEnd(lastTransitionTarget);
              setNavigateTarget(undefined);
              setIsRouting(false);
              lastTransitionTarget = undefined;
            });
          }
        }
      }
    });
  }
  function navigatorFactory(route) {
    // Workaround for vite issue (https://github.com/vitejs/vite/issues/3803)
    route = route || useOptionalContext(RouteContextObj) || baseRoute;
    return (to, options) => navigateFromRoute(route, to, options);
  }
  function navigateEnd(next) {
    const first = referrers[0];
    if (first) {
      setSource({
        ...next,
        replace: first.replace,
        scroll: first.scroll
      });
      referrers.length = 0;
    }
  }
  function preloadRoute(url, preloadData) {
    const matches = getRouteMatches(branches(), url.pathname);
    const prevIntent = intent;
    intent = "preload";
    for (let match in matches) {
      const {
        route,
        params
      } = matches[match];
      route.component && route.component.preload && route.component.preload();
      const {
        preload
      } = route;
      preloadData && preload && runWithOwner(getContext(), () => preload({
        params,
        location: {
          pathname: url.pathname,
          search: url.search,
          hash: url.hash,
          query: extractSearchParams(url),
          state: null,
          key: ""
        },
        intent: "preload"
      }));
    }
    intent = prevIntent;
  }

  // Seeds the initial submission from a no-JS form post: the server
  // function handler redirected back with the outcome in a one-shot flash
  // cookie (see src/server.ts's handleNoJS), consumed eagerly above and
  // decoded here — so the post-redirect SSR renders useSubmission() state
  // exactly as a scripted submission would. An explicitly pre-seeded
  // `event.router.submission` (framework integrations) takes precedence.
  function initSubmissions() {
    const e = getRequestEvent();
    const submission = e && e.router && e.router.submission || (undefined);
    if (!submission) return [];
    return [{
      ...submission,
      clear() {},
      retry() {}
    }];
  }
}
function createRouteContext(router, parent, outlet, match, matches = () => [match()]) {
  const {
    base,
    location,
    wrapParams
  } = router;
  const {
    pattern,
    component,
    preload
  } = match().route;
  const path = createMemo(() => match().path);
  // Params scoped to this route's lifetime. `matches` is expected to retain
  // its last valid value while this route is being torn down, so outgoing
  // components and preloads never observe another route's params.
  const params = wrapParams(() => mergeParams(matches()));
  component && component.preload && component.preload();
  const data = preload ? preload({
    params,
    location,
    intent: intent || "initial"
  }) : undefined;
  const route = {
    parent,
    pattern,
    params,
    path,
    outlet: () => component ? createComponent$1(component, {
      params,
      location,
      data,
      get children() {
        return outlet();
      }
    }) : outlet(),
    resolvePath(to) {
      return resolvePath(base.path(), to, path());
    }
  };
  return route;
}

function Root(props) {
  const location = props.routerState.location;
  const params = props.routerState.params;
  const data = createMemo(() => props.preload && untrack(() => {
    try {
      return props.preload({
        params,
        location,
        intent: getIntent() || "initial"
      });
    } finally {
    }
  }));
  const RootComp = props.root;
  if (RootComp) {
    return createComponent(RootComp, {
      params: params,
      location: location,
      get data() {
        return data();
      },
      get children() {
        return props.children;
      }
    });
  }
  return props.children;
}
function Routes(props) {
  if (isServer) {
    const e = getRequestEvent();
    if (e && e.router && e.router.dataOnly) {
      dataOnly(e, props.routerState, props.branches);
      return;
    }
    e && ((e.router || (e.router = {})).matches || (e.router.matches = props.routerState.matches().map(({
      route,
      path,
      params
    }) => ({
      path: route.originalPath,
      pattern: route.pattern,
      match: path,
      params,
      info: route.info
    }))));
  }
  const disposers = [];
  let root;
  let prevMatches;
  // dispose the detached per-route roots when this component unmounts, otherwise
  // they stay subscribed to `matches` and crash on a later navigation (#451)
  onCleanup(() => disposers.forEach(dispose => dispose()));
  // Route roots must outlive re-runs of the `routeStates` memo below, so they
  // are created under the owner of this component rather than the memo's
  // computation (which disposes its children every time it re-runs).
  const owner = getOwner();
  const routeStates = createMemo(prev => {
    const nextMatches = props.routerState.matches();
    const previousMatches = prevMatches;
    let equal = previousMatches && nextMatches.length === previousMatches.length;
    const next = [];
    for (let i = 0, len = nextMatches.length; i < len; i++) {
      const prevMatch = previousMatches && previousMatches[i];
      const nextMatch = nextMatches[i];
      if (prev && prevMatch && nextMatch.route.key === prevMatch.route.key) {
        next[i] = prev[i];
      } else {
        equal = false;
        if (disposers[i]) {
          disposers[i]();
        }
        runWithOwner(owner, () => createRoot(dispose => {
          disposers[i] = dispose;
          const routeKey = nextMatch.route.key;
          // Retain the last matches in which this route participated so
          // that its components and preloads never observe another
          // route's params/path while this route is being torn down.
          const matchesAtLevel = createMemo(prev => {
            const routeMatches = props.routerState.matches();
            const m = routeMatches[i];
            return m && m.route.key === routeKey ? routeMatches : prev || nextMatches;
          });
          next[i] = createRouteContext(props.routerState, next[i - 1] || props.routerState.base, createOutlet(() => routeStates()?.[i + 1]), () => matchesAtLevel()[i], matchesAtLevel);
        }));
      }
    }
    disposers.splice(nextMatches.length).forEach(dispose => dispose());
    if (prev && equal) {
      prevMatches = nextMatches;
      return prev;
    }
    root = next[0];
    prevMatches = nextMatches;
    return next;
  });
  const outlet = createOutlet(() => routeStates() && root);
  return memo(outlet);
}
const createOutlet = child => {
  return () => {
    const c = child();
    if (c) {
      return createComponent(RouteContextObj, {
        value: c,
        get children() {
          return c.outlet();
        }
      });
    }
    return undefined;
  };
};

// for data only mode with single flight mutations
function dataOnly(event, routerState, branches) {
  const url = new URL(event.request.url);
  const prevMatches = getRouteMatches(branches, new URL(event.router.previousUrl || event.request.url).pathname);
  const matches = getRouteMatches(branches, url.pathname);
  for (let match = 0; match < matches.length; match++) {
    if (!prevMatches[match] || matches[match].route !== prevMatches[match].route) event.router.dataOnly = true;
    const {
      route,
      params
    } = matches[match];
    route.preload && route.preload({
      params,
      location: routerState.location,
      intent: "preload"
    });
  }
}

function bindEvent(target, type, handler) {
  target.addEventListener(type, handler);
  return () => target.removeEventListener(type, handler);
}
function scrollToHash(hash, fallbackTop) {
  const el = hash && document.getElementById(hash);
  if (el) {
    el.scrollIntoView();
  } else if (fallbackTop) {
    window.scrollTo(0, 0);
  }
}

/**
 * A history adapter: the source of truth for the current URL and how
 * navigations write back to it. Adapters are plain imported values so
 * unused ones never enter the bundle — `createRouter` defaults to browser
 * history on the client and the request URL on the server.
 */

function browserHistory() {
  const getSource = () => {
    const url = window.location.pathname + window.location.search;
    const state = window.history.state && window.history.state._depth && Object.keys(window.history.state).length === 1 ? undefined : window.history.state;
    return {
      value: url + window.location.hash,
      state
    };
  };
  const beforeLeave = createBeforeLeave();
  return {
    get: getSource,
    set({
      value,
      replace,
      scroll,
      state
    }) {
      if (replace) {
        window.history.replaceState(keepDepth(state), "", value);
      } else {
        window.history.pushState(state, "", value);
      }
      scrollToHash(decodeURIComponent(window.location.hash.slice(1)), scroll);
      saveCurrentDepth();
    },
    init: notify => bindEvent(window, "popstate", notifyIfNotBlocked(notify, delta => {
      if (delta) {
        return !beforeLeave.confirm(delta);
      } else {
        const s = getSource();
        return !beforeLeave.confirm(s.value, {
          state: s.state
        });
      }
    })),
    utils: {
      go: delta => window.history.go(delta),
      beforeLeave
    }
  };
}
/** Wraps a history adapter in the integration signal the router core consumes. Must run under a reactive owner. */
function createIntegration(history) {
  let ignore = false;
  const wrap = value => typeof value === "string" ? {
    value
  } : value;
  const [read, write] = createSignal(wrap(history.get()), {
    equals: (a, b) => a.value === b.value && a.state === b.state,
    ownedWrite: true
  });
  const signal = [read, next => {
    !ignore && history.set(next);
    if (sharedConfig.registry && !sharedConfig.done) sharedConfig.done = true;
    write(next);
  }];
  history.init && onCleanup(history.init((value = history.get()) => {
    ignore = true;
    signal[1](wrap(value));
    ignore = false;
  }));
  return {
    signal,
    utils: history.utils
  };
}

/**
 * Server default: a static view of the request URL — no signal machinery, a
 * server render never navigates. Without a request event (SSG scripts,
 * server-side tests) the configured history adapter provides the location,
 * so e.g. `memoryHistory("/page")` works isomorphically.
 */
function staticIntegration(history) {
  const e = getRequestEvent();
  let value = "";
  if (e) {
    const url = new URL(e.request.url);
    value = url.pathname + url.search;
  } else if (history) {
    value = history.get();
  }
  const obj = typeof value === "string" ? {
    value
  } : {
    ...value
  };
  return {
    signal: [() => obj, next => Object.assign(obj, next)],
    utils: history && history.utils
  };
}
function createRouter(config) {
  const basePath = config.base || "";
  // Routes are immutable per instance, so matching compiles once at factory
  // time and is shared by every mount, request, and `match()` call.
  const branches = createBranches(config.routes, basePath);
  const renderPath = config.history && config.history.utils && config.history.utils.renderPath || undefined;
  function RouterComponent(props) {
    const root = untrack(() => props.children);
    const integration = isServer ? staticIntegration(config.history) : createIntegration(config.history || browserHistory());
    let context;
    const routerState = createRouterContext(integration, () => branches, () => context, {
      base: basePath,
      singleFlight: config.singleFlight,
      transformUrl: config.transformUrl
    });
    if (!isServer) {
      setupNativeEvents({
        preload: config.preloadLinks,
        explicitLinks: config.explicitLinks,
        actionBase: config.actionBase,
        transformUrl: config.transformUrl
      })(routerState);
      setupLinkClaims(routerState, config.explicitLinks);
      if (routerState.singleFlight) onCleanup(registerFlightRouter(routerState));
    }
    return createComponent(RouterContextObj, {
      value: routerState,
      get children() {
        return createComponent(Root, {
          routerState: routerState,
          root: root,
          get preload() {
            return config.preload;
          },
          get children() {
            return [memo(() => (context = getOwner()) && null), createComponent(Routes, {
              routerState: routerState,
              branches: branches
            })];
          }
        });
      }
    });
  }
  return Object.assign(RouterComponent, {
    paths: createPathsProxy(renderPath, basePath),
    routes: config.routes,
    config,
    match(url) {
      const u = new URL(url, mockBase);
      const pathname = config.transformUrl ? config.transformUrl(u.pathname) : u.pathname;
      return getRouteMatches(branches, pathname).map(({
        route,
        path,
        params
      }) => ({
        path: route.originalPath,
        pattern: route.pattern,
        match: path,
        params,
        info: route.info
      }));
    }
  });
}
const CACHE_TIMEOUT = 180000;
let cacheMap = new Map();

// cleanup forward/back cache
if (!isServer) {
  setInterval(() => {
    const now = Date.now();
    for (let [k, v] of cacheMap.entries()) {
      if (!v[4].count && now - v[0] > CACHE_TIMEOUT) {
        cacheMap.delete(k);
      }
    }
  }, 300000);
}

console.log(createRouter({ routes: [{ path: "/" }] }));
