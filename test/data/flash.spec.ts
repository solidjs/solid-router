import { vi } from "vitest";
import {
  FLASH_COOKIE,
  clearFlashCookie,
  decodeFlashCookie,
  encodeFlashCookie,
  hasFlashCookie
} from "../../src/data/flash.js";

// Extracts the Cookie-header form ("flash=value") out of a Set-Cookie value.
function asCookieHeader(setCookie: string) {
  return setCookie.split(";")[0];
}

describe("flash cookie codec", () => {
  test("roundtrips a returned result with FormData input", () => {
    const form = new FormData();
    form.set("title", "hello");
    form.set("body", "world");
    const setCookie = encodeFlashCookie("/_server?id=createNote", { id: 1 }, [form]);
    expect(setCookie).toContain(`${FLASH_COOKIE}=`);
    expect(setCookie).toContain("HttpOnly");

    const submission = decodeFlashCookie(asCookieHeader(setCookie))!;
    expect(submission.url).toBe("/_server?id=createNote");
    expect(submission.result).toEqual({ id: 1 });
    expect(submission.error).toBeUndefined();
    expect(submission.input[0]).toBeInstanceOf(FormData);
    expect(submission.input[0].get("title")).toBe("hello");
    expect(submission.input[0].get("body")).toBe("world");
  });

  test("roundtrips URLSearchParams and extra bound arguments", () => {
    const params = new URLSearchParams("a=1&b=2");
    const setCookie = encodeFlashCookie("/_server?id=fn", "ok", ["bound", params]);
    const submission = decodeFlashCookie(asCookieHeader(setCookie))!;
    expect(submission.input[0]).toBe("bound");
    expect(submission.input[1]).toBeInstanceOf(URLSearchParams);
    expect(submission.input[1].get("b")).toBe("2");
  });

  test("drops File entries (they cannot ride a cookie)", () => {
    const form = new FormData();
    form.set("name", "solid");
    form.set("upload", new File(["data"], "notes.txt"));
    const setCookie = encodeFlashCookie("/_server?id=fn", "ok", [form]);
    const submission = decodeFlashCookie(asCookieHeader(setCookie))!;
    expect(submission.input[0].get("name")).toBe("solid");
    expect(submission.input[0].get("upload")).toBeNull();
  });

  test("thrown errors decode onto `error` as an Error", () => {
    const setCookie = encodeFlashCookie("/_server?id=fn", new Error("denied"), [], true);
    const submission = decodeFlashCookie(asCookieHeader(setCookie))!;
    expect(submission.result).toBeUndefined();
    expect(submission.error).toBeInstanceOf(Error);
    expect(submission.error.message).toBe("denied");
  });

  test("finds the flash cookie among others and ignores its absence", () => {
    const setCookie = encodeFlashCookie("/u", "ok", []);
    const header = `session=abc; ${asCookieHeader(setCookie)}; theme=dark`;
    expect(hasFlashCookie(header)).toBe(true);
    expect(decodeFlashCookie(header)!.result).toBe("ok");

    expect(hasFlashCookie("session=abc")).toBe(false);
    expect(decodeFlashCookie("session=abc")).toBeUndefined();
    expect(decodeFlashCookie(null)).toBeUndefined();
  });

  test("malformed payloads decode to undefined without throwing", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(decodeFlashCookie(`${FLASH_COOKIE}=%7Bnot-json`)).toBeUndefined();
    spy.mockRestore();
  });

  test("clearFlashCookie expires immediately", () => {
    expect(clearFlashCookie()).toContain("Max-Age=0");
    expect(clearFlashCookie().startsWith(`${FLASH_COOKIE}=;`)).toBe(true);
  });
});
