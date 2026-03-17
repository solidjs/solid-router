import { redirect, reload, json } from "./response.js";

describe("redirect", () => {
  test("should create redirect response with default `302` status", () => {
    const response = redirect("/new-path");

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/new-path");
  });

  test("should create redirect response with custom status", () => {
    const response = redirect("/permanent-redirect", 301);

    expect(response.status).toBe(301);
    expect(response.headers.get("Location")).toBe("/permanent-redirect");
  });

  test("should create redirect response with `RouterResponseInit` object", () => {
    const response = redirect("/custom-redirect", {
      status: 307,
      headers: { "X-Custom": "header" }
    });

    expect(response.status).toBe(307);
    expect(response.headers.get("Location")).toBe("/custom-redirect");
    expect(response.headers.get("X-Custom")).toBe("header");
  });

  test("should include `revalidate` header when specified", () => {
    const response = redirect("/revalidate-redirect", {
      revalidate: ["key1", "key2"]
    });

    expect(response.headers.get("X-Revalidate")).toBe("key1,key2");
  });

  test("should include `revalidate` header with `string` value", () => {
    const response = redirect("/single-revalidate", {
      revalidate: "single-key"
    });

    expect(response.headers.get("X-Revalidate")).toBe("single-key");
  });

  test("should preserve custom headers while adding Location", () => {
    const response = redirect("/with-headers", {
      headers: {
        "Content-Type": "application/json",
        "X-Custom": "value"
      }
    });

    expect(response.headers.get("Location")).toBe("/with-headers");
    expect(response.headers.get("Content-Type")).toBe("application/json");
    expect(response.headers.get("X-Custom")).toBe("value");
  });

  test("should handle absolute URLs", () => {
    const response = redirect("https://external.com/path");

    expect(response.headers.get("Location")).toBe("https://external.com/path");
  });
});

describe("reload", () => {
  test("should create reload response with default empty body", () => {
    const response = reload();

    expect(response.status).toBe(200);
    expect(response.body).toBeNull();
  });

  test("should create reload response with custom status", () => {
    const response = reload({ status: 204 });

    expect(response.status).toBe(204);
  });

  test("should include revalidate header when specified", () => {
    const response = reload({
      revalidate: ["cache-key"]
    });

    expect(response.headers.get("X-Revalidate")).toBe("cache-key");
  });

  test("should include revalidate header with array of keys", () => {
    const response = reload({
      revalidate: ["key1", "key2", "key3"]
    });

    expect(response.headers.get("X-Revalidate")).toBe("key1,key2,key3");
  });

  test("should preserve custom headers", () => {
    const response = reload({
      headers: {
        "X-Custom-Header": "custom-value",
        "Cache-Control": "no-cache"
      }
    });

    expect(response.headers.get("X-Custom-Header")).toBe("custom-value");
    expect(response.headers.get("Cache-Control")).toBe("no-cache");
  });

  test("should combine custom headers with revalidate", () => {
    const response = reload({
      revalidate: "reload-key",
      headers: {
        "X-Source": "reload-action"
      }
    });

    expect(response.headers.get("X-Revalidate")).toBe("reload-key");
    expect(response.headers.get("X-Source")).toBe("reload-action");
  });
});

describe("json", () => {
  test("should create `JSON` response with data", () => {
    const data = { message: "Hello", count: 42 };
    const response = json(data);

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/json");
    expect(typeof response.customBody).toBe("function");
    expect(response.customBody()).toEqual(data);
  });

  test("should serialize data to `JSON` in response body", async () => {
    const data = { test: true, items: [1, 2, 3] };
    const response = json(data);

    const body = await response.text();
    expect(body).toBe(JSON.stringify(data));
  });

  test("should create `JSON` response with custom status", () => {
    const response = json({ error: "Not found" }, { status: 404 });

    expect(response.status).toBe(404);
    expect(response.headers.get("Content-Type")).toBe("application/json");
  });

  test("should include revalidate header when specified", () => {
    const response = json({ updated: true }, { revalidate: ["data-key"] });

    expect(response.headers.get("X-Revalidate")).toBe("data-key");
  });

  test("should preserve custom headers while adding Content-Type", () => {
    const response = json(
      { data: "test" },
      {
        headers: {
          "X-API-Version": "v1",
          "Cache-Control": "max-age=3600"
        }
      }
    );

    expect(response.headers.get("Content-Type")).toBe("application/json");
    expect(response.headers.get("X-API-Version")).toBe("v1");
    expect(response.headers.get("Cache-Control")).toBe("max-age=3600");
  });

  test("should handle `null` data", () => {
    const response = json(null);

    expect(response.customBody()).toBeNull();
  });

  test("should handle undefined data", () => {
    const response = json(undefined);

    expect(response.customBody()).toBeUndefined();
  });

  test("should handle complex nested data", () => {
    const complexData = {
      user: { id: 1, name: "John" },
      preferences: { theme: "dark", lang: "en" },
      items: [
        { id: 1, title: "Item 1" },
        { id: 2, title: "Item 2" }
      ]
    };

    const response = json(complexData);

    expect(response.customBody()).toEqual(complexData);
  });

  test("should combine all options", () => {
    const data = { message: "Success" };
    const response = json(data, {
      status: 201,
      revalidate: ["user-data", "cache-key"],
      headers: {
        "X-Created": "true",
        Location: "/new-resource"
      }
    });

    expect(response.status).toBe(201);
    expect(response.headers.get("Content-Type")).toBe("application/json");
    expect(response.headers.get("X-Revalidate")).toBe("user-data,cache-key");
    expect(response.headers.get("X-Created")).toBe("true");
    expect(response.headers.get("Location")).toBe("/new-resource");
    expect(response.customBody()).toEqual(data);
  });
});
