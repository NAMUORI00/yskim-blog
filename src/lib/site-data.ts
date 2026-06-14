import { readFileSync } from "node:fs";
import { join } from "node:path";

export interface GithubProfile {
  login: string;
  name: string;
  bio: string;
  avatar_url: string;
  html_url: string;
}

const FALLBACK: GithubProfile = {
  login: "NAMUORI00",
  name: "NAMUORI00",
  bio: "",
  avatar_url: "https://github.com/NAMUORI00.png",
  html_url: "https://github.com/NAMUORI00",
};

function parseFlatYaml(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (match) {
      out[match[1]] = match[2].replace(/^["']|["']$/g, "").trim();
    }
  }
  return out;
}

export function getGithubProfile(): GithubProfile {
  try {
    // Resolve from the project root (stable during `astro build`), since
    // import.meta.url points into the bundled output at build time.
    const path = join(process.cwd(), "data", "github.yaml");
    const data = parseFlatYaml(readFileSync(path, "utf8"));
    return {
      login: data.login || FALLBACK.login,
      name: data.name || data.login || FALLBACK.name,
      bio: data.bio || "",
      avatar_url: data.avatar_url || FALLBACK.avatar_url,
      html_url: data.html_url || FALLBACK.html_url,
    };
  } catch {
    return FALLBACK;
  }
}
