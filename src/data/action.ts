import { $TRACK, createMemo, createSignal, JSX, onCleanup, getOwner } from "solid-js";
import { isServer } from "solid-js/web";
import { useRouter } from "../routing";
import { RouterContext, Submission, Navigator } from "../types";
import { redirectStatusCodes } from "../utils";
import { hashKey, revalidate } from "./cache";

export type Action<T extends Array<any>, U> = T extends [FormData] | []
  ? ((...vars: T) => Promise<U>) &
      JSX.SerializableAttributeValue & {
        url: string;
        with<A extends any[], B extends any[]>(
          this: (this: any, ...args: [...A, ...B]) => U,
          ...args: A
        ): Action<B, U>;
      }
  : ((...vars: T) => Promise<U>) & {
      url: string;
      with<A extends any[], B extends any[]>(
        this: (this: any, ...args: [...A, ...B]) => U,
        ...args: A
      ): Action<B, U>;
    };

export const actions = /* #__PURE__ */ new Map<string, Action<any, any>>();

export function useSubmissions<T extends Array<any>, U>(
  fn: Action<T, U>,
  filter?: (arg: T) => boolean
): Submission<T, U>[] & { pending: boolean } {
  const router = useRouter();
  const subs = createMemo(() =>
    router.submissions[0]().filter(s => s.url === fn.toString() && (!filter || filter(s.input)))
  );
  return new Proxy<Submission<any, any>[] & { pending: boolean }>([] as any, {
    get(_, property) {
      if (property === $TRACK) return subs();
      if (property === "pending") return subs().some(sub => !sub.result);
      return subs()[property as any];
    }
  });
}

export function useSubmission<T extends Array<any>, U>(
  fn: Action<T, U>,
  filter?: (arg: T) => boolean
): Submission<T, U> {
  const submissions = useSubmissions(fn, filter);
  return new Proxy(
    {},
    {
      get(_, property) {
        return submissions[submissions.length - 1]?.[property as keyof Submission<T, U>];
      }
    }
  ) as Submission<T, U>;
}

export function useAction<T extends Array<any>, U>(action: Action<T, U>) {
  const router = useRouter();
  return (...args: Parameters<Action<T, U>>) => action.apply(router, args);
}

export function action<T extends Array<any>, U = void>(
  fn: (...args: T) => Promise<U>,
  name?: string
): Action<T, U> {
  function mutate(this: RouterContext, ...variables: T) {
    const p = fn(...variables);
    const [result, setResult] = createSignal<{ data?: U }>();
    let submission: Submission<T, U>;
    const router = this;
    async function handler(res: any) {
      const data = await handleResponse(res as any, router.navigatorFactory());
      data ? setResult({ data }) : submission.clear();
      return data;
    }
    router.submissions[1](s => [
      ...s,
      (submission = {
        input: variables,
        url,
        get result() {
          return result()?.data;
        },
        get pending() {
          return !result();
        },
        clear() {
          router.submissions[1](v => v.filter(i => i.input !== variables));
        },
        retry() {
          setResult(undefined);
          const p = fn(...variables);
          p.then(handler, handler);
          return p;
        }
      })
    ]);
    p.then(handler, handler);
    return p;
  }

  const url: string =
    (fn as any).url || (name && `action:${name}`) || (!isServer ? `action:${fn.name}` : "");
  return toAction(mutate, url);
}

function toAction<T extends Array<any>, U>(fn: Function, url: string): Action<T, U> {
  fn.toString = () => {
    if (!url) throw new Error("Client Actions need explicit names if server rendered");
    return url;
  };
  (fn as any).with = function <A extends any[], B extends any[]>(
    this: (...args: [...A, ...B]) => U,
    ...args: A
  ) {
    const newFn = function (this: RouterContext, ...passedArgs: B): U {
      return fn.call(this, ...args, ...passedArgs);
    };
    const uri = new URL(url, "http://sar");
    uri.searchParams.set("args", hashKey(args));
    return toAction<B, U>(newFn as any, uri.pathname + uri.search);
  };
  (fn as any).url = url;
  if (!isServer) {
    actions.set(url, fn as Action<T, U>);
    getOwner() && onCleanup(() => actions.delete(url));
  }
  return fn as Action<T, U>;
}

async function handleResponse(response: Response, navigate: Navigator) {
  let data: any;
  let keys: string[] | undefined;
  if (response instanceof Response) {
    if (response.headers.has("X-Revalidate")) {
      keys = response.headers.get("X-Revalidate")!.split(",");
    }
    if ((response as any).customBody) data = await (response as any).customBody();
    if (redirectStatusCodes.has(response.status)) {
      const locationUrl = response.headers.get("Location") || "/";
      if (locationUrl.startsWith("http")) {
        window.location.href = locationUrl;
      } else {
        navigate(locationUrl);
      }
    }
  } else data = response;
  await revalidate(keys);
  return data;
}
