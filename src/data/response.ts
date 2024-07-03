import type { RouterResponseInit, CustomResponse } from "../types";

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

  return response as CustomResponse<never>;
}

export function reload(init: RouterResponseInit = {}) {
  const { revalidate, ...responseInit } = init;
  const headers = new Headers(responseInit.headers);
  revalidate && headers.set("X-Revalidate", revalidate.toString());

  return new Response(null, {
    ...responseInit,
    headers
  }) as CustomResponse<never>;
}

export function json<T>(data: T, init: RouterResponseInit = {}) {
  const { revalidate, ...responseInit } = init;
  const headers = new Headers(responseInit.headers);
  revalidate && headers.set("X-Revalidate", revalidate.toString());
  headers.set("Content-Type", "application/json");

  const response = new Response(JSON.stringify(data), {
    ...responseInit,
    headers
  });
  (response as CustomResponse<T>).customBody = () => data;
  return response as CustomResponse<T>;
}
