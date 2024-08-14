# @solidjs/router

## 0.14.3

### Patch Changes

- 19a21cc: fix async store references
- f8aaf16: make url transform consistent
- 86c3b1f: better handling of query only navigation

## 0.14.2

### Patch Changes

- bc3d8e3: expose .latest from createAsync
- fc6ac53: fix #464 flaky hydration bail out
- 3295502: fix hydration cancellation on browser events

## 0.14.1

### Patch Changes

- 6144da8: fix Response type narrowing in submission APIs

## 0.14.0

### Minor Changes

- e4a13f6: Response helpers return responses, cache/action filter them out
- bd9f19a: default form actions to url encoded
- 5d9263b: rename load to preload

### Patch Changes

- a7e4062: fix #457 extra leading slashes on path
- 4b4536e: add usePreloadRoute export
- 8cc0530: hack the types to work a bit better with Response Unions

## 0.13.6

### Patch Changes

- 7344f69: Handle absolute redirects within `cache` on server
- 8263115: Forward absolute redirects inside `cache` from server to client
- 8fbf74a: Treat `window.location.hash` as URI encoded
- e9fd55d: fix #449 No JS submissions not working
- f311f4a: fix #452 useSubmission types/references
- 2f05f37: Make isRouting more reliable + other fixes
- 618ef17: performance improvement leveraging redirects in loadfn
- d81473a: usePreloadRoute method pre-release

## 0.13.5

### Patch Changes

- bfb059f: types Route -> RouteDescription

## 0.13.4

### Patch Changes

- 00e37fd: Export all types used in public API
- 2e90de5: Fix `HashRouter` state reset with `replace: false`
- 75472d2: Fix useCurrentMatches a getter function

## 0.13.3

### Patch Changes

- 884b8be: fix #374, fix #399 - suppress cache errors in load function
- 4a76e7d: Fix state updates detection on history back/forward
- 5af3da8: fix #407 single flight without explicit keys
- 1068f1b: fix #408 - accessing route information
- 0c698ed: Allow rewriting url

## 0.13.2

### Patch Changes

- 0a34883: preserve original path on optional segments
- 94797e1: Fix types for cache functions with all optional arguments
- 8a547a8: don't submit form when submit event is defaultPrevented

## 0.13.1

### Patch Changes

- 8b766a9: restore params into root

## 0.13.0

### Minor Changes

- 7b1597b: Add errors to actions

### Patch Changes

- 83e827d: minimum types for submission flash
- 6df4a7a: push root/rootLoad outside of route matching

## 0.12.5

### Patch Changes

- fdefceb: fix #388 reference to element prop
- ffbd35a: fix #389 update router context error message
- bceb358: fix backcache storing invalidated values

## 0.12.4

### Patch Changes

- 533b7a0: fix unintended early return in cache during server render

## 0.12.3

### Patch Changes

- 02c6e7a: action to return fully processed response

## 0.12.2

### Patch Changes

- 5e8cbdb: apply the right owner (who's aware of the router)

## 0.12.1

### Patch Changes

- 6d0be9e: fix cache serialization to match returned value
- 052d385: Run load functions with owner & context of `Router` component.

## 0.12.0

### Minor Changes

- 17ea145: add createAsyncStorage, prev argument, remove store from cache

## 0.11.5

### Patch Changes

- 0413594: fix memory router no native events
- 97d387b: add `rootLoad`
- 5a94e7d: fix Router types, make singleFlight optional

## 0.11.4

### Patch Changes

- d67ccbb: single flight mutations
- 76724af: pass revalidate through `json` helper

## 0.11.3

### Patch Changes

- 9cc1a85: update response types to be always present

## 0.11.2

### Patch Changes

- fab3cc0: fix renderToString for cache fns

## 0.11.1

### Patch Changes

- 20663d5: metadata -> info

## 0.11.0

### Minor Changes

- 6e661eb: add changesets
