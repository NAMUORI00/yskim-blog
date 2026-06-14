import { getCollection, type CollectionEntry } from "astro:content";

export type Post = CollectionEntry<"posts">;

export async function getPublishedPosts(): Promise<Post[]> {
  const posts = await getCollection("posts", (p) => !p.data.draft);
  return posts.sort((a, b) => b.data.date.getTime() - a.data.date.getTime());
}

export function postUrl(slug: string): string {
  return `/posts/${slug}/`;
}

export function slugifyTerm(name: string): string {
  return name.toLowerCase().replace(/\s+/g, "-");
}

export function categoryUrl(name: string): string {
  return `/categories/${slugifyTerm(name)}/`;
}

export function tagUrl(name: string): string {
  return `/tags/${slugifyTerm(name)}/`;
}

export async function getCategories(): Promise<{ name: string; count: number }[]> {
  const posts = await getPublishedPosts();
  const map = new Map<string, number>();
  for (const post of posts) {
    for (const category of post.data.categories) {
      map.set(category, (map.get(category) ?? 0) + 1);
    }
  }
  return [...map.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => a.name.localeCompare(b.name, "ko"));
}

export async function getTags(): Promise<string[]> {
  const posts = await getPublishedPosts();
  const set = new Set<string>();
  for (const post of posts) {
    for (const tag of post.data.tags) {
      set.add(tag);
    }
  }
  return [...set].sort((a, b) => a.localeCompare(b, "ko"));
}
