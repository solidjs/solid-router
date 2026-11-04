// `revalidate: "*"` reaches the collector as `revalidateKeys: ["*"]` and must collect every query.
import { query } from "../../src/data/query.js";
import { createFlightDataCollector } from "../../src/server.js";

const getNotes = query(async () => ["note-1"], "revalidateAllNotes");

test("revalidate '*' collects every query on the page", async () => {
  const collect = createFlightDataCollector({
    routes: [{ path: "/notes", preload: () => getNotes() }]
  });
  const headers = new Headers({ referer: "http://localhost:3000/notes" });
  const request = new Request("http://localhost:3000/_server", { method: "POST", headers });
  const event = { request, response: { headers: new Headers() }, locals: {} };
  const outcome = {
    id: "fn#0",
    value: "mutated",
    response: new Response(null, { headers: { "X-Revalidate": "*" } }),
    request,
    thrown: false,
    targetUrl: "http://localhost:3000/notes",
    revalidateKeys: ["*"],
    foldedHeaders: headers
  };
  const data: any = await collect(event as any, outcome as any);
  expect(data && (await data["revalidateAllNotes[]"])).toEqual(["note-1"]);
});
