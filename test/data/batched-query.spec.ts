import { batchedQuery } from "../../src/data/query.js";

// A read that squares every number it gets and records each batch.
function squares(fail: (queries: number[]) => boolean = () => false) {
  const batches: number[][] = [];
  const read = batchedQuery(
    async (queries: number[]) => {
      // Settle on a later tick, like a real read.
      await Promise.resolve();
      batches.push(queries);
      if (fail(queries)) throw new Error(`refused ${queries.join(",")}`);
      const answers = new Map<number, number>();
      for (const query of queries) answers.set(query, query * query);
      return answers;
    },
    (answers, query) => answers.get(query) ?? Number.NaN,
    { limit: 2 }
  );

  return { read, batches };
}

describe("batchedQuery should", () => {
  test("read calls made together with one read", async () => {
    const { read, batches } = squares();

    expect(await Promise.all([read(2), read(3)])).toEqual([4, 9]);
    expect(batches).toEqual([[2, 3]]);
  });

  test("read a repeated query only once", async () => {
    const { read, batches } = squares();

    expect(await Promise.all([read(2), read(2), read(3)])).toEqual([4, 4, 9]);
    expect(batches).toEqual([[2, 3]]);
  });

  test("split queries past the limit across reads", async () => {
    const { read, batches } = squares();

    expect(await Promise.all([read(1), read(2), read(3)])).toEqual([1, 4, 9]);
    expect(batches).toEqual([[1, 2], [3]]);
  });

  test("reject only the callers of the failed read", async () => {
    const { read } = squares(queries => queries.includes(3));
    const answers = await Promise.allSettled([read(1), read(2), read(3)]);

    expect(answers[0]).toEqual({ status: "fulfilled", value: 1 });
    expect(answers[1]).toEqual({ status: "fulfilled", value: 4 });
    expect(answers[2].status).toBe("rejected");
  });

  test("reject only the callers of a failed lookup", async () => {
    const read = batchedQuery(
      async (queries: number[]) => queries,
      (_data, query) => {
        if (query === 2) throw new Error("missing");
        return query;
      }
    );
    const answers = await Promise.allSettled([read(1), read(2)]);

    expect(answers[0]).toEqual({ status: "fulfilled", value: 1 });
    expect(answers[1].status).toBe("rejected");
  });

  test("start a new read for calls made after a read went out", async () => {
    const { read, batches } = squares();

    expect(await read(2)).toBe(4);
    expect(await read(2)).toBe(4);
    expect(batches).toEqual([[2], [2]]);
  });

  test("start a new read for calls made during a read", async () => {
    const batches: number[][] = [];
    let inner: Promise<number> | undefined;
    const read: (query: number) => Promise<number> = batchedQuery(
      async (queries: number[]) => {
        batches.push(queries);
        if (!inner) inner = read(99);
        return queries.map(query => query * 10);
      },
      (data, _query, index) => data[index]
    );

    expect(await read(1)).toBe(10);
    expect(await inner).toBe(990);
    expect(batches).toEqual([[1], [99]]);
  });

  test("match object queries by value", async () => {
    const seen: string[][] = [];
    const read = batchedQuery(
      async (queries: { id: string }[]) => {
        const ids = queries.map(query => query.id);
        seen.push(ids);
        return ids;
      },
      (ids, _query, index) => ids[index]
    );

    expect(await Promise.all([read({ id: "a" }), read({ id: "a" })])).toEqual(["a", "a"]);
    expect(seen).toEqual([["a"]]);
  });

  test("match queries by a custom key", async () => {
    const seen: string[][] = [];
    const read = batchedQuery(
      async (queries: { id: string; extra: number }[]) => {
        const ids = queries.map(query => query.id);
        seen.push(ids);
        return ids;
      },
      (ids, _query, index) => ids[index],
      { key: query => query.id }
    );

    expect(await Promise.all([read({ id: "a", extra: 1 }), read({ id: "a", extra: 2 })])).toEqual([
      "a",
      "a"
    ]);
    expect(seen).toEqual([["a"]]);
  });
});
