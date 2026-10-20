import { DEV } from "solid-js";
import { formAction, type FormAction } from "./action.js";

/**
 * @deprecated Renamed to `formAction` (the router's action is the form layer;
 * `action` is solid-js's own primitive). Will be removed in the next major.
 */
export const action: typeof formAction = /* #__PURE__ */ (() => {
  if (!DEV) return formAction;
  let warned = false;
  const wrapped = function (this: unknown, ...args: any[]) {
    if (!warned) {
      warned = true;
      console.warn(
        "[@solidjs/router] `action` is deprecated and will be removed in the next major; use `formAction` instead."
      );
    }
    return (formAction as any).apply(this, args);
  };
  return wrapped as unknown as typeof formAction;
})();

/** @deprecated Renamed to `FormAction`. Will be removed in the next major. */
export type Action<T extends Array<any>, U, V = T> = FormAction<T, U, V>;
