import { hashIntegration } from "../src/integration";

describe("Hash integration should", () => {
  test.each([
    ["http://localhost//#/practice", "/practice"],
    ["file:///C:/Users/Foo/index.html#/test", "/test"],
  ])(`parse paths (case '%s' as '%s')`, (urlString, expected) => {
    const url = new URL(urlString);
    const itegration = hashIntegration();
    const path = url.pathname + url.search + url.hash;
    const parsed = itegration.utils!.parsePath!(path);
    expect(parsed).toBe(expected);
  });
});
