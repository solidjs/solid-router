---
"@solidjs/router": minor
---

Typed, parsed search params. Passing a paths node to `useSearchParams(paths.search)` opts into Standard Schema parsing: the schemas of the currently matched routes run root→leaf over the raw query and their outputs merge over it, so reads return the schema's output type (defaults applied, values coerced) and the setter is typed by the schema's input. A schema that reports issues is skipped, leaving raw values — search strings are user input, so defaults belong in the schema. Zero-arg `useSearchParams()` keeps today's raw string-valued behavior. Async schema validation throws.
