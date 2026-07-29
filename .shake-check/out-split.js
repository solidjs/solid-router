import { createMemo, getOwner, runWithOwner, createRenderEffect, onCleanup, untrack, createContext, createSignal, useContext, NotReadyError, isPending, flush, createComponent, createRoot, createEffect, sharedConfig } from 'solid-js';

const syncOptions = {
  sync: true
};
const memo = fn => createMemo(() => fn(), syncOptions);
const $$EVENT_OWNER = "_$DX_EVENT_OWNER";
const delegatedEvents = new Set();
const delegatedContainers = new Map();
function delegateEvents(eventNames) {
  for (let i = 0, l = eventNames.length; i < l; i++) {
    const name = eventNames[i];
    if (!delegatedEvents.has(name)) {
      delegatedEvents.add(name);
      delegatedContainers.forEach((state, container) => attachDelegatedEvent(name, container, state));
    }
  }
}
function attachDelegatedEvent(name, container, state) {
  if (state.handlers.has(name)) return;
  const handler = e => eventHandler(e, container, state);
  state.handlers.set(name, handler);
  container.addEventListener(name, handler);
}
function findOwner(target, state) {
  let node = target;
  let distance = 0;
  while (node) {
    if (state.owners.has(node)) return {
      owner: node,
      distance
    };
    distance++;
    node = node._$host || node.parentNode || node.host;
  }
}
let claimHandlers = null;
const CLAIM_SEAM = Symbol.for("dom-expressions.element-claims");
function registerElementClaim(handler) {
  (claimHandlers || (claimHandlers = globalThis[CLAIM_SEAM] = [])).push(handler);
  return () => {
    const index = claimHandlers.indexOf(handler);
    index > -1 && claimHandlers.splice(index, 1);
  };
}
function eventHandler(e, container, state) {
  const prev = e[$$EVENT_OWNER];
  let resumeNode;
  if (prev) {
    if (prev === true || prev === container || !container.contains(prev)) return;
    resumeNode = prev;
  }
  const owner = state && (state.owners.size === 1 && state.owners.has(container) ? container : findOwner(e.target, state)?.owner);
  if (state && !owner) return;
  e[$$EVENT_OWNER] = owner || true;
  let node = resumeNode || e.target;
  const key = `$$${e.type}`;
  const oriTarget = e.target;
  const boundary = owner || container || e.currentTarget;
  const retarget = value => Object.defineProperty(e, "target", {
    configurable: true,
    value
  });
  const handleNode = () => {
    const handler = node[key];
    if (handler && !node.disabled) {
      const data = node[`${key}Data`];
      data !== undefined ? handler.call(node, data, e) : handler.call(node, e);
      if (e.cancelBubble) return;
    }
    node.host && typeof node.host !== "string" && !node.host._$host && node.contains(e.target) && retarget(node.host);
    return true;
  };
  const walkUpTree = () => {
    while (handleNode()) {
      if (node === boundary || node.parentNode === boundary) break;
      node = node._$host || node.parentNode || node.host;
    }
  };
  Object.defineProperty(e, "currentTarget", {
    configurable: true,
    get() {
      return node || boundary || document;
    }
  });
  if (resumeNode) {
    if (resumeNode === e.target) node = resumeNode._$host || resumeNode.parentNode || resumeNode.host;
    if (node && node !== boundary) walkUpTree();
  } else if (e.composedPath) {
    const path = e.composedPath();
    if (path.length) {
      retarget(path[0]);
      for (let i = 0; i < path.length; i++) {
        node = path[i];
        if (!handleNode()) break;
        if (node._$host) {
          node = node._$host;
          walkUpTree();
          break;
        }
        if (node === boundary || node.parentNode === boundary) {
          break;
        }
      }
    } else walkUpTree();
  } else walkUpTree();
  retarget(oriTarget);
}
const ENVELOPE = Symbol.for("solid.ResponseEnvelope");
function isResponseEnvelope(value) {
  return !!(value && typeof value === "object" && value[ENVELOPE]);
}
const REVALIDATE_HEADER = "X-Revalidate";
const isServer = false;

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
      import('./serverForms-BKihAnj9.js').then(m => m.submitServerForm(router, path, form, data));
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
      return submissions ||= createSignal([], {
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
        if (!beforeLeave.current || beforeLeave.current.confirm(resolvedTo, options)) {
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
    outlet: () => component ? createComponent(component, {
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
  saveCurrentDepth();
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
    if ((config.scrollRestoration ?? !history)) {
      restoration = createScrollRestoration();
      history = withScrollRestoration(history || browserHistory(), restoration);
    }
    const integration = createIntegration(history || browserHistory());
    let context;
    const routerState = createRouterContext(integration, branches, () => context, {
      base: basePath,
      singleFlight: config.singleFlight,
      transformUrl: config.transformUrl
    });
    {
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

console.log(createRouter({
  routes: [{
    path: "/"
  }]
}));

export { REVALIDATE_HEADER as R, isResponseEnvelope as a, getInPreloadFn as b, setRouterFormHandler as c, getIntent as g, isServer as i, mockBase as m, provideFlightConsumer as p, setFunctionName as s, useNavigate as u };
