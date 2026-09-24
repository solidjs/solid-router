// `filesystem-routing/flags`: scan facts the file-routes plugin folds to
// literals in builds (the shipped module says `true`). Declared here so the
// fs adapter typechecks without a type-level dependency on the package — the
// import is runtime-only and resolves in the consumer's bundle.
declare module "filesystem-routing/flags" {
  /** `true` when some page's component is a `"use server"` function. */
  export const serverRoutes: boolean;
}
