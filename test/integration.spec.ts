import { hashIntegration } from "../src/integration";

describe("Hash integration should", () => {
  test.each([
    ["http://localhost/#", "/"], // This is potentially a problem (eg <a href="#">) but supporting empty path makes sense elsewhere.
    ["http://localhost/#/", "/"],
    ["http://localhost//#/practice", "/practice"],
    ["http://localhost/base/#/practice", "/practice"],
    ["http://localhost/#/practice#some-id", "/practice#some-id"],
    ["file:///C:/Users/Foo/index.html#/test", "/test"]
  ])(`parse paths (case '%s' as '%s')`, (urlString, expected) => {
    const url = new URL(urlString);
    const itegration = hashIntegration();
    const path = url.pathname + url.search + url.hash;
    const parsed = itegration.utils!.parsePath!(path);
    expect(parsed).toBe(expected);
  });

  test("parse hash-only paths to support in-page anchors", () => {
    window.location.hash = "/some-base-path";
    const url = new URL("http://localhost/#some-id");
    const itegration = hashIntegration();
    const path = url.pathname + url.search + url.hash;
    const parsed = itegration.utils!.parsePath!(path);
    expect(parsed).toBe("/some-base-path#some-id");
  });
});
