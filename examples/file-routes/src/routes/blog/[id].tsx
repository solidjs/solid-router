import {
  createAsync,
  query,
  useParams,
  type RouteDefinition
} from "@solidjs/router";

const getPost = query(async (id: string) => {
  // stands in for a real fetch
  await new Promise(resolve => setTimeout(resolve, 100));
  return { title: `Post #${id}`, body: `This is post number ${id}.` };
}, "post");

// The `route` export is picked into the main bundle and starts the fetch
// during navigation, before this component's code-split chunk loads.
export const route = {
  preload: ({ params }) => getPost(params.id!)
} satisfies RouteDefinition<"/blog/:id">;

export default function Post() {
  const params = useParams<{ id: string }>();
  const post = createAsync(() => getPost(params.id));
  return (
    <article>
      <h2>{post()?.title}</h2>
      <p>{post()?.body}</p>
    </article>
  );
}
