import {
  createRouter,
  defineRoutes,
  int,
  useNavigate,
  useParams,
  useSearchParams
} from "../src/index.js";
import type { StandardSchemaV1 } from "../src/index.js";

describe("Type checking the typed path proxy", () => {
  test("Does not check implementations", () => {});

  // Everything below is type-only: the closure is never invoked.
  () => {
    // A minimal Standard Schema instance for search typing (shape-only; never validated here)
    const searchSchema = {} as StandardSchemaV1<{ q?: string; page?: number }>;

    const Router = createRouter({
      routes: [
        { path: "/" },
        { path: "/about" },
        { path: "/search", search: searchSchema },
        {
          path: "/users/:id",
          matchFilters: { id: int },
          children: [{ path: "/" }, { path: "/settings" }]
        },
        { path: "/files/*rest" },
        { path: "/docs/:section?" }
      ]
    });
    const { paths } = Router;

    // Terminators produce strings
    const _root: string = paths();
    const _about: string = paths.about();
    const _aboutSearch: string = paths.about({ q: "hi" }, "hash");
    const _user: string = paths.users(2, { tab: "x" }, "comments");
    const _settings: string = paths.users(2).settings();
    const _files: string = paths.files("deep/path")();
    const _docs: string = paths.docs("guide")();
    const _docsSkipped: string = paths.docs();

    // Params are typed from matchFilters
    paths.users(2);
    // @ts-expect-error id is numeric (int filter)
    paths.users("abc");
    // @ts-expect-error id param is required
    paths.users().settings;

    // Only declared segments exist
    // @ts-expect-error no such route segment
    paths.missing;
    // @ts-expect-error settings hangs off a bound user, not the users node
    paths.users.settings;

    // Search params are typed by the route's Standard Schema
    paths.search({ q: "solid", page: 2 });
    // @ts-expect-error page is a number
    paths.search({ page: "2" });

    // useSearchParams reads the schema's output and writes its input
    const [search, setSearch] = useSearchParams(paths.search);
    const _page: number | undefined = search.page;
    // @ts-expect-error no such search param
    search.missing;
    setSearch({ page: 2 });
    // @ts-expect-error page is a number
    setSearch({ page: "2" });

    // untyped reads keep today's raw string-valued behavior
    const [rawSearch] = useSearchParams();
    const _raw: string | string[] | undefined = rawSearch.anything;

    // Hooks accept paths nodes
    const navigate = useNavigate();
    navigate(paths.users(2), { replace: true });
    navigate(paths.about);
    navigate("/plain/strings/still/work");
    navigate(-1);

    const params = useParams(paths.users);
    const _id: string = params.id;
    // @ts-expect-error no such param on this route
    params.missing;

    const settingsParams = useParams(paths.users(2).settings);
    const _idFromLeaf: string = settingsParams.id;

    // Untyped trees fall back to a loose proxy
    const Loose = createRouter({ routes: [{ path: "/a" }] as { path: string }[] });
    const _anything: string = String(Loose.paths.whatever.deeply.nested);

    // defineRoutes preserves literals for extracted route trees — no `as const`
    const extracted = defineRoutes([
      { path: "/about" },
      { path: "/users/:id", matchFilters: { id: int } }
    ]);
    const Extracted = createRouter({ routes: extracted });
    const _extractedAbout: string = Extracted.paths.about();
    Extracted.paths.users(2);
    // @ts-expect-error id is numeric (int filter survives extraction)
    Extracted.paths.users("abc");
    // @ts-expect-error no such route segment
    Extracted.paths.missing;
  };
});
