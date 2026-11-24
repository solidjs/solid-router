import { describe, expect, test } from "vitest";
import {
  comparablePath,
  linkMatcher,
  mockBase,
  normalizePath,
  plainHref
} from "../../src/utils.js";
import { plainHrefMisses } from "../../src/claims.js";

const viaUrl = (path: string) =>
  new URL(mockBase + normalizePath(path.split(/[?#]/, 1)[0])).pathname
    .toLowerCase()
    .replace(/\/$/, "");

const alphabet = "/aZ09-._~!$&'()*+,;=:@?#%\\ \t\"<>`{}^|é→.";
function rand(seed: number) {
  let s = seed;
  return () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
}

describe("plain path fast path", () => {
  test("agrees with URL for random paths and hrefs", () => {
    const r = rand(1);
    let hits = 0;
    for (let i = 0; i < 50000; i++) {
      const len = Math.floor(r() * 12);
      let s = r() < 0.8 ? "/" : "";
      for (let j = 0; j < len; j++) s += alphabet[Math.floor(r() * alphabet.length)];
      expect(comparablePath(s), s).toBe(viaUrl(s));
      const plain = plainHref(s);
      if (!plain) continue;
      hits++;
      const url = new URL(s, "http://sr/page/here?x=1");
      expect(plain.pathname, s).toBe(url.pathname);
      expect(plain.search, s).toBe(url.search);
      expect(plain.comparable, s).toBe(viaUrl(url.pathname));
    }
    expect(hits).toBeGreaterThan(1000);
  });

  test("falls back for hrefs URL would rewrite", () => {
    for (const href of [
      "/a/../b",
      "/a/./b",
      "/caf%C3%A9",
      "/café",
      "//x.example/a",
      "/a b",
      "/a?q='x'",
      " /a"
    ])
      expect(plainHref(href), href).toBeUndefined();
    expect(plainHref("/About//?#x")).toEqual({
      pathname: "/About//",
      search: "",
      comparable: "/about"
    });
  });
});

describe("plainHrefMisses", () => {
  const state = (href: string, location: string) => {
    const url = new URL(href, "http://sr/page/here?x=1");
    return linkMatcher({ pathname: location, search: "" }, "")(url.pathname + url.search);
  };

  test("never rejects a link the matcher would mark", () => {
    const r = rand(2);
    const segment = () => ["a", "B", "ab", "a.b", "%41", ".", "..", ""][Math.floor(r() * 8)];
    const path = () => {
      let s = "";
      for (let n = Math.floor(r() * 4); n >= 0; n--) s += "/" + segment();
      return s;
    };
    const suffix = ["", "", "", "/", "//", "?x=1", "/?x=1", "#y", "/#y"];
    let misses = 0;
    let active = 0;
    for (let i = 0; i < 100000; i++) {
      const location = new URL("http://sr" + path()).pathname;
      const href = (r() < 0.5 ? location : path()) + suffix[Math.floor(r() * suffix.length)];
      if (!URL.canParse(href, "http://sr/page/here?x=1")) continue;
      const { active: a, current } = state(href, location);
      if (a) active++;
      if (plainHrefMisses(href, comparablePath(location))) {
        misses++;
        expect(a || current, `${href} on ${location}`).toBe(false);
      }
    }
    expect(misses).toBeGreaterThan(1000);
    expect(active).toBeGreaterThan(1000);
  });

  test("rejects unrelated plain paths and leaves the rest to the matcher", () => {
    for (const [href, loc] of [
      ["/server-side-rendered/1", "/server-side-rendered"],
      ["/a", ""],
      ["/About/x", "/about"]
    ])
      expect(plainHrefMisses(href, loc), href).toBe(true);
    for (const [href, loc] of [
      ["/a", "/a"],
      ["/A/", "/a"],
      ["/a", "/a/b"],
      ["/a?x=1", "/a"],
      ["/b?x=1", "/a"],
      ["/a//#y", "/a"],
      ["/", ""],
      ["/a/../b", "/b"],
      ["/%61", "/a"],
      ["relative", "/a"],
      ["//x.example/a", "/a"]
    ])
      expect(plainHrefMisses(href, loc), href).toBe(false);
  });
});
