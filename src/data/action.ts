import { $TRACK, action as createSolidAction, createMemo, JSX, onCleanup, getOwner } from "solid-js";
import { isServer } from "@solidjs/web";
import { useRouter } from "../routing.js";
import type {
  RouterContext,
  Submission,
  Navigator,
  NarrowResponse
} from "../types.js";
import { mockBase, setFunctionName } from "../utils.js";
import { cacheKeyOp, hashKey, revalidate, query } from "./query.js";

export type Action<T extends Array<any>, U, V = T> = (T extends [FormData | URLSearchParams] | []
  ? JSX.SerializableAttributeValue
  : unknown) &
  ((...vars: T) => Promise<NarrowResponse<U>>) & {
    url: string;
    with<A extends any[], B extends any[]>(
      this: (this: any, ...args: [...A, ...B]) => Promise<NarrowResponse<U>>,
      ...args: A
    ): Action<B, U, V>;
    onSubmit(hook: (...args: V extends Array<any> ? V : T) => void): Action<T, U, V>;
    onSettled(hook: (submission: Submission<V extends Array<any> ? V : T, NarrowResponse<U>>) => void): Action<
      T,
      U,
      V
    >;
  };

type ActionFactory = {
  <T extends Array<any>, U = void>(fn: (...args: T) => Promise<U>, name?: string): Action<T, U>;
  <T extends Array<any>, U = void>(fn: (...args: T) => Promise<U>, options?: { name?: string }): Action<T, U>;
};

type InternalAction<T extends Array<any>, U, V = T> = {
  (this: { r: RouterContext; f?: HTMLFormElement }, ...args: T): Promise<NarrowResponse<U>>;
  url: string;
  with<A extends any[], B extends any[]>(
    this: InternalAction<[...A, ...B], U, V>,
    ...args: A
  ): InternalAction<B, U, V>;
  onSubmit(hook: (...args: V extends Array<any> ? V : T) => void): InternalAction<T, U, V>;
  onSettled(
    hook: (submission: Submission<V extends Array<any> ? V : T, NarrowResponse<U>>) => void
  ): InternalAction<T, U, V>;
  base: string;
  [submitHooksSymbol]: Map<symbol, (...args: any[]) => void>;
  [settledHooksSymbol]: Map<symbol, (submission: Submission<any, any>) => void>;
  [invokeSymbol]: (
    this: { r: RouterContext; f?: HTMLFormElement },
    args: any[],
    current: InternalAction<any, any, any>
  ) => Promise<any>;
};

const submitHooksSymbol = Symbol("routerActionSubmitHooks");
const settledHooksSymbol = Symbol("routerActionSettledHooks");
const invokeSymbol = Symbol("routerActionInvoke");

export const actions = /* #__PURE__ */ new Map<string, Action<any, any>>();

export function useSubmissions<T extends Array<any>, U, V>(
  fn: Action<T, U, V>,
  filter?: (input: V) => boolean
): Submission<V, NarrowResponse<U>>[] {
  const router = useRouter();
  const subs = createMemo(() =>
    router.submissions[0]().filter(s => s.url === (fn as any).base && (!filter || filter(s.input)))
  );
  return new Proxy<Submission<any, any>[]>([] as any, {
    get(_, property) {
      if (property === $TRACK) return subs();
      return subs()[property as any];
    },
    has(_, property) {
      return property in subs();
    }
  });
}

export function useAction<T extends Array<any>, U, V>(action: Action<T, U, V>) {
  const r = useRouter();
  return (...args: Parameters<Action<T, U, V>>) => action.apply({ r }, args);
}

function actionImpl<T extends Array<any>, U = void>(
  fn: (...args: T) => Promise<U>,
  options: string | { name?: string } = {}
): Action<T, U> {
  async function invoke(
    this: { r: RouterContext; f?: HTMLFormElement },
    variables: T,
    current: InternalAction<T, U>
  ): Promise<NarrowResponse<U>> {
    const router = this.r;
    const form = this.f;
    const submitHooks = current[submitHooksSymbol];
    const settledHooks = current[settledHooksSymbol];
    const runMutation = () =>
      (router.singleFlight && (fn as any).withOptions
        ? (fn as any).withOptions({ headers: { "X-Single-Flight": "true" } })
        : fn)(...variables);
    const run = createSolidAction(
      async function* (context: { call: () => Promise<U>; optimistic?: () => void }) {
        context.optimistic?.();
        try {
          const value = await context.call();
          yield;
          return { error: false, value };
        } catch (error) {
          yield;
          return { error: true, value: error };
        }
      }
    );

    const settled = await settleActionResult(
      run({
        call: runMutation,
        optimistic: submitHooks.size
          ? () => {
              for (const hook of submitHooks.values()) hook(...variables);
            }
          : undefined
      })
    );
    const response = await handleResponse(settled.value, settled.error, router.navigatorFactory());

    if (!response) return undefined as NarrowResponse<U>;

    let submission!: Submission<T, NarrowResponse<U>>;
    submission = {
      input: variables,
      url,
      result: response.data,
      error: response.error,
      clear() {
        router.submissions[1](entries => entries.filter(entry => entry !== submission));
      },
      retry() {
        submission.clear();
        return current[invokeSymbol].call({ r: router, f: form }, variables, current);
      }
    };
    router.submissions[1](entries => [...entries, submission]);
    for (const hook of settledHooks.values()) hook(submission);

    if (response.error && !form) throw response.error;
    return response.data as NarrowResponse<U>;
  }
  const o = typeof options === "string" ? { name: options } : options;
  const name = o.name || (!isServer ? String(hashString(fn.toString())) : undefined);
  const url: string = (fn as any).url || (name && `https://action/${name}`) || "";
  const wrapped = toAction<T, U, T>(invoke as InternalAction<T, U, T>[typeof invokeSymbol], url) as Action<T, U>;
  if (name) setFunctionName(wrapped, name);
  return wrapped;
}
export const action = actionImpl as ActionFactory;

