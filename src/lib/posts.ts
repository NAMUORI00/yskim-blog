import { getCollection, type CollectionEntry } from "astro:content";
import { SITE } from "../config";
import { buildTaxonomy, categoryTags, categoryUrl, postUrl, slugifyTerm, tagUrl, UNCATEGORIZED_ID } from "./taxonomy.mjs";

export { categoryUrl, postUrl, slugifyTerm, tagUrl };

export type Post = CollectionEntry<"posts">;
export type Taxonomy = ReturnType<typeof buildTaxonomy>;

export async function getPublishedPosts(): Promise<Post[]> {
  const posts = await getCollection("posts", (p) => !p.data.draft);
  return posts.sort((a, b) => b.data.date.getTime() - a.data.date.getTime());
}

// One taxonomy per content snapshot: every page of a build shares it, and a
// changed collection (dev server) produces a new one.
let cached: { key: string; taxonomy: Taxonomy } | null = null;

export async function getTaxonomy(): Promise<Taxonomy> {
  const posts = await getPublishedPosts();
  const key = posts.map((post) => `${post.id}:${post.digest ?? ""}`).join("|");
  if (!cached || cached.key !== key) cached = { key, taxonomy: buildTaxonomy(posts, { siteUrl: SITE.url }) };
  return cached.taxonomy;
}

export type TaxonomyPost = Taxonomy["posts"][number];

export interface PostListItem {
  slug: string;
  url: string;
  title: string;
  date: Date;
  dateStr: string;
  summary: string;
  cover: string;
  category: { label: string; url: string | null } | null;
  tags: { label: string; url: string }[];
}

/** What a post row shows, resolved from the shared taxonomy. */
export function listItems(taxonomy: Taxonomy, posts: TaxonomyPost[] = taxonomy.posts): PostListItem[] {
  return posts.map((post) => {
    const category = post.categoryIds[0] === UNCATEGORIZED_ID ? null : taxonomy.categoryById.get(post.categoryIds[0]);
    return {
      slug: post.slug,
      url: post.url,
      title: post.title,
      date: post.date,
      dateStr: post.date.toISOString().slice(0, 10),
      summary: post.summary,
      cover: post.cover,
      category: category ? { label: category.label, url: category.url } : null,
      tags: post.tagIds.map((id) => taxonomy.tagById.get(id)).filter(Boolean).map((tag) => ({ label: tag!.label, url: tag!.url })),
    };
  });
}

type Facets = { label: string; items: { label: string; url: string | null; count: number }[] };

/** Archive header chips: every category with its post count. */
export function archiveFacets(taxonomy: Taxonomy): Facets {
  return { label: "카테고리", items: taxonomy.categories.map((category) => ({ label: category.label, url: category.url, count: category.count })) };
}

/** Category header chips: the topics its posts carry. */
export function categoryFacets(taxonomy: Taxonomy, categoryId: string): Facets {
  return { label: "주제", items: categoryTags(taxonomy, categoryId).map(({ tag, count }) => ({ label: tag.label, url: tag.url, count })) };
}

/** Tag header chips: the categories it appears in. */
export function tagFacets(taxonomy: Taxonomy, tagId: string): Facets {
  const tag = taxonomy.tagById.get(tagId);
  if (!tag) return { label: "카테고리", items: [] };
  const counts = new Map<string, number>();
  for (const slug of tag.posts) {
    for (const id of taxonomy.bySlug.get(slug)!.categoryIds) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return {
    label: "카테고리",
    items: [...counts]
      .map(([id, count]) => ({ category: taxonomy.categoryById.get(id)!, count }))
      .sort((a, b) => b.count - a.count || a.category.label.localeCompare(b.category.label, "ko"))
      .map(({ category, count }) => ({ label: category.label, url: category.url, count })),
  };
}

export async function getCategories(): Promise<{ name: string; count: number }[]> {
  const taxonomy = await getTaxonomy();
  return taxonomy.categories
    .filter((category) => category.id !== UNCATEGORIZED_ID)
    .map((category) => ({ name: category.label, count: category.count }));
}

export async function getTags(): Promise<string[]> {
  const taxonomy = await getTaxonomy();
  return taxonomy.tags.map((tag) => tag.label);
}
