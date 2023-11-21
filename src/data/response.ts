export function redirect(url: string, init: number | ResponseInit = 302): Response {
  let responseInit = init;
  if (typeof responseInit === "number") {
    responseInit = { status: responseInit };
  } else if (typeof responseInit.status === "undefined") {
    responseInit.status = 302;
  }

  const headers = new Headers(responseInit.headers);
  headers.set("Location", url);

  const response = new Response(null, {
    ...responseInit,
    headers: headers
  });

  return response;
}