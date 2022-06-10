import { createBranch, createBranches, createRoutes } from "../src/routing";

const createRoute = (...args: Parameters<typeof createRoutes>) => createRoutes(...args)[0];

describe("createRoutes should", () => {
  describe(`return an array of objects for each path`, () => {
    test(`with a single path`, () => {
      const routeDef = {
        path: "foo"
      };
      const routes = createRoutes(routeDef);
      expect(routes[0].originalPath).toBe(routeDef.path);
    });

    test(`with multiple paths`, () => {
      const routeDef = {
        path: ["foo", "bar", "baz"]
      };
      const routes = createRoutes(routeDef);
      for (const [i, expected] of routeDef.path.entries()) {
        expect(routes[i].originalPath).toBe(expected);
      }
    });
  });

  describe(`include pattern which should`, () => {
    test(`join the base`, () => {
      const routeDef = {
        path: "bar"
      };
      const route = createRoute(routeDef, "/foo");
      expect(route.pattern).toBe("/foo/bar");
    });

    test(`strip /* from the base`, () => {
      const routeDef = {
        path: "bar"
      };
      const route = createRoute(routeDef, "/foo/*");
      expect(route.pattern).toBe("/foo/bar");
    });

    test(`strip /*all from the base`, () => {
      const routeDef = {
        path: "bar"
      };
      const route = createRoute(routeDef, "/foo/*all");
      expect(route.pattern).toBe("/foo/bar");
    });

    test(`strip /* when the route has children`, () => {
      const routeDef = {
        path: "foo/*",
        children: {
          path: "bar"
        }
      };
      const route = createRoute(routeDef);
      expect(route.pattern).toBe("/foo");
    });
  });

  describe(`include matcher function which should`, () => {
    test(`extract any path parameters`, () => {
      const routeDef = {
        path: "foo/:id/bar/:name"
      };
      const route = createRoute(routeDef);
      const { params } = route.matcher("/foo/123/bar/solid")!;
      expect(params).toEqual({
        id: "123",
        name: "solid"
      });
    });

    test(`provide the matched path`, () => {
      const routeDef = {
        path: "foo/:id/bar/:name"
      };
      const route = createRoute(routeDef);
      const { path } = route.matcher("/foo/123/bar/solid")!;
      expect(path).toBe("/foo/123/bar/solid");
    });

    test(`allow partial match for routes with children`, () => {
      const routeDef = {
        path: "foo/:id",
        children: {
          path: "bar/:name"
        }
      };
      const route = createRoute(routeDef);
      const match = route.matcher("/foo/123/bar/solid");
      expect(match).not.toBeNull();
      expect(match!.path).toBe("/foo/123");
      expect(match!.params).toEqual({
        id: "123"
      });
    });

    test(`allow partial match for routes ending in /*`, () => {
      const routeDef = {
        path: "foo/:id/*"
      };
      const route = createRoute(routeDef);
      const match = route.matcher("/foo/123/bar/solid");
      expect(match).not.toBeNull();
      expect(match!.path).toBe("/foo/123");
      expect(match!.params).toEqual({
        id: "123"
      });
    });

    test(`capture remaining location when ending in named splat`, () => {
      const routeDef = {
        path: "foo/:id/*all"
      };
      const route = createRoute(routeDef);
      const match = route.matcher("/foo/123/bar/solid");
      expect(match).not.toBeNull();
      expect(match!.path).toBe("/foo/123");
      expect(match!.params).toEqual({
        id: "123",
        all: "bar/solid"
      });
    });

    test(`match case insensitive`, () => {
      const routeDef = {
        path: "foo/bar/baz"
      };
      const route = createRoute(routeDef);
      const match = route.matcher("/fOo/BAR/bAZ");
      expect(match).not.toBeNull();
    });

    test(`preserve param name casing`, () => {
      const routeDef = {
        path: "foo/:sUpEr/*aLL"
      };
      const route = createRoute(routeDef);
      const { params } = route.matcher("/foo/123/bar/solid")!;
      expect(params).toEqual({
        sUpEr: "123",
        aLL: "bar/solid"
      });
    });

    test(`preserve param value casing`, () => {
      const routeDef = {
        path: "foo/:id/*all"
      };
      const route = createRoute(routeDef);
      const { params } = route.matcher("/foo/someTHING/BaR/sOlId")!;
      expect(params).toEqual({
        id: "someTHING",
        all: "BaR/sOlId"
      });
    });
  });

  describe(`expand optional parameters`, () => {
    test(`with a single path`, () => {
      const routeDef = {
        path: "foo/:id?"
      };
      const routes = createRoutes(routeDef);
      expect(routes[0].originalPath).toBe("foo");
      expect(routes[1].originalPath).toBe("foo/:id");
    });

    test(`with a multiple paths`, () => {
      const routeDef = {
        path: ["foo/:id?", "bar/:name?"]
      };
      const routes = createRoutes(routeDef);
      expect(routes[0].originalPath).toBe("foo");
      expect(routes[1].originalPath).toBe("foo/:id");
      expect(routes[2].originalPath).toBe("bar");
      expect(routes[3].originalPath).toBe("bar/:name");
    });
  });
});

