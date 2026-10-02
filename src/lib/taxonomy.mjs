// Published-post taxonomy shared by routes, lists, related posts, and the
// knowledge map. Everything here is derived from post frontmatter and Markdown
// bodies, so Notion posts stay the only content that needs maintenance.

export const UNCATEGORIZED_ID = "__uncategorized";
export const UNCATEGORIZED_LABEL = "분류 없음";
export const POSTS_PER_PAGE = 5;

const collator = new Intl.Collator("ko");

export function slugifyTerm(name) {
  return String(name ?? "").trim().toLowerCase().replace(/\s+/g, "-");
}

export function postUrl(slug) {
  return `/posts/${slug}/`;
}

export function categoryUrl(name) {
  return `/categories/${slugifyTerm(name)}/`;
}

export function tagUrl(name) {
  return `/tags/${slugifyTerm(name)}/`;
}

/** Trim, drop empty values, and merge case/whitespace variants that share a URL. */
export function cleanTerms(values) {
  const seen = new Map();
  for (const value of Array.isArray(values) ? values : []) {
    const label = String(value ?? "").trim().replace(/\s+/g, " ");
    const slug = slugifyTerm(label);
    if (slug && !seen.has(slug)) seen.set(slug, label);
  }
  return [...seen].map(([slug, label]) => ({ slug, label }));
}

export function compactNotionId(value) {
  const id = String(value ?? "").replace(/-/g, "").toLowerCase();
  return /^[0-9a-f]{32}$/.test(id) ? id : "";
}

function toDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? new Date(0) : date;
}

function entryData(entry) {
  return entry?.data ?? entry ?? {};
}

export function isPublished(entry) {
  const data = entryData(entry);
  return Boolean(data.slug) && data.draft !== true;
}

export function byDateDesc(a, b) {
  return toDate(entryData(b).date).getTime() - toDate(entryData(a).date).getTime();
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function siteHost(siteUrl) {
  try {
    return siteUrl ? new URL(siteUrl).host.replace(/^www\./, "") : "";
  } catch {
    return "";
  }
}

/**
 * Links from a Markdown body to other posts: `/posts/<slug>/` links (relative or
 * on this site) and Notion page links whose id belongs to a published post.
 */
export function extractPostLinks(body, { slugs, notionIds = new Map(), siteUrl = "" } = {}) {
  const text = String(body ?? "");
  const found = new Set();
  const host = siteHost(siteUrl);
  const origin = host ? `(?:https?:\\/\\/(?:www\\.)?${escapeRegExp(host)})?` : "";
  const postLink = new RegExp(`(?:\\]\\(\\s*<?|href=["']|<|\\]:\\s*)${origin}\\/posts\\/([^/\\s)"'#?<>]+)`, "g");
  for (const match of text.matchAll(postLink)) {
    const slug = safeDecode(match[1]);
    if (slugs?.has(slug)) found.add(slug);
  }
  const notionLink = /https?:\/\/(?:www\.)?(?:notion\.so|[a-z0-9-]+\.notion\.site|app\.notion\.com)\/[^\s)"'<>]*/gi;
  for (const match of text.matchAll(notionLink)) {
    const ids = match[0].toLowerCase().match(/[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}/g) ?? [];
    for (const raw of ids) {
      const slug = notionIds.get(raw.replace(/-/g, ""));
      if (slug) found.add(slug);
    }
  }
  return [...found];
}

/**
 * Build the taxonomy from content entries (Astro collection entries or plain
 * frontmatter objects). Drafts are removed here as well as in the collection
 * query so every consumer sees the same published set. Names that collapse to
 * the same URL slug are one category/tag; the label of the newest post wins,
 * matching the route that serves that slug.
 */
export function buildTaxonomy(entries, { siteUrl = "" } = {}) {
  const published = (Array.isArray(entries) ? entries : []).filter(isPublished).sort(byDateDesc);
  const posts = [];
  const bySlug = new Map();
  const categoryMap = new Map();
  const tagMap = new Map();

  for (const entry of published) {
    const data = entryData(entry);
    if (bySlug.has(data.slug)) continue;
    const categories = cleanTerms(data.categories);
    const tags = cleanTerms(data.tags);
    const post = {
      slug: data.slug,
      title: String(data.title ?? data.slug),
      date: toDate(data.date),
      summary: String(data.summary ?? ""),
      cover: String(data.cover ?? ""),
      url: postUrl(data.slug),
      categoryIds: categories.length ? categories.map((item) => item.slug) : [UNCATEGORIZED_ID],
      tagIds: tags.map((item) => item.slug),
      notionId: compactNotionId(data.notion_id),
      body: typeof entry?.body === "string" ? entry.body : "",
      order: posts.length,
    };
    posts.push(post);
    bySlug.set(post.slug, post);

    if (!categories.length && !categoryMap.has(UNCATEGORIZED_ID)) {
      categoryMap.set(UNCATEGORIZED_ID, { id: UNCATEGORIZED_ID, slug: "", label: UNCATEGORIZED_LABEL, url: null, uncategorized: true, posts: [] });
    }
    for (const item of categories) {
      if (!categoryMap.has(item.slug)) categoryMap.set(item.slug, { id: item.slug, slug: item.slug, label: item.label, url: categoryUrl(item.label), posts: [] });
    }
    for (const id of post.categoryIds) categoryMap.get(id).posts.push(post.slug);
    for (const item of tags) {
      if (!tagMap.has(item.slug)) tagMap.set(item.slug, { id: item.slug, slug: item.slug, label: item.label, url: tagUrl(item.label), posts: [] });
      tagMap.get(item.slug).posts.push(post.slug);
    }
  }

  const summarize = (group) => ({ ...group, count: group.posts.length, latest: bySlug.get(group.posts[0])?.date ?? null });
  const categories = [...categoryMap.values()]
    .map(summarize)
    .sort((a, b) => Number(Boolean(a.uncategorized)) - Number(Boolean(b.uncategorized)) || collator.compare(a.label, b.label));
  const tags = [...tagMap.values()]
    .map((tag) => {
      const categoryIds = [];
      for (const slug of tag.posts) {
        for (const id of bySlug.get(slug).categoryIds) if (!categoryIds.includes(id)) categoryIds.push(id);
      }
      return { ...summarize(tag), categoryIds };
    })
    .sort((a, b) => collator.compare(a.label, b.label));

  const slugs = new Set(bySlug.keys());
  const notionIds = new Map(posts.filter((post) => post.notionId).map((post) => [post.notionId, post.slug]));
  const links = [];
  const linksFrom = new Map(posts.map((post) => [post.slug, []]));
  const linksTo = new Map(posts.map((post) => [post.slug, []]));
  for (const post of posts) {
    for (const target of extractPostLinks(post.body, { slugs, notionIds, siteUrl })) {
      if (target === post.slug) continue;
      links.push({ source: post.slug, target });
      linksFrom.get(post.slug).push(target);
      linksTo.get(target).push(post.slug);
    }
  }

  return {
    posts,
    bySlug,
    categories,
    categoryById: new Map(categories.map((item) => [item.id, item])),
    tags,
    tagById: new Map(tags.map((item) => [item.id, item])),
    links,
    linksFrom,
    linksTo,
  };
}

/** Tags used by the posts of one category, most used first. */
export function categoryTags(taxonomy, categoryId) {
  const category = taxonomy.categoryById.get(categoryId);
  if (!category) return [];
  const counts = new Map();
  for (const slug of category.posts) {
    for (const id of taxonomy.bySlug.get(slug).tagIds) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return [...counts]
    .map(([id, count]) => ({ tag: taxonomy.tagById.get(id), count }))
    .sort((a, b) => b.count - a.count || collator.compare(a.tag.label, b.tag.label));
}

/**
 * Posts that share tags, the category, or a body link with `slug`. The score is
 * only an ordering; readers see the reasons, never the number.
 */
export function relatedPosts(taxonomy, slug, { limit = 4 } = {}) {
  const post = taxonomy.bySlug.get(slug);
  if (!post) return [];
  const tags = new Set(post.tagIds);
  const categories = new Set(post.categoryIds.filter((id) => id !== UNCATEGORIZED_ID));
  const linkedTo = new Set(taxonomy.linksFrom.get(slug) ?? []);
  const linkedFrom = new Set(taxonomy.linksTo.get(slug) ?? []);
  return taxonomy.posts
    .filter((other) => other.slug !== slug)
    .map((other) => {
      const sharedTags = other.tagIds.filter((id) => tags.has(id)).map((id) => taxonomy.tagById.get(id));
      const sameCategory = other.categoryIds.some((id) => categories.has(id));
      const linked = linkedTo.has(other.slug) && linkedFrom.has(other.slug) ? "both" : linkedTo.has(other.slug) ? "to" : linkedFrom.has(other.slug) ? "from" : null;
      const score = sharedTags.length * 3 + (sameCategory ? 2 : 0) + (linked ? 4 : 0);
      return { post: other, sharedTags, sameCategory, linked, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.post.order - b.post.order)
    .slice(0, Math.max(0, limit));
}

/** Newer and older neighbours in publishing order. */
export function adjacentPosts(taxonomy, slug) {
  const index = taxonomy.posts.findIndex((post) => post.slug === slug);
  if (index < 0) return { newer: null, older: null };
  return { newer: taxonomy.posts[index - 1] ?? null, older: taxonomy.posts[index + 1] ?? null };
}

/** Split a list into pages; an empty list still has one (empty) page. */
export function paginate(items, pageSize = POSTS_PER_PAGE) {
  const size = Math.max(1, Math.floor(pageSize));
  const pages = [];
  for (let index = 0; index < items.length; index += size) pages.push(items.slice(index, index + size));
  return pages.length ? pages : [[]];
}

/** `/posts/` → page 1, `/posts/page/2/` → page 2 (single-segment post URLs stay free). */
export function pageHref(base, page) {
  return page <= 1 ? base : `${base}page/${page}/`;
}
