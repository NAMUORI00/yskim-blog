import { getCollection } from "astro:content";
import { SITE } from "../config";
import { getGithubProfile } from "./site-data";

export interface ProfileLink {
  label: string;
  href: string;
  note: string;
}

export interface SiteProfile {
  name: string;
  handle: string;
  address: string;
  avatar: string;
  url: string;
  introTitle: string;
  bio: string;
  linksTitle: string;
  links: ProfileLink[];
}

const hostnameFor = (href: string) => {
  try {
    return new URL(href).hostname.replace(/^www\./, "");
  } catch {
    return href;
  }
};

/** Profile shown in the rail: the Notion `profile` and `links` pages, falling back to GitHub. */
export async function getSiteProfile(): Promise<SiteProfile> {
  const gh = getGithubProfile();
  const pages = await getCollection("pages", (page) => !page.data.draft);
  const findPage = (slug: string) => pages.find((page) => page.data.slug === slug);
  const profilePage = findPage("profile");
  const linksPage = findPage("links");
  const notionLinks = linksPage?.data.links || [];
  const fallbackLinks = [
    { label: "Portfolio", href: SITE.portfolio, note: "" },
    { label: "GitHub", href: gh.html_url, note: "" },
  ];
  return {
    name: profilePage?.data.profile_name || gh.name,
    handle: (profilePage?.data.profile_handle || SITE.handle).replace(/^@+/, ""),
    address: profilePage?.data.profile_address || SITE.location,
    avatar: profilePage?.data.profile_avatar || gh.avatar_url,
    url: profilePage?.data.profile_url || gh.html_url,
    introTitle: profilePage?.data.title || "",
    bio: profilePage?.data.summary || gh.bio,
    linksTitle: linksPage?.data.title || "Links",
    links: (notionLinks.length > 0 ? notionLinks : fallbackLinks)
      .filter((link) => link.href)
      .map((link) => ({ label: link.label, href: link.href, note: link.note || hostnameFor(link.href) })),
  };
}
