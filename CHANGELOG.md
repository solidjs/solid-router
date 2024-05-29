# @solidjs/router

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
