import { A } from "@solidjs/router";
import { For } from "solid-js";

export default function BlogIndex() {
  return (
    <ul>
      <For each={[1, 2, 3]}>
        {id => (
          <li>
            <A href={`/blog/${id}`}>Post #{id}</A>
          </li>
        )}
      </For>
    </ul>
  );
}
