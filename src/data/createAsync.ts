/**
 * This is mock of the eventual Solid 2.0 primitive. It is not fully featured.
 */

import { Accessor, createResource } from "solid-js";

export function createAsync<T>(fn: () => Promise<T>): Accessor<T> {
  const [resource] = createResource(() => fn(), v => v);
  return () => resource() as T;
}