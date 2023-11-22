import { $TRACK, createMemo, createSignal, JSX } from "solid-js";
import { isServer } from "solid-js/web";
import { registerAction, useRouter } from "../routing";
import { RouterContext, Submission, Navigator } from "../types";
import { redirectStatusCodes } from "../utils";
import { revalidate } from "./cache";

export type Action<T, U> = ((vars: T) => Promise<U>) & JSX.SerializableAttributeValue;

export function useSubmissions<T, U>(
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

export function useSubmission<T, U>(
  fn: Action<T, U>,
  filter?: (arg: T) => boolean
): Submission<T, U> {
  const submissions = useSubmissions(fn, filter);
  return {
    get clear() {
      return submissions[0]?.clear;
    },
    get retry() {
      return submissions[0]?.retry;
    },
    get url() {
      return submissions[0]?.url;
    },
    get input() {
      return submissions[0]?.input;
    },
    get result() {
      return submissions[0]?.result;
    },
    get pending() {
      return submissions[0]?.pending;
    }
  };
}

export function useAction<T, U>(action: Action<T, U>) {
  const router = useRouter();
  return action.bind(router);
}

export function action<T, U = void>(fn: (args: T) => Promise<U>, name?: string): Action<T, U> {
  function mutate(this: RouterContext, variables: T) {
    const p = fn(variables);
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
          const p = fn(variables);
          p.then(handler, handler);
          return p;
        }
      })
    ]);
    p.then(handler, handler);
    return p;
  }

  const url =
    (fn as any).url || (name && `action:${name}`) || (!isServer ? `action:${fn.name}` : "");
  mutate.toString = () => {
    if (!url) throw new Error("Client Actions need explicit names if server rendered");
    return url;
  };
  if (!isServer) registerAction(url, mutate);
  return mutate as Action<T, U>;
}

async function handleResponse(response: Response, navigate: Navigator) {
  let data: any;
  if (response instanceof Response && redirectStatusCodes.has(response.status)) {
    const locationUrl = response.headers.get("Location") || "/";
    if (locationUrl.startsWith("http")) {
      window.location.href = locationUrl;
    } else {
      navigate(locationUrl);
    }
  } else data = response;
  // TODO: handle keys
  await revalidate();
  return data;
}
