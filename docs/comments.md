# Comments

Post pages support two comment modes. The Astro components render only providers that are configured, so the public site will not show a broken comment box while external settings are missing.

## GitHub-style comments

Use Giscus when comments should feel like GitHub. GitHub Discussions are enabled for this repository, and `src/config.ts` is configured to use the `General` category.

To change the category later, get the new Giscus `repoId`, `category`, and `categoryId`, then update `src/config.ts`:

```ts
export const SITE = {
  // ...
  giscus: {
    repo: "NAMUORI00/yskim-blog",
    repoId: "R_kgDOSz9RGA",
    category: "General",
    categoryId: "DIC_kwDOSz9RGM4C-vLv",
    mapping: "pathname",
  },
};
```

The theme toggle sends light and dark theme updates to the Giscus frame.
Giscus reactions stay disabled so the comment iframe remains focused on
authenticated GitHub comments.

## Anonymous comments

> ℹ️ Status: the Astro `Comments` component currently renders **Giscus only**.
> The anonymous-comment Pages Functions, D1 schema, and admin page below are
> ready in the repo but the front-end form is not yet wired into the Astro
> component. Add it to `src/components/Comments.astro` when enabling this mode.
> Field names that used to live in `hugo.yaml` now belong in `src/config.ts`.

Use the Cloudflare mode when comments should support anonymous visitors with CAPTCHA protection:

1. Authenticate Wrangler with `npx wrangler login`, or set `CLOUDFLARE_API_TOKEN` in non-interactive environments.
2. Create a Turnstile widget in Cloudflare.
3. Run `scripts/setup-cloudflare-comments.ps1`.
4. Commit the generated `wrangler.toml` and the updated `src/config.ts`.
5. Let GitHub and Cloudflare deploy the change.

Example:

```powershell
.\scripts\setup-cloudflare-comments.ps1 `
  -TurnstileSiteKey "<public-site-key>" `
  -TurnstileSecretKey "<secret-key>" `
  -AdminToken "<long-random-admin-token>"
```

The script will:

- Create or reuse the `yskim_blog_comments` D1 database.
- Apply `schema/comments.sql`.
- Write `wrangler.toml` with the `COMMENTS_DB` binding.
- Store `TURNSTILE_SECRET_KEY` and `COMMENTS_ADMIN_TOKEN` as Pages secrets.
- Enable the anonymous comment config in `src/config.ts` when a Turnstile site key is supplied.

Manual setup is also possible:

1. Create a D1 database.
2. Apply `schema/comments.sql` to the database.
3. Bind the database to the Pages project as `COMMENTS_DB`.
4. Create a Turnstile widget and put its public site key in `src/config.ts`.
5. Add the encrypted secret `TURNSTILE_SECRET_KEY` to the Pages project.
6. Add the encrypted secret `COMMENTS_ADMIN_TOKEN` to protect moderation.
7. Keep `COMMENTS_AUTO_APPROVE` unset or `false` unless immediate public comments are intended.
8. Wire the anonymous comment form into `src/components/Comments.astro` and enable it in `src/config.ts`.

The public API is:

- `GET /api/comments?path=/posts/example/`: returns approved comments for a page.
- `POST /api/comments`: validates Turnstile and stores a pending comment.

The moderation API is:

- `GET /api/comments/moderate?status=pending`
- `POST /api/comments/moderate` with `{ "id": "...", "action": "approve" }`
- `POST /api/comments/moderate` with `{ "id": "...", "action": "reject" }`

The browser moderation page is available at `/admin/comments.html`. It is intentionally not linked from the blog UI, has `noindex,nofollow`, and still requires `COMMENTS_ADMIN_TOKEN` because all moderation requests go through the protected API.

Moderation requests must include:

```text
Authorization: Bearer <COMMENTS_ADMIN_TOKEN>
```

Anonymous comments default to review-before-publish.
