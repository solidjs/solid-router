import type { ParentProps } from "solid-js";

// `blog.tsx` is the layout for everything under `blog/`.
export default function BlogLayout(props: ParentProps) {
  return (
    <section>
      <h1>Blog</h1>
      {props.children}
    </section>
  );
}
