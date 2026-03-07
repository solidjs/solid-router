---
"@solidjs/router": minor
---

Added support for route guards to control access to routes.

Now, in route definitions, you can use the `guard` field, which accepts:

- a boolean value;
- a synchronous or asynchronous function returning `boolean | string | { allowed: boolean; redirect?: string }`.

**Key features:**

- Flexible permission system with automatic redirect when returning a string or an object with `redirect`.
- Integration with preload — for protected routes, data is not loaded unnecessarily.
- New `useRouteGuard` hook for reactive access to the check status in components.
- Utilities `evaluateRouteGuard` and `normalizeGuardResult` for custom scenarios.

**Motivation for changes:**
Previously, route protection was implemented manually inside components, leading to code duplication and not always working uniformly. Built-in guards provide a declarative and centralized way to manage access.

**How to update code:**
For developers, this is a backward-compatible change. Existing routes will continue to work without modifications. To add protection, simply specify the `guard` prop in the `<Route>` component or in the route object (see examples in the documentation).
