import { createContext, createSignal, untrack, onCleanup, getOwner, createRenderEffect, useContext, createMemo, NotReadyError, isPending, runWithOwner, createRoot, createEffect, flush, sharedConfig, createComponent as createComponent$1, action, getObserver } from 'solid-js';
import { isServer, createComponent, memo, registerElementClaim, delegateEvents, getRequestEvent, REVALIDATE_HEADER, isResponseEnvelope } from '@solidjs/web';
import { hasFlashCookie, clearFlashCookie, createServerReference, subscribeFlightData, decodeResponsePayload, isServerFunction, getServerFunctionMetadata, GET, decodeResponse } from '@solidjs/web/server-functions';
import { decodeFlashCookie } from '@solidjs/web/server-functions/server';

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
function invariant(value, message) {
  if (value == null) {
    throw new Error(message);
  }
  return value;
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
function setFunctionName(obj, value) {
  Object.defineProperty(obj, "name", {
    value,
    writable: false,
    configurable: false
  });
  return obj;
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
 * portals) are correct immediately. One render effect (owned by the router)
 * subscribes to the location and sweeps a registry of claimed anchors —
 * anchors themselves carry no reactive machinery, just a registry entry
 * removed by their creating owner's cleanup. State is applied once at claim
 * so it is correct before the next navigation; re-claims (an `href` write)
 * are the same one-shot untracked refresh, reading the element's current
 * `href` from the DOM.
 */
function setupLinkClaims(router, explicitLinks) {
  const basePath = router.base.path();
  // per-element record; `current` remembers whether we set `aria-current`,
  // so user-authored values (steppers, breadcrumbs) are never stripped
  const claimed = new WeakMap();
  const registry = new Set();
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

  // The one subscription for every anchor: compute tracks the sources
  // linkState derives from (the in-flight pendingTarget is readable in the
  // effect phase because the isRouting write flushes after the target is
  // assigned), the effect phase sweeps the registry untracked.
  //
  // `transparent` keeps the effect invisible to the hydration id scheme.
  // This setup is client-only, so an id-consuming node here has no server
  // counterpart and every subsequent hydration id would shift by one child
  // slot — lazy-route lookups miss and hydration leaves server nodes
  // unclaimed. (The option is honored by the runtime but missing from the
  // published EffectOptions type, hence the cast.)
  createRenderEffect(() => (router.location.pathname, router.isRouting()), () => registry.forEach(a => refresh(a, claimed.get(a))), {
    transparent: true
  });
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
    // practice to bound the registry entry's lifetime; without one, state
    // is still applied once at creation
    if (getOwner()) {
      registry.add(a);
      onCleanup(() => registry.delete(a));
    }
    refresh(a, rec);
  }));
}

/**
 * The submit delegation consults this slot instead of importing the action
 * module: the action side installs its handler on first action creation
 * (see data/action.ts), so an app that never creates an action never pulls
 * the data layer into its bundle through the router's event wiring.
 */

