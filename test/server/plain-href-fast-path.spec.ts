import { describe, expect, test } from "vitest";
import { comparablePath, mockBase, normalizePath, plainHref } from "../../src/utils.js";

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
