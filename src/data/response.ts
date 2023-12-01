export type RouterResponseInit = ResponseInit & { revalidate?: string | string[] };

export function redirect(url: string, init: number | RouterResponseInit = 302): Response {
  let responseInit: ResponseInit;
  let revalidate: string | string[] | undefined;
  if (typeof init === "number") {
    responseInit = { status: init };
  } else {
    ({revalidate, ...responseInit} = init);
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

  return response;
}

export function reload(init: RouterResponseInit): Response {
  const {revalidate, ...responseInit} = init;
  return new Response(null, {
    ...responseInit,
    ...(revalidate ? { headers: new Headers(responseInit.headers).set("X-Revalidate", revalidate.toString()) } : {})
  });
}