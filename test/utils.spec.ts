import {
  createMatcher,
  joinPaths,
  resolvePath,
  createMemoObject,
  expandOptionals,
  mergeSearchString,
  extractSearchParams
} from "../src/utils";

describe("resolvePath should", () => {
  test("normalize the base arg", () => {
    const expected = "/base";
    const actual = resolvePath("base", "");
    expect(actual).toBe(expected);
  });

  test("normalize the path arg", () => {
    const expected = "/path";
    const actual = resolvePath("", "path");
    expect(actual).toBe(expected);
  });

  test("normalize the from arg", () => {
    const expected = "/from";
    const actual = resolvePath("", "", "from");
    expect(actual).toBe(expected);
  });

  test("returns the default path when all ags are empty", () => {
    const expected = "/";
    const actual = resolvePath("", "");
    expect(actual).toBe(expected);
  });

  test("resolve root path against base and ignore from", () => {
    const expected = "/base";
    const actual = resolvePath("/base", "/", "/base/foo");
    expect(actual).toBe(expected);
  });

  test("resolve rooted paths against base and ignore from", () => {
    const expected = "/base/bar";
    const actual = resolvePath("/base", "/bar", "/base/foo");
    expect(actual).toBe(expected);
  });

  test("resolve empty path against from", () => {
    const expected = "/base/foo";
    const actual = resolvePath("/base", "", "/base/foo");
    expect(actual).toBe(expected);
  });

  test("resolve relative paths against from", () => {
    const expected = "/base/foo/bar";
    const actual = resolvePath("/base", "bar", "/base/foo");
    expect(actual).toBe(expected);
  });

  test("prepend base if from does not start with it", () => {
    const expected = "/base/foo/bar";
    const actual = resolvePath("/base", "bar", "/foo");
    expect(actual).toBe(expected);
  });

  test(`test start of from against base case-insensitive`, () => {
    const expected = "/BASE/foo/bar";
    const actual = resolvePath("/base", "bar", "BASE/foo");
    expect(actual).toBe(expected);
  });

  test(`work with rooted search and base`, () => {
    const expected = "/base?foo=bar";
    const actual = resolvePath("/base", "/?foo=bar", "/base/page");
    expect(actual).toBe(expected);
  });

  test(`work with rooted search`, () => {
    const expected = "/?foo=bar";
    const actual = resolvePath("", "/?foo=bar", "");
    expect(actual).toBe(expected);
  });

  test(`preserve spaces`, () => {
    const expected = "/ foo / bar baz ";
    const actual = resolvePath(" foo ", " bar baz ", "");
    expect(actual).toBe(expected);
  });
});

describe("mergeSearchString should", () => {
  test("return empty string when current and new params are empty", () => {
    const expected = "";
    const actual = mergeSearchString("", {});
    expect(actual).toBe(expected);
  });

  test("return new params when current params are empty", () => {
    const expected = "?foo=bar";
    const actual = mergeSearchString("", { foo: "bar" });
    expect(actual).toBe(expected);
  });

  test("return current params when new params are empty", () => {
    const expected = "?foo=bar";
    const actual = mergeSearchString("?foo=bar", {});
    expect(actual).toBe(expected);
  });

  test("return merged params when current and new params are not empty", () => {
    const expected = "?foo=bar&baz=qux";
    const actual = mergeSearchString("?foo=bar", { baz: "qux" });
    expect(actual).toBe(expected);
  });

  test("return ampersand-separated params when new params is an array", () => {
    const expected = "?foo=bar&foo=baz";
    const actual = mergeSearchString("", { foo: ["bar", "baz"] });
    expect(actual).toBe(expected);
  });

  test("return ampersand-separated params when current params is an array of numbers", () => {
    const expected = "?foo=1&foo=2";
    const actual = mergeSearchString("", { foo: [1, 2] });
    expect(actual).toBe(expected);
  });

  test("return empty string when new is an empty array", () => {
    const expected = "";
    const actual = mergeSearchString("", { foo: [] });
    expect(actual).toBe(expected);
  });

  test("return empty string when current is present and new is an empty array", () => {
    const expected = "";
    const actual = mergeSearchString("?foo=2&foo=3", { foo: [] });
    expect(actual).toBe(expected);
  });

  test("return array containing only new value when current is present and new is an array with one value", () => {
    const expected = "?foo=1&foo=2";
    const actual = mergeSearchString("?foo=3&foo=4", { foo: [1, 2] });
    expect(actual).toBe(expected);
  });
});

describe("extractSearchParams should", () => {
  test("return empty object when URL has no search params", () => {
    const url = new URL("http://localhost/");
    const expected = {};
    const actual = extractSearchParams(url);
    expect(actual).toEqual(expected);
  });

  test("return search params as object", () => {
    const url = new URL("http://localhost/?foo=bar&baz=qux");
    const expected = { foo: "bar", baz: "qux" };
    const actual = extractSearchParams(url);
    expect(actual).toEqual(expected);
  });

  test("return search params as object with array values", () => {
    const url = new URL("http://localhost/?foo=bar&foo=baz");
    const expected = { foo: ["bar", "baz"] };
    const actual = extractSearchParams(url);
    expect(actual).toEqual(expected);
  });
});

describe("createMatcher should", () => {
  test("return empty object when location matches simple path", () => {
    const expected = { path: "/foo/bar", params: {} };
    const matcher = createMatcher("/foo/bar");
    const match = matcher("/foo/bar");
    expect(match).not.toBe(null);
    expect(match!.path).toBe(expected.path);
    expect(match!.params).toEqual(expected.params);
  });

  test("return null when location does not match", () => {
    const expected = null;
    const matcher = createMatcher("/foo/bar");
    const match = matcher("/foo/baz");
    expect(match).toEqual(expected);
  });

  test("return params collection when location matches parameterized path", () => {
    const expected = { path: "/foo/abc-123", params: { id: "abc-123" } };
    const matcher = createMatcher("/foo/:id");
    const match = matcher("/foo/abc-123");
    expect(match).not.toBe(null);
    expect(match!.path).toBe(expected.path);
    expect(match!.params).toEqual(expected.params);
  });

  test("match past end when end when ending in a /*", () => {
    const expected = { path: "/foo/bar", params: {} };
    const matcher = createMatcher("/foo/bar/*");
    const match = matcher("/foo/bar/baz");
    expect(match).not.toBe(null);
    expect(match!.path).toBe(expected.path);
    expect(match!.params).toEqual(expected.params);
  });

  test("not match past end when not ending in /*", () => {
    const expected = null;
    const matcher = createMatcher("/foo/bar");
    const match = matcher("/foo/bar/baz");
    expect(match).toBe(expected);
  });

  test("include remaining unmatched location as param when ending in /*param_name", () => {
    const expected = { path: "/foo/bar", params: { something: "baz/qux" } };
    const matcher = createMatcher("/foo/bar/*something");
    const match = matcher("/foo/bar/baz/qux");
    expect(match).not.toBe(null);
    expect(match!.path).toBe(expected.path);
    expect(match!.params).toEqual(expected.params);
  });

  test("include empty param when ending in /*param_name and exact match", () => {
    const expected = { path: "/foo/bar", params: { something: "" } };
    const matcher = createMatcher("/foo/bar/*something");
    const match = matcher("/foo/bar");
    expect(match).not.toBe(null);
    expect(match!.path).toBe(expected.path);
    expect(match!.params).toEqual(expected.params);
  });

  test("apply matchFilter containing a regular expression", () => {
    const matcher = createMatcher("/products/:id", undefined, { id: /^\d+$/ });

    const expected = { path: "/products/5", params: { id: "5" } };
    const match = matcher("products/5");
    expect(match).not.toBe(null);
    expect(match!.path).toBe(expected.path);
    expect(match!.params).toEqual(expected.params);

    const failure = matcher("produts/fifth");
    expect(failure).toBe(null);
  });

  test("apply matchFilter containing an array of matches", () => {
    const matcher = createMatcher("/pets/:pet", undefined, { pet: ["cat", "dog"] });
    const expected = { path: "/pets/dog", params: { pet: "dog" } };
    const match = matcher("pets/dog");
    expect(match).not.toBe(null);
    expect(match!.path).toBe(expected.path);
    expect(match!.params).toEqual(expected.params);

    const failure = matcher("pets/shark");
    expect(failure).toBe(null);
  });

  test("apply matchFilter containing a predicate function", () => {
    const matcher = createMatcher("/:parent/:birthYear", undefined, {
      parent: v => ["dad", "mum"].includes(v),
      birthYear: v => /^\d+$/.test(v)
    });

    const expected1 = { path: "/dad/1943", params: { parent: "dad", birthYear: "1943" } };
    const match1 = matcher("/dad/1943");
    expect(match1).not.toBe(null);
    expect(match1!.path).toBe(expected1.path);
    expect(match1!.params).toEqual(expected1.params);

    const expected2 = { path: "/mum/1954", params: { parent: "mum", birthYear: "1954" } };
    const match2 = matcher("/mum/1954");
    expect(match2).not.toBe(null);
    expect(match2!.path).toBe(expected2.path);
    expect(match2!.params).toEqual(expected2.params);

    const match3 = matcher("/ant/twothousandtwentythree");
    expect(match3).toBe(null);

    const match4 = matcher("/dad/mum");
    expect(match4).toBe(null);

    const match5 = matcher("/123/mum");
    expect(match5).toBe(null);
  });

  test("apply matchFilter to a wildcard parameter", () => {
    const matcher = createMatcher("/tree/*leaves", undefined, {
      leaves: /^((left|right)\/)*\d+$/
    });

    const expected = { path: "/tree", params: { leaves: "left/right/left/left/53" } };
    const match = matcher("/tree/left/right/left/left/53");
    expect(match).not.toBe(null);
    expect(match!.path).toBe(expected.path);
    expect(match!.params).toEqual(expected.params);

    const failure = matcher("tree/left/up/right/12");
    expect(failure).toBe(null);
  });
});

describe("joinPaths should", () => {
  test.each([
    ["/foo", "bar", "/foo/bar"],
    ["/foo/", "bar", "/foo/bar"],
    ["/foo", "/bar", "/foo/bar"],
    ["/foo/", "/bar", "/foo/bar"]
  ])(`join with a single '/' (case '%s' and '%s' as '%s')`, (from, to, expected) => {
    const joined = joinPaths(from, to);
    expect(joined).toBe(expected);
  });

  test.each([
    ["/foo", "", "/foo"],
    ["foo", "", "/foo"],
    ["", "foo", "/foo"],
    ["", "/foo", "/foo"],
    ["/", "foo", "/foo"],
    ["/", "/foo", "/foo"]
  ])(`ensure leading '/' (case '%s' and '%s' as '%s')`, (from, to, expected) => {
    const joined = joinPaths(from, to);
    expect(joined).toBe(expected);
  });

  test.each([
    ["/foo", "", "/foo"],
    ["/foo/", "/", "/foo"],
    ["/foo/", "bar/", "/foo/bar/"]
  ])(`strip trailing '/' (case '%s' and '%s' as '%s')`, (from, to, expected) => {
    const joined = joinPaths(from, to);
    expect(joined).toBe(expected);
  });

  test.each([
    ["foo/*", "", "/foo"],
    ["foo/*", "/", "/foo"],
    ["/foo/*all", "", "/foo"],
    ["/foo/*", "bar", "/foo/bar"],
    ["/foo/*all", "bar", "/foo/bar"],
    ["/*", "foo", "/foo"],
    ["/*all", "foo", "/foo"],
    ["*", "foo", "/foo"]
  ])(`strip trailing '/*' (case '%s' and '%s' as '%s')`, (from, to, expected) => {
    const joined = joinPaths(from, to);
    expect(joined).toBe(expected);
  });

  test.each([
    ["/foo/:bar", "", "/foo/:bar"],
    ["/foo/:bar", "baz", "/foo/:bar/baz"],
    ["/foo", ":bar/baz", "/foo/:bar/baz"],
    ["", ":bar/baz", "/:bar/baz"]
  ])(`preserve parameters (case '%s' and '%s' as '%s')`, (from, to, expected) => {
    const joined = joinPaths(from, to);
    expect(joined).toBe(expected);
  });
});

describe("createMemoObject should", () => {
  test("allow listing its own keys", () => {
    const actual = createMemoObject(() => ({
      hello: "world",
      get throws() {
        throw new Error("throws");
      }
    }));
    expect(Object.getOwnPropertyNames(actual)).toEqual(["hello", "throws"]);
  });

  test("allow listing its keys", () => {
    const actual = createMemoObject(() => ({
      hello: "world",
      get throws() {
        throw new Error("throws");
      }
    }));
    expect(Object.keys(actual)).toEqual(["hello", "throws"]);
  });

  test("stringify into JSON", () => {
    const actual = createMemoObject(() => ({
      hello: "world",
      get getter() {
        return "works too";
      }
    }));
    expect(JSON.stringify(actual)).toEqual(
      JSON.stringify({
        hello: "world",
        getter: "works too"
      })
    );
  });
});

describe("expandOptionals should", () => {
  test.each([
    ["/foo/:x", ["/foo/:x"]],
    ["/foo/:x?", ["/foo", "/foo/:x"]],
    ["/bar/:x?/", ["/bar/", "/bar/:x/"]],
    ["/foo/:x?/:y?/:z", ["/foo/:z", "/foo/:x/:z", "/foo/:x/:y/:z"]],
    ["/foo/:x?/:y/:z?", ["/foo/:y", "/foo/:x/:y", "/foo/:y/:z", "/foo/:x/:y/:z"]],
    ["/foo/:x?/:y?/:z?", ["/foo", "/foo/:x", "/foo/:x/:y", "/foo/:x/:y/:z"]],
    [
      "/foo/:x?/bar/:y?/baz/:z?",
      [
        "/foo/bar/baz",
        "/foo/:x/bar/baz",
        "/foo/bar/:y/baz",
        "/foo/:x/bar/:y/baz",
        "/foo/bar/baz/:z",
        "/foo/:x/bar/baz/:z",
        "/foo/bar/:y/baz/:z",
        "/foo/:x/bar/:y/baz/:z"
      ]
    ]
  ])(`expand case '%s'`, (pattern, expected) => {
    const expanded = expandOptionals(pattern);
    expect(expanded).toEqual(expected);
  });
});