let formHandler;
function setRouterFormHandler(handler) {
  formHandler = handler;
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
      if (formHandler) return formHandler(evt, router, actionBase);
      // No form handler means no action module in the client graph at all
      // (e.g. server components binding forms straight to server functions).
      // A POST to a url under actionBase is self-describing, so delegation
      // is still sufficient: intercept synchronously — the no-JS treatment
      // is reserved for clients with no JS — capture the FormData, and load
      // the handler lazily. Apps that never submit one never load it.
      if (evt.defaultPrevented) return;
      const form = evt.target;
      const ref = evt.submitter && evt.submitter.hasAttribute("formaction") ? evt.submitter.getAttribute("formaction") : form.getAttribute("action");
      if (!ref || ref.startsWith("https://action/")) return;
      const url = new URL(ref, document.baseURI);
      const path = router.parsePath(url.pathname + url.search);
      if (!path.startsWith(actionBase) || form.method.toUpperCase() !== "POST") return;
      evt.preventDefault();
      const data = new FormData(form, evt.submitter);
      Promise.resolve().then(function () { return serverForms; }).then(m => m.submitServerForm(router, path, form, data));
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
 * Sees through a lazy `children` thunk: the routes the import's promise
 * resolves to (its `default` or `routes` export, matching the runtime) type
 * exactly like inline children. Only tables genuinely built at runtime —
 * where the thunk's return type is a plain `RouteDefinition[]` — degrade to
 * untyped, definitionally.
 */

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
const useRouter = () => invariant(useContext(RouterContextObj), "<A> and 'use' router primitives can be only used inside a Route.");

/**
 * Retrieves method to do navigation. The method accepts a path to navigate to and an optional object with the following options:
 * 
 * - resolve (*boolean*, default `true`): resolve the path against the current route
 * - replace (*boolean*, default `false`): replace the history entry
 * - scroll (*boolean*, default `true`): scroll to top after navigation
 * - state (*any*, default `undefined`): pass custom state to `location.state`
 * 
 * **Note**: The state is serialized using the structured clone algorithm which does not support all object types.
 * 
 * @example
 * ```js
 * const navigate = useNavigate();
 * 
 * if (unauthorized) {
 *   navigate("/login", { replace: true });
 * }
 * ```
 */
const useNavigate = () => useRouter().navigatorFactory();

// Encodes a static path segment like `encodeURIComponent`, but leaves RFC 3986
// pchar characters (sub-delims / ":" / "@") literal, matching how browsers
// report them in `location.pathname`. Non-ASCII characters (eg. CJK paths) are
// still percent-encoded exactly as before, since browsers encode those too.
const encodeSegment = s => encodeURIComponent(s).replace(/%(2B|40|3A|24|26|2C|3B|3D)/g, m => decodeURIComponent(m));

// ---------------------------------------------------------------------------
// Lazy route subtrees
// ---------------------------------------------------------------------------
//
// A `children` thunk (`() => import("./feature/routes")`) is a *boundary*:
// until it resolves, the compiled tree carries a param-less catch-all
// placeholder branch under the boundary's pattern (splat-scored, so static
// siblings still win). Resolution is append-only and cached per thunk, then a
// module-level version signal bumps and every `branches()` consumer
// recompiles — matches, params, and route states all react. The placeholder's
// component reads a memo of the resolution promise, which keeps the enclosing
// navigation transition pending exactly like a `lazy()` route component; its
// `preload` *is* the resolver, so hover-intent preloading kicks the table
// load through the existing component-preload path.

const lazyBoundaries = new WeakMap();
// Module scope: boundary resolution is global, deterministic state (same
// thunk -> same routes), shared by every factory instance and the server's
// flight collector.
const [lazyTreeVersion, setLazyTreeVersion] = createSignal(0);

/** Reactive read of the lazy-subtree version — recompile compiled branches when it changes. */
function trackLazySubtrees() {
  return lazyTreeVersion();
}
function getLazyBoundary(thunk) {
  let record = lazyBoundaries.get(thunk);
  if (!record) lazyBoundaries.set(thunk, record = {
    thunk
  });
  return record;
}

/**
 * Kicks (or joins) a boundary's resolution. Returns the resolved routes
 * synchronously once available, the in-flight promise otherwise. Commit is
 * always async — even for thunks returning arrays — so the version bump
 * never writes a signal from inside a render computation.
 */
function resolveLazySubtree(record) {
  if (record.resolved) return record.resolved;
  return record.promise ||= Promise.resolve(record.thunk()).then(m => {
    const routes = Array.isArray(m) ? m : m.default || m.routes || [];
    record.resolved = routes;
    setLazyTreeVersion(v => v + 1);
    return record.resolved;
  });
}

/**
 * The unresolved boundaries in a match chain. Rendering gates on these (the
 * route-states memo suspends until they land — see routers/components.tsx)
 * and the server's flight collector awaits them before its preload pass.
 */
function unresolvedLazyMatches(matches) {
  const pending = [];
  for (const match of matches) if (match.route.lazy && !match.route.lazy.resolved) pending.push(match.route.lazy);
  return pending;
}
function createLazyPlaceholder(pattern, record) {
  // The placeholder never renders and needs no component — `matches` parks
  // on unresolved boundaries before route contexts are created (kicking the
  // resolver as it does), preloadRoute kicks it directly, and the version
  // bump swaps in the real routes. `path + "/*"` with no splat name matches
  // the boundary itself and everything beneath it without recording a param
  // (createMatcher skips empty splat names).
  const placeholderPattern = pattern + "/*";
  return {
    key: record,
    originalPath: "*",
    pattern: placeholderPattern,
    matcher: createMatcher(placeholderPattern),
    lazy: record
  };
}
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
        let children = def.children;
        if (typeof children === "function") {
          const record = getLazyBoundary(children);
          if (record.resolved) {
            children = record.resolved;
          } else {
            // unresolved boundary: a catch-all placeholder holds its ground
            stack.push(createLazyPlaceholder(route.pattern, record));
            branches.push(createBranch([...stack], branches.length));
            stack.pop();
            stack.pop();
            continue;
          }
        }
        const isEmptyArray = Array.isArray(children) && children.length === 0;
        if (children && !isEmptyArray) {
          createBranches(children, route.pattern, stack, branches);
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
  flightRouters.set(router, flightConsumerFactory && flightConsumerFactory(router));
  return () => {
    const unsubscribe = flightRouters.get(router);
    flightRouters.delete(router);
    unsubscribe && unsubscribe();
  };
}
function provideFlightConsumer(factory) {
  if (flightConsumerFactory) return;
  flightConsumerFactory = factory;
  for (const [router, unsubscribe] of flightRouters) {
    if (!unsubscribe) flightRouters.set(router, factory(router));
  }
}

/**
 * The flash-cookie codec, provided by the action side (data/action.ts) so
 * the router core never carries it: the core consumes the cookie eagerly
 * per request (detection + one-shot clear via the runtime's isomorphic half)
 * but defers decoding to this slot, read when the submissions signal
 * initializes. Actions are created at module scope, so on the server the
 * decoder is always installed before useSubmission can read — and a
 * router-only app, where it never installs, has no actions that could have
 * produced a flash cookie in the first place.
 */
let flashDecoder;
function provideFlashDecoder(decoder) {
  flashDecoder || (flashDecoder = decoder);
}
let intent;
function getIntent() {
  return intent;
}
let inPreloadFn = false;
function getInPreloadFn() {
  return inPreloadFn;
}
function setInPreloadFn(value) {
  inPreloadFn = value;
}
function createRouterContext(integration, branches, getContext, options = {}) {
  const {
    signal: [source, setSource],
    utils = {}
  } = integration;
  const parsePath = utils.parsePath || (p => p);
  const renderPath = utils.renderPath || (p => p);
  // An empty slot until `useBeforeLeave` installs the guard on first use.
  const beforeLeave = utils.beforeLeave || {};
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
  const [isNavigating, setIsRouting] = createSignal(false, {
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
  // The flash cookie is consumed eagerly: its one-shot clear (Set-Cookie)
  // must be appended before streaming flushes the response headers, and an
  // unread outcome must not haunt a later request's render. Only detection
  // and clearing happen here (the runtime's isomorphic half); the raw header
  // is stashed and decoding waits for the action-provided codec, read when
  // the lazily allocated submissions signal below first initializes.
  let flashCookieHeader;
  if (isServer) {
    const e = getRequestEvent();
    if (e && !(e.router && e.router.submission)) {
      const cookieHeader = e.request.headers.get("cookie");
      if (hasFlashCookie(cookieHeader)) {
        flashCookieHeader = cookieHeader;
        // one-shot: clear it even when unreadable so it can't haunt later renders
        if (e.response && e.response.headers) e.response.headers.append("Set-Cookie", clearFlashCookie());
      }
    }
  }
  let submissions;
  const matches = createMemo(() => {
    const pathname = typeof options.transformUrl === "function" ? options.transformUrl(location.pathname) : location.pathname;
    const m = getRouteMatches(branches(), pathname);
    // An unresolved lazy subtree parks readers on not-ready semantics — the
    // navigation transition (or the SSR stream) holds until the table lands.
    // NotReadyError (not a returned promise) because a match chain is full
    // of component functions the hydration serializer must never see. The
    // recompute comes from the version-signal dependency on the client and
    // from the carried promise's retry on the server; a boundary nested
    // inside a boundary just parks the recomputed chain again.
    const pending = unresolvedLazyMatches(m);
    if (pending.length) throw new NotReadyError(Promise.all(pending.map(resolveLazySubtree)));
    return m;
  });

  // Every write is a transition in Solid 2, so a native history pop forks the
  // source signal exactly like programmatic navigation does. isRouting is
  // therefore derived: the manual flag covers navigateFromRoute's explicit
  // window, and isPending over the location/matches read reports any
  // in-flight fork — including popstate traversals and the lazy-subtree
  // resolution matches() parks on.
  const isRouting = createMemo(() => isNavigating() || isPending(() => (matches(), location.search, location.hash)));
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
        } else if (!beforeLeave.current || beforeLeave.current.confirm(resolvedTo, options)) {
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
    // An unresolved lazy subtree in the chain: the placeholder's
    // component.preload (below) kicks the table load; once it lands,
    // preload again so the real inner routes warm too.
    const boundary = matches.find(m => m.route.lazy && !m.route.lazy.resolved);
    boundary && resolveLazySubtree(boundary.route.lazy).then(() => preloadRoute(url, preloadData));
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
      inPreloadFn = true;
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
      inPreloadFn = false;
    }
    intent = prevIntent;
  }

  // Seeds the initial submission from a no-JS form post: the server
  // function runtime redirected back with the outcome in a one-shot flash
  // cookie (its default no-JS convention), consumed eagerly above and
  // decoded here — so the post-redirect SSR renders useSubmission() state
  // exactly as a scripted submission would. An explicitly pre-seeded
  // `event.router.submission` (framework integrations) takes precedence.
  function initSubmissions() {
    const e = getRequestEvent();
    const submission = e && e.router && e.router.submission || (flashDecoder && flashCookieHeader !== undefined ? flashDecoder(flashCookieHeader) : undefined);
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
  inPreloadFn = true;
  const data = preload ? preload({
    params,
    location,
    intent: intent || "initial"
  }) : undefined;
  inPreloadFn = false;
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
    setInPreloadFn(true);
    try {
      return props.preload({
        params,
        location,
        intent: getIntent() || "initial"
      });
    } finally {
      setInPreloadFn(false);
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
      dataOnly(e, props.routerState, props.branches());
      return;
    }
    if (e && !(e.router && e.router.matches)) {
      // A lazy getter rather than a snapshot: unresolved lazy subtrees mean
      // the match chain can still improve while the render streams, and
      // frameworks read this after the render settles.
      Object.defineProperty(e.router || (e.router = {}), "matches", {
        configurable: true,
        enumerable: true,
        get: () => props.routerState.matches().map(({
          route,
          path,
          params
        }) => ({
          path: route.originalPath,
          pattern: route.pattern,
          match: path,
          params,
          info: route.info
        }))
      });
    }
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
    // While a lazy subtree resolves, `matches()` is not ready and this
    // computation parks with it — no route contexts are created against
    // placeholder matches.
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
  // This pass is synchronous — an unresolved lazy subtree can only be
  // kicked, not awaited (the flight collector's own runner awaits; see
  // src/server.ts). Best effort so a subsequent pass sees the table.
  unresolvedLazyMatches([...prevMatches, ...matches]).forEach(resolveLazySubtree);
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

// Depth stamping supports blocking browser-initiated navigation (back/forward)
// for `useBeforeLeave`. It stays always-on — a couple of history.state writes —
// so blocking stays exact no matter when the first guard subscribes, while the
// guard machinery itself lives behind the lazy `beforeLeave` slot.

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
  const beforeLeave = {};
  if (!isServer) saveCurrentDepth();
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
      const guard = beforeLeave.current;
      if (!guard) return false;
      if (delta) {
        return !guard.confirm(delta);
      } else {
        const s = getSource();
        return !guard.confirm(s.value, {
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

const STORAGE_KEY = "solid-router:scroll";

/**
 * Explicit scroll restoration for back/forward navigation. The browser's
 * native same-document heuristic is unreliable for suspense-driven rendering:
 * if the destination route forces a layout while the document is still short,
 * the saved offset for the previous entry is clamped and lost (#577).
 *
 * Positions are captured continuously from the scroll event, keyed by the
 * `_depth` the router already stamps on every history entry — capturing at
 * scroll time (rather than at exit) stays correct through `useBeforeLeave`
 * blocked/reverted traversals. The map persists to sessionStorage on pagehide
 * so restoration survives reloads, which `scrollRestoration = "manual"`
 * otherwise disables.
 *
 * Restoration is a single scroll once routing settles — the same strategy
 * SvelteKit, TanStack Router and React Router use. Settling after the
 * transition commits is what makes the offset reachable; chasing a still-
 * growing document afterwards (a ResizeObserver re-asserting the offset as
 * content arrives) was tried and removed: no peer router does it, an
 * unbounded observer re-clamps the viewport to the bottom when the target is
 * never reachable (a list that is genuinely shorter now), and scroll-induced
 * layout changes can feed it back into itself. Content that commits after the
 * transition settles — an image without reserved space, a boundary below the
 * fold — keeps whatever offset the document can hold.
 */
function createScrollRestoration() {
  window.history.scrollRestoration = "manual";
  // the current entry needs its depth stamp for captures to have a key, even
  // if something replaced history.state after the adapter stamped it
  saveCurrentDepth();
  let positions = {};
  try {
    positions = JSON.parse(sessionStorage.getItem(STORAGE_KEY)) || {};
  } catch {}
  const depth = () => window.history.state && window.history.state._depth;
  let programmatic = false;
  let pending;
  const unbind = [bindEvent(window, "scroll", () => {
    const d = depth();
    if (d != null) positions[d] = window.scrollY;
    // the user took over — a pending restore would yank them
    if (!programmatic) pending = undefined;
  }), bindEvent(window, "pagehide", () => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(positions));
    } catch {}
  })];
  const restore = () => {
    if (pending == null) return;
    const y = positions[pending];
    pending = undefined;
    if (y == null) return;
    // flagged so the resulting scroll event is not mistaken for the user
    // taking over (which cancels a pending restore)
    programmatic = true;
    window.scrollTo(0, y);
    programmatic = false;
  };
  return {
    /** When the adapter notifies a traversal: mark the target for restoration. */
    onPop() {
      pending = depth();
    },
    /** After a push: forward entries died, and this depth may be reused. */
    onPush() {
      const d = depth();
      if (d != null) for (const k in positions) +k >= d && delete positions[k];
    },
    create(router) {
      // Restore once the traversal has settled: key on the location (a fully
      // synchronous pop commits without isRouting ever flipping) and on
      // isRouting, which reports in-flight transitions — native pops
      // included — and holds the restore until they commit. restore() no-ops
      // unless a traversal marked a target, so push navigations are inert.
      // `transparent` keeps the effect invisible to the hydration id scheme —
      // same reasoning as the link-claims effect (claims.ts): this setup is
      // client-only, so an id-consuming node here has no server counterpart
      // and every hydration id allocated after it shifts by one child slot.
      // The visible failure is any <Loading> content that settled before the
      // shell flush (a cache hit, a preloaded query): its serialized value and
      // inlined markup are keyed under the server's ids, the shifted client
      // misses both, recomputes, and re-renders the route fresh — duplicating
      // the server DOM and leaving it inert.
      createEffect(() => ({
        url: router.location.pathname + router.location.search + router.location.hash,
        routing: router.isRouting()
      }), current => {
        if (!current.routing) restore();
      }, {
        transparent: true
      });
      onCleanup(() => unbind.forEach(u => u()));
      // reload/back_forward document loads land on an existing entry (a fresh
      // navigation starts a new one and belongs at the top); the effect's
      // initial run performs the restore after first render
      const [nav] = performance.getEntriesByType && performance.getEntriesByType("navigation");
      if (nav && nav.type !== "navigate") pending = depth();
    }
  };
}
/**
 * Threads restoration through a history adapter: pushes prune dead forward
 * entries, and adapter notifications (unblocked pops) mark the traversal
 * target. Notification runs after the adapter's depth bookkeeping, so the
 * marked depth is the entry being restored to.
 */
function withScrollRestoration(history, restoration) {
  return {
    ...history,
    set(next) {
      history.set(next);
      next.replace || restoration.onPush();
    },
    init: history.init && (notify => history.init(value => {
      restoration.onPop();
      notify(value);
    }))
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
 * server render never navigates. The request event (when the harness scopes
 * one) wins; the provider's `url` prop is the fallback for renders outside a
 * request scope (SSG scripts, server-side tests, runtimes without
 * `node:async_hooks`). History adapters are a client navigation concern and
 * play no part in locating a server render.
 */
function staticIntegration(url, utils) {
  const e = getRequestEvent();
  const source = e ? e.request.url : url;
  let value = "";
  if (source) {
    const u = new URL(source, mockBase);
    value = u.pathname + u.search;
  }
  const obj = {
    value
  };
  return {
    signal: [() => obj, next => Object.assign(obj, next)],
    utils
  };
}
function createRouter(config) {
  const basePath = config.base || "";
  // Routes are immutable per instance, so compilation is shared by every
  // mount, request, and `match()` call — recompiled only when a lazy subtree
  // resolves (append-only: resolution, not mutation). Reading the version
  // inside a computation subscribes it; plain calls just see current state.
  let compiled;
  let compiledVersion = -1;
  const branches = () => {
    const version = trackLazySubtrees();
    if (!compiled || compiledVersion !== version) {
      compiled = createBranches(config.routes, basePath);
      compiledVersion = version;
    }
    return compiled;
  };
  const renderPath = config.history && config.history.utils && config.history.utils.renderPath || undefined;
  function RouterComponent(props) {
    // One router per app: the session (location, history, delegation, link
    // claims, preloading) has a single owner, and a second instance would
    // fight it — stale content on click navigations, conflicting link
    // attributes. Compose route trees instead; lazy subtrees are the planned
    // answer for definitions unknown at build time.
    if (useOptionalContext(RouterContextObj)) {
      console.warn("Mounting a router inside another router is not supported. " + "Compose route trees in one createRouter config instead.");
    }
    const root = untrack(() => props.children);
    let restoration;
    let history = config.history;
    if (!isServer && (config.scrollRestoration ?? !history)) {
      restoration = createScrollRestoration();
      history = withScrollRestoration(history || browserHistory(), restoration);
    }
    const integration = isServer ? staticIntegration(props.url, config.history && config.history.utils) : createIntegration(history || browserHistory());
    let context;
    const routerState = createRouterContext(integration, branches, () => context, {
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
      restoration && restoration.create(routerState);
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
  const instance = Object.assign(RouterComponent, {
    routes: config.routes,
    config,
    match(url) {
      const u = new URL(url, mockBase);
      const pathname = config.transformUrl ? config.transformUrl(u.pathname) : u.pathname;
      return getRouteMatches(branches(), pathname).map(({
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
  // Built on first access (a getter via Object.assign would run during the
  // copy) so runtimes without Proxy — some older TVs — can still route as
  // long as they never touch typed paths.
  let paths;
  Object.defineProperty(instance, "paths", {
    get: () => paths || (paths = createPathsProxy(renderPath, basePath))
  });
  return instance;
}

const LocationHeader = "Location";
const PRELOAD_TIMEOUT = 5000;
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
function getCache() {
  if (!isServer) return cacheMap;
  const req = getRequestEvent();
  if (!req) throw new Error("Cannot find cache context");
  return (req.router || (req.router = {})).cache || (req.router.cache = new Map());
}

/**
 * Revalidates the given cache entry/entries.
 */
function revalidate(key, force = true) {
  const now = Date.now();
  cacheKeyOp(key, entry => {
    force && (entry[0] = 0); //force cache miss
    entry[4][1](now); // retrigger live signals
  });
}
function cacheKeyOp(key, fn) {
  key && !Array.isArray(key) && (key = [key]);
  for (let k of cacheMap.keys()) {
    if (key === undefined || matchKey(k, key)) fn(cacheMap.get(k));
  }
}
function query(fn, name) {
  // query implies GET: the router primitive is the declaration site, so a
  // server function handed to query() is wrapped with core `GET(fn)` here,
  // at query-creation (module scope) — the server half records the method
  // declaration for dispatch, the client half swaps in the GET transport.
  // An explicit `GET(fn)` already carries the declaration on the metadata
  // channel (`getServerFunctionMetadata(fn)?.method === "GET"`) and passes
  // through; non-server functions are untouched.
  if (isServerFunction(fn) && !getServerFunctionMetadata(fn)?.method) {
    fn = GET(fn);
  }
  const cachedFn = (...args) => {
    const cache = getCache();
    const intent = getIntent();
    const inPreloadFn = getInPreloadFn();
    const owner = getOwner();
    const navigate = owner ? useNavigate() : undefined;
    const now = Date.now();
    const key = name + hashKey(args);
    let cached = cache.get(key);
    let tracking;
    if (isServer) {
      const e = getRequestEvent();
      if (e) {
        const dataOnly = (e.router || (e.router = {})).dataOnly;
        if (dataOnly) {
          const data = e && (e.router.data || (e.router.data = {}));
          if (data && key in data) return data[key];
          if (Array.isArray(dataOnly) && !matchKey(key, dataOnly)) {
            data[key] = undefined;
            return Promise.resolve();
          }
        }
      }
    }
    if (getObserver() && !isServer) {
      tracking = true;
      onCleanup(() => cached[4].count--);
    }
    if (cached && cached[0] && (isServer || intent === "native" || cached[4].count || Date.now() - cached[0] < PRELOAD_TIMEOUT)) {
      if (tracking) {
        cached[4].count++;
        cached[4][0](); // track
      }
      if (cached[3] === "preload" && intent !== "preload") {
        cached[0] = now;
      }
      let res = cached[1];
      if (intent !== "preload") {
        res = "then" in cached[1] ? cached[1].then(handleResponse(false), handleResponse(true)) : handleResponse(false)(cached[1]);
        !isServer && intent === "navigate" && cached[4][1](cached[0]); // update version
      }
      inPreloadFn && "then" in res && res.catch(() => {});
      return res;
    }
    let res;
    if (!isServer && sharedConfig.has && sharedConfig.has(key)) {
      res = sharedConfig.load(key); // hydrating
      // @ts-ignore at least until we add a delete method to sharedConfig
      delete globalThis._$HY.r[key];
    } else res = fn(...args);
    if (cached) {
      cached[0] = now;
      cached[1] = res;
      cached[3] = intent;
      !isServer && intent === "navigate" && cached[4][1](cached[0]); // update version
    } else {
      cache.set(key, cached = [now, res,, intent, createSignal(now, {
        ownedWrite: true
      })]);
      cached[4].count = 0;
    }
    if (tracking) {
      cached[4].count++;
      cached[4][0](); // track
    }
    if (isServer) {
      const e = getRequestEvent();
      if (e && e.router.dataOnly) return e.router.data[key] = res;
    }
    if (intent !== "preload") {
      res = "then" in res ? res.then(handleResponse(false), handleResponse(true)) : handleResponse(false)(res);
    }
    inPreloadFn && "then" in res && res.catch(() => {});
    // serialize on server
    if (isServer && sharedConfig.context && sharedConfig.context.async && !sharedConfig.context.noHydrate) {
      const e = getRequestEvent();
      (!e || !e.serverOnly) && sharedConfig.context.serialize(key, res);
    }
    return res;
    function handleResponse(error) {
      return async v => {
        let enveloped;
        let hasEnveloped = false;
        if (isResponseEnvelope(v)) {
          // respond(): the value rides in memory beside the metadata
          enveloped = v.value;
          hasEnveloped = true;
          v = v.response;
        }
        if (v instanceof Response) {
          const e = getRequestEvent();
          if (e) {
            for (const [key, value] of v.headers) {
              if (key == "set-cookie") e.response.headers.append("set-cookie", value);else e.response.headers.set(key, value);
            }
          }
          const url = v.headers.get(LocationHeader);
          if (url !== null) {
            // client + server relative redirect
            if (navigate && url.startsWith("/")) navigate(url, {
              replace: true
            });else if (!isServer) window.location.href = url;else if (e) e.response.status = 302;
            return;
          }
          if (hasEnveloped) v = enveloped;else if (v.body) {
            // responses the transport hands over whole (revalidation) carry a
            // codec-encoded body; anything else (a raw user Response) stays whole
            const decoded = await decodeResponse(v);
            if (decoded !== undefined) v = decoded;
          }
        }
        if (error) throw v;
        cached[2] = v;
        return v;
      };
    }
  };
  cachedFn.keyFor = (...args) => name + hashKey(args);
  cachedFn.key = name;
  return cachedFn;
}
query.get = key => {
  const cached = getCache().get(key);
  return cached[2];
};
query.set = (key, value) => {
  const cache = getCache();
  const now = Date.now();
  let cached = cache.get(key);
  if (cached) {
    cached[0] = now;
    cached[1] = Promise.resolve(value);
    cached[2] = value;
    cached[3] = "preload";
  } else {
    cache.set(key, cached = [now, Promise.resolve(value), value, "preload", createSignal(now, {
      ownedWrite: true
    })]);
    cached[4].count = 0;
  }
};
query.delete = key => getCache().delete(key);
query.clear = () => getCache().clear();
function matchKey(key, keys) {
  for (let k of keys) {
    if (k && key.startsWith(k)) return true;
  }
  return false;
}

// Modified from the amazing Tanstack Query library (MIT)
// https://github.com/TanStack/query/blob/main/packages/query-core/src/utils.ts#L168
function hashKey(args) {
  return JSON.stringify(args, (_, val) => isPlainObject(val) ? Object.keys(val).sort().reduce((result, key) => {
    result[key] = val[key];
    return result;
  }, {}) : val);
}
function isPlainObject(obj) {
  let proto;
  return obj != null && typeof obj === "object" && (!(proto = Object.getPrototypeOf(obj)) || proto === Object.prototype);
}

const submitHooksSymbol = Symbol("routerActionSubmitHooks");
const settledHooksSymbol = Symbol("routerActionSettledHooks");
const invokeSymbol = Symbol("routerActionInvoke");

// Forms submitted through delegation are marked `aria-busy` while their
// action is in flight — the form half of the attribute vocabulary links get
// (`data-active`/`data-pending`). Style with `form[aria-busy] button { ... }`.
// A counter (not a boolean) keeps the attribute through overlapping
// submissions from the same form.
const busyForms = /* #__PURE__ */new WeakMap();
function setFormBusy(form, delta) {
  const count = (busyForms.get(form) || 0) + delta;
  busyForms.set(form, count);
  count > 0 ? form.setAttribute("aria-busy", "true") : form.removeAttribute("aria-busy");
}
const actions = /* #__PURE__ */new Map();

/**
 * The document-delegation submit handler for router actions. Lives here —
 * not in events.ts — so the router's event wiring holds no static reference
 * to the action module; `installRouterIntegrations` slots it in when the
 * first action is created on the client.
 */
function handleFormAction(evt, router, actionBase) {
  if (evt.defaultPrevented) return;
  let actionRef = evt.submitter && evt.submitter.hasAttribute("formaction") ? evt.submitter.getAttribute("formaction") : evt.target.getAttribute("action");
  if (!actionRef) return;
  const serverAction = !actionRef.startsWith("https://action/");
  if (serverAction) {
    // normalize server actions
    const url = new URL(actionRef, mockBase);
    actionRef = router.parsePath(url.pathname + url.search);
    if (!actionRef.startsWith(actionBase)) return;
  }
  if (evt.target.method.toUpperCase() !== "POST") throw new Error("Only POST forms are supported for Actions");
  // A registry miss on a server-action url is a direct bind whose module
  // never loaded client-side (server components): the url is self-describing
  // (`?id`, bound `?args`), so a generic invocation is synthesized from it —
  // delegation alone is sufficient, the no-JS path stays a no-JS fallback.
  // Client-only actions (`https://action/`) are their module's JS by
  // definition, so a miss there falls through to native submission.
  const handler = actions.get(actionRef) || serverAction && createServerFormAction(actionRef);
  if (handler) {
    evt.preventDefault();
    const data = new FormData(evt.target, evt.submitter);
    handler.call({
      r: router,
      f: evt.target
    }, evt.target.enctype === "multipart/form-data" ? data : new URLSearchParams(data));
  }
}

/**
 * Synthesizes a router action for a server-rendered action url. The url
 * carries everything an invocation needs — the function id and any bound
 * `.with()` arguments (plain JSON in `?args`, which the server prepends for
 * natural-encoding bodies exactly as it does for no-JS posts) — so the
 * FormData is posted to it verbatim through the server-function transport:
 * submissions, `aria-busy`, redirects, revalidation, and single-flight all
 * flow through the normal action machinery. Registered under the url, so
 * repeat submits reuse it (and a later real registration overrides it).
 */
function createServerFormAction(url) {
  const id = new URL(url, mockBase).searchParams.get("id");
  if (!id) return undefined;
  // typecheck resolves the server half of the dual module; this path only
  // runs in the browser, where the client transport's signature applies
  const stub = createServerReference(id, undefined, url);
  const caller = Object.assign(form => stub(form), {
    url
  });
  return actionImpl(caller);
}

/**
 * Entry point for delegation's lazy fallback (data/events.ts): when no form
 * handler was ever installed — no action module in the client graph at all —
 * the router intercepts posts to server-action urls synchronously and loads
 * this module to run them. The FormData was captured at submit time; only
 * the enctype conversion and the generic invocation happen here.
 */
function submitServerForm(router, url, form, data) {
  const handler = actions.get(url) || createServerFormAction(url);
  // no `?id` — not the server function convention; nothing can run it,
  // resubmit natively (submit() bypasses the delegated handler)
  if (!handler) return form.submit();
  handler.call({
    r: router,
    f: form
  }, form.enctype === "multipart/form-data" ? data : new URLSearchParams(data));
}

// Wires the action layer into the router's slots exactly once, triggered by
// the first action creation. Not an import side effect — with
// `sideEffects: false`, module evaluation only happens when action() is
// actually used, which is precisely when the wiring is wanted: no action in
// the graph means no form interception, no single-flight subscription (the
// server is never asked to collect), and no flash cookies to decode. On the
// server, actions are created at module scope, so the flash decoder is
// always installed before useSubmission can read the submissions signal.
let integrationsInstalled = false;
function installRouterIntegrations() {
  if (integrationsInstalled) return;
  integrationsInstalled = true;
  if (isServer) {
    // Server-only: initSubmissions only decodes during SSR, so client builds
    // tree-shake the codec (which now lives behind the runtime's server entry).
    provideFlashDecoder(decodeFlashCookie);
  } else {
    setRouterFormHandler(handleFormAction);
    provideFlightConsumer(setupFlightDataConsumer);
  }
}
function actionImpl(fn, options = {}) {
  async function invoke(variables, current) {
    const router = this.r;
    const form = this.f;
    const submitHooks = current[submitHooksSymbol];
    const settledHooks = current[settledHooksSymbol];
    // Single-flight opt-in is no longer per call: the router's registered
    // flight-data consumer (see setupFlightDataConsumer) makes the transport
    // send the request header itself, so the mutation is just called.
    const runMutation = () => fn(...variables);
    const run = action(async function* (context) {
      context.optimistic?.();
      try {
        const value = await context.call();
        yield;
        return {
          error: false,
          value
        };
      } catch (error) {
        yield;
        return {
          error: true,
          value: error
        };
      }
    });
    form && setFormBusy(form, 1);
    let settled;
    let response;
    // The transport consumer is awaited before a single-flight mutation
    // resolves, so a counter delta over the call tells whether this action's
    // metadata was already applied. Overlapping mutations can cross-attribute
    // a run (skipping one default revalidation another pass just covered) —
    // a far smaller window than predicting from the function's identity,
    // which misses every response the server returned without flight data.
    const flightApplicationsBefore = flightApplications;
    try {
      settled = await settleActionResult(run({
        call: runMutation,
        optimistic: submitHooks.size ? () => {
          for (const hook of submitHooks.values()) hook(...variables);
        } : undefined
      }));
      response = await handleResponse(settled.value, settled.error, router.navigatorFactory(), flightApplications !== flightApplicationsBefore);
    } finally {
      form && setFormBusy(form, -1);
    }
    let submission;
    submission = {
      input: variables,
      url,
      result: response && response.data,
      error: response && response.error,
      clear() {
        router.submissions[1](entries => entries.filter(entry => entry !== submission));
      },
      retry() {
        submission.clear();
        return current[invokeSymbol].call({
          r: router,
          f: form
        }, variables, current);
      }
    };
    // Book-keeping is intentional: only outcomes worth showing or retrying
    // (a result or an error) enter the submissions list, so the typical void
    // mutation leaves nothing behind. Settled hooks still see every
    // completion — void, metadata-only, and redirects included — one
    // `onSettled` per invocation (#580).
    response && router.submissions[1](entries => [...entries, submission]);
    for (const hook of settledHooks.values()) hook(submission);
    if (response) {
      if (response.error && !form) throw response.error;
      return response.data;
    }
    return undefined;
  }
  const o = typeof options === "string" ? {
    name: options
  } : options;
  const name = o.name || (!isServer ? String(hashString(fn.toString())) : undefined);
  const url = fn.url || name && `https://action/${name}` || "";
  const wrapped = toAction(invoke, url);
  if (name) setFunctionName(wrapped, name);
  return wrapped;
}
function toAction(invoke, url, boundArgs = [], base = url, submitHooks = new Map(), settledHooks = new Map()) {
  const fn = function (...args) {
    return invoke.call(this, [...boundArgs, ...args], fn);
  };
  fn.toString = () => {
    if (!url) throw new Error("Client Actions need explicit names if server rendered");
    return url;
  };
  fn.with = function (...args) {
    const uri = new URL(url, mockBase);
    uri.searchParams.set("args", hashKey(args));
    const next = toAction(invoke, (uri.origin === "https://action" ? uri.origin : "") + uri.pathname + uri.search, [...boundArgs, ...args], base, submitHooks, settledHooks);
    return next;
  };
  fn.onSubmit = function (hook) {
    const id = Symbol("actionOnSubmitHook");
    submitHooks.set(id, hook);
    getOwner() && onCleanup(() => submitHooks.delete(id));
    return this;
  };
  fn.onSettled = function (hook) {
    const id = Symbol("actionOnSettledHook");
    settledHooks.set(id, hook);
    getOwner() && onCleanup(() => settledHooks.delete(id));
    return this;
  };
  fn.url = url;
  fn.base = base;
  fn[submitHooksSymbol] = submitHooks;
  fn[settledHooksSymbol] = settledHooks;
  fn[invokeSymbol] = invoke;
  installRouterIntegrations();
  if (!isServer) {
    actions.set(url, fn);
    // Only remove the registration if it still belongs to this instance —
    // a re-created action (e.g. a new `.with()` binding after revalidation)
    // may have registered itself under the same URL since.
    getOwner() && onCleanup(() => actions.get(url) === fn && actions.delete(url));
  }
  return fn;
}
const hashString = s => s.split("").reduce((a, b) => (a << 5) - a + b.charCodeAt(0) | 0, 0);
async function settleActionResult(result) {
  const value = result;
  if (value && typeof value.then === "function") {
    return result.then(value => value);
  }
  if (value && typeof value.next === "function") {
    const iterator = value;
    let next = await iterator.next();
    while (!next.done) {
      next = await iterator.next();
    }
    return next.value;
  }
  return result;
}

// Invocation count of the flight-data consumer. An action compares it across
// its mutation call to learn whether the transport already applied this
// response's metadata (and so the default revalidation pass must not run
// again and wipe the freshly seeded cache).
let flightApplications = 0;

/**
 * Registers the router as the single-flight consumer of the server function
 * transport. Subscribing is the opt-in: while registered, the transport
 * sends the `X-Single-Flight` request header on mutations and delivers the
 * folded payload here — fresh route data is seeded into the `query` cache
 * and the envelope metadata (redirect `Location`, `X-Revalidate` keys) is
 * applied, all before the action sees its plain return value. Called by the
 * Router component on the client unless `singleFlight={false}`, which now
 * simply means "never subscribe" — no consumer, no request header, no
 * collection work on the server. Returns the unsubscribe function.
 */
function setupFlightDataConsumer(router) {
  return subscribeFlightData((data, {
    response
  }) => {
    flightApplications++;
    return applyResponseMetadata(response, router.navigatorFactory(), data);
  });
}

/**
 * Applies a server function response's integration metadata: `X-Revalidate`
 * keys invalidate, `Location` navigates (hard for absolute urls), flight
 * data seeds the query cache, and matching entries revalidate. Shared by
 * the flight-data consumer and the action response path (which still sees
 * metadata-bearing responses when no flight data was collected).
 */
function applyResponseMetadata(metadata, navigate, flightData) {
  let keys;
  if (metadata) {
    if (metadata.headers.has(REVALIDATE_HEADER)) keys = metadata.headers.get(REVALIDATE_HEADER).split(",");
    if (metadata.headers.has("Location")) {
      const locationUrl = metadata.headers.get("Location") || "/";
      if (locationUrl.startsWith("http")) {
        window.location.href = locationUrl;
      } else {
        navigate(locationUrl);
      }
    }
  }
  // invalidate
  cacheKeyOp(keys, entry => entry[0] = 0);
  // set cache
  flightData && Object.keys(flightData).forEach(k => query.set(k, flightData[k]));
  // trigger revalidation
  revalidate(keys, false);
}
async function handleResponse(response, error, navigate, metadataHandled) {
  let data;
  let flightData;
  let metadata;
  if (isResponseEnvelope(response)) {
    // client-only respond(): the value rides in memory beside the metadata
    data = response.value;
    metadata = response.response;
  } else if (response instanceof Response) {
    metadata = response;
    // responses the transport hands over whole (redirects, revalidation)
    // carry a codec-encoded body the router decodes itself. With the
    // flight-data consumer registered single-flight payloads never reach
    // this path, but a manually opted-in call (no consumer) still can —
    // the runtime splits its own envelope shape.
    if (response.body) {
      const payload = await decodeResponsePayload(response);
      data = payload.value;
      flightData = payload.flightData;
    }
  } else if (error) return {
    error: response
  };else data = response;
  // The transport consumer applies metadata before returning a server
  // function's unwrapped value. Do not treat that value as a second plain
  // action response and invalidate the freshly seeded query cache again.
  if (!metadataHandled || metadata || flightData) applyResponseMetadata(metadata, navigate, flightData);
  return data != null ? {
    data
  } : undefined;
}

// The delegation fallback's lazy entry (see data/events.ts). Nothing imports
// this module statically — it exists so the dynamic import has a target that
// bundlers can keep as a split point: router-only apps never load the action
// machinery unless a server-action form actually submits.

var serverForms = /*#__PURE__*/Object.freeze({
  __proto__: null,
  submitServerForm: submitServerForm
});

console.log(createRouter({ routes: [{ path: "/" }] }));
