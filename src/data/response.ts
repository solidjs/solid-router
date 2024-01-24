export type RouterResponseInit = ResponseInit & { revalidate?: string | string[] };

export function redirect(url: string, init: number | RouterResponseInit = 302) {
  let responseInit: ResponseInit;
  let revalidate: string | string[] | undefined;
  if (typeof init === "number") {
    responseInit = { status: init };
  } else {
    ({ revalidate, ...responseInit } = init);
    if (typeof responseInit.status === "undefined") {
      responseInit.status = 302;
    }
  }

  const headers = new Headers(responseInit.headers);
  headers.set("Location", url);
  revalidate && headers.set("X-Revalidate", revalidate.toString());

  const response = new Response(null, {
    ...responseInit,
    headers: headers
  });

  return response as never;
}

export function reload(init: RouterResponseInit) {
  const { revalidate, ...responseInit } = init;
  return new Response(null, {
    ...responseInit,
    ...(revalidate
      ? { headers: new Headers(responseInit.headers).set("X-Revalidate", revalidate.toString()) }
      : {})
  }) as never;
}

export function json<T>(data: T, init?: Omit<ResponseInit, "body">) {
  const headers = new Headers((init || {}).headers);
  headers.set("Content-Type", "application/json");
  const response = new Response(JSON.stringify(data), {
    ...init,
    headers
  });
  (response as any).customBody = () => data;
  return response as T;
}