function toAction<T extends Array<any>, U, V = T>(
  invoke: InternalAction<T, U, V>[typeof invokeSymbol],
  url: string,
  boundArgs: unknown[] = [],
  base = url,
  submitHooks = new Map<symbol, (...args: any[]) => void>(),
  settledHooks = new Map<symbol, (submission: Submission<any, any>) => void>()
): Action<T, U, V> {
  const fn = function (this: { r: RouterContext; f?: HTMLFormElement }, ...args: T) {
    return invoke.call(this, [...boundArgs, ...args], fn);
  } as InternalAction<T, U, V>;

  fn.toString = () => {
    if (!url) throw new Error("Client Actions need explicit names if server rendered");
    return url;
  };
  fn.with = function <A extends any[], B extends any[]>(
    this: InternalAction<[...A, ...B], U, V>,
    ...args: A
  ) {
    const uri = new URL(url, mockBase);
    uri.searchParams.set("args", hashKey(args));
    const next = toAction<B, U, V>(
      invoke,
      (uri.origin === "https://action" ? uri.origin : "") + uri.pathname + uri.search,
      [...boundArgs, ...args],
      base,
      submitHooks,
      settledHooks
    ) as unknown as InternalAction<B, U, V>;
    return next;
  };
  fn.onSubmit = function (hook: (...args: V extends Array<any> ? V : T) => void) {
    const id = Symbol("actionOnSubmitHook");
    submitHooks.set(id, hook as (...args: any[]) => void);
    getOwner() && onCleanup(() => submitHooks.delete(id));
    return this;
  };
  fn.onSettled = function (
    hook: (submission: Submission<V extends Array<any> ? V : T, NarrowResponse<U>>) => void
  ) {
    const id = Symbol("actionOnSettledHook");
    settledHooks.set(id, hook as (submission: Submission<any, any>) => void);
    getOwner() && onCleanup(() => settledHooks.delete(id));
    return this;
  };
  fn.url = url;
  fn.base = base;
  fn[submitHooksSymbol] = submitHooks;
  fn[settledHooksSymbol] = settledHooks;
  fn[invokeSymbol] = invoke;
  if (!isServer) {
    actions.set(url, fn as unknown as Action<T, U, V>);
    getOwner() && onCleanup(() => actions.delete(url));
  }
  return fn as unknown as Action<T, U, V>;
}

const hashString = (s: string) =>
  s.split("").reduce((a, b) => ((a << 5) - a + b.charCodeAt(0)) | 0, 0);

async function settleActionResult<T>(result: T | Promise<T> | AsyncIterable<T>) {
  const value = result as any;
  if (value && typeof value.then === "function") {
    return (result as Promise<T>).then(value => value);
  }
  if (value && typeof value.next === "function") {
    const iterator = value as AsyncIterator<T>;
    let next = await iterator.next();
    while (!next.done) {
      next = await iterator.next();
    }
    return next.value;
  }
  return result as T;
}

async function handleResponse(response: unknown, error: boolean | undefined, navigate: Navigator) {
  let data: any;
  let custom: any;
  let keys: string[] | undefined;
  let flightKeys: string[] | undefined;
  if (response instanceof Response) {
    if (response.headers.has("X-Revalidate"))
      keys = response.headers.get("X-Revalidate")!.split(",");
    if ((response as any).customBody) {
      data = custom = await (response as any).customBody();
      if (response.headers.has("X-Single-Flight")) {
        data = data._$value;
        delete custom._$value;
        flightKeys = Object.keys(custom);
      }
    }
    if (response.headers.has("Location")) {
      const locationUrl = response.headers.get("Location") || "/";
      if (locationUrl.startsWith("http")) {
        window.location.href = locationUrl;
      } else {
        navigate(locationUrl);
      }
    }
  } else if (error) return { error: response };
  else data = response;
  // invalidate
  cacheKeyOp(keys, entry => (entry[0] = 0));
  // set cache
  flightKeys && flightKeys.forEach(k => query.set(k, custom[k]));
  // trigger revalidation
  await revalidate(keys, false);
  return data != null ? { data } : undefined;
}