describe("createBranch should", () => {
  test(`return an object containing the provided routes`, () => {
    const routes = [
      createRoute({
        path: "foo"
      }),
      createRoute({
        path: "foo/bar"
      })
    ];
    const branch = createBranch(routes);
    expect(branch.routes).toBe(routes);
  });

  describe(`include a score which should`, () => {
    test("prioritize segment count", () => {
      const branch1 = createBranch([
        createRoute({
          path: "foo",
          children: {
            path: "bar",
            children: {
              path: "baz"
            }
          }
        }),
        createRoute({
          path: "foo/bar",
          children: {
            path: "baz"
          }
        }),
        createRoute({
          path: "foo/bar/baz"
        })
      ]);
      const branch2 = createBranch([
        createRoute({
          path: "foo",
          children: {
            path: "bar"
          }
        }),
        createRoute({
          path: "foo/bar"
        })
      ]);
      expect(branch1.score).toBeGreaterThan(branch2.score);
    });

    test("prioritize literal segments", () => {
      const branch1 = createBranch([
        createRoute({
          path: "foo",
          children: {
            path: "bar"
          }
        }),
        createRoute({
          path: "foo/bar"
        })
      ]);
      const branch2 = createBranch([
        createRoute({
          path: "foo",
          children: {
            path: ":id"
          }
        }),
        createRoute({
          path: "foo/:id"
        })
      ]);
      expect(branch1.score).toBeGreaterThan(branch2.score);
    });

    test("prioritize order", () => {
      const branch1 = createBranch(
        [
          createRoute({
            path: "foo",
            children: {
              path: "bar"
            }
          }),
          createRoute({
            path: "foo/bar"
          })
        ],
        0
      );
      const branch2 = createBranch(
        [
          createRoute({
            path: "foo",
            children: {
              path: "bar"
            }
          }),
          createRoute({
            path: "foo/bar"
          })
        ],
        1
      );
      expect(branch1.score).toBeGreaterThan(branch2.score);
    });

    test("deprioritize catch all /*", () => {
      const branch1 = createBranch([
        createRoute({
          path: "foo",
          children: {
            path: "bar"
          }
        }),
        createRoute({
          path: "foo/bar"
        })
      ]);
      const branch2 = createBranch([
        createRoute({
          path: "foo",
          children: {
            path: "bar/*"
          }
        }),
        createRoute({
          path: "foo/bar/*"
        })
      ]);
      expect(branch1.score).toBeGreaterThan(branch2.score);
    });

    describe("include a matcher function which should", () => {
      test("return each route's match", () => {
        const branch = createBranch([
          createRoute({
            path: "foo/:id",
            children: {
              path: "bar/:name"
            }
          }),
          createRoute({
            path: "foo/:id/bar/:name"
          })
        ]);
        const location = "/foo/123/bar/solid";
        const match = branch.matcher(location);
        expect(match).not.toBeNull();

        const matches = match!.map(({ params, path }) => ({
          params,
          path
        }));
        const expected = branch.routes.map(route => ({
          ...route.matcher(location)
        }));
        expect(matches).toEqual(expected);
      });

      test("short circuit if the final route doesn't match", () => {
        const branch = createBranch([
          createRoute({
            path: "foo/:id",
            children: {
              path: "bar/:name"
            }
          }),
          createRoute({
            path: "foo/:id/bar/:name"
          })
        ]);
        const spy = jest.spyOn(branch.routes[0], "matcher");
        const location = "/foo/123/bar";
        const match = branch.matcher(location);
        expect(match).toBeNull();
        expect(spy).not.toHaveBeenCalled();
      });
    });
  });
});

describe("createBranches should", () => {
  test(`produce depth-first enumeration of route definitions`, () => {
    const branches = createBranches({
      path: "root",
      children: [
        {
          path: "a1",
          children: [
            {
              path: "a2",
              children: [
                {
                  path: "a3"
                },
                {
                  path: "b3"
                }
              ]
            },
            {
              path: "b2",
              children: [
                {
                  path: "a3"
                },
                {
                  path: "b3"
                }
              ]
            },
            {
              path: "c2",
              children: [
                {
                  path: "a3"
                },
                {
                  path: "b3"
                }
              ]
            }
          ]
        },
        {
          path: "b1",
          children: [
            {
              path: "a2",
              children: [
                {
                  path: "a3"
                },
                {
                  path: "b3"
                }
              ]
            },
            {
              path: "b2",
              children: [
                {
                  path: "a3"
                },
                {
                  path: "b3"
                }
              ]
            },
            {
              path: "c2",
              children: [
                {
                  path: "a3"
                },
                {
                  path: "b3"
                }
              ]
            }
          ]
        }
      ]
    });

    const branchPaths = branches.map(b => b.routes[b.routes.length - 1].pattern);

    expect(branchPaths).toEqual([
      "/root/a1/a2/a3",
      "/root/a1/a2/b3",
      "/root/a1/b2/a3",
      "/root/a1/b2/b3",
      "/root/a1/c2/a3",
      "/root/a1/c2/b3",
      "/root/b1/a2/a3",
      "/root/b1/a2/b3",
      "/root/b1/b2/a3",
      "/root/b1/b2/b3",
      "/root/b1/c2/a3",
      "/root/b1/c2/b3"
    ]);
  });

  test(`order the routes by score descending`, () => {
    const branches = createBranches({
      path: "root",
      children: [
        {
          path: "/*"
        },
        {
          path: ":id"
        },
        {
          path: "foo",
          children: [
            {
              path: "bar"
            },
            {
              path: "bar/*"
            }
          ]
        },
        {
          path: "baz/qux"
        }
      ]
    });

    const branchPaths = branches.map(b => b.routes[b.routes.length - 1].pattern);
    const scores = branches.map(b => b.score);

    expect(branchPaths).toEqual([
      "/root/foo/bar",
      "/root/baz/qux",
      "/root/foo/bar/*",
      "/root/:id",
      "/root/*"
    ]);

    expect(scores[0]).toBeGreaterThan(scores[1]);
    expect(scores[1]).toBeGreaterThan(scores[2]);
    expect(scores[2]).toBeGreaterThan(scores[3]);
    expect(scores[3]).toBeGreaterThan(scores[4]);
  });
});
