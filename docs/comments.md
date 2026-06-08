# Comments

Post pages support two comment modes. The Hugo templates render only providers that are configured, so the public site will not show a broken comment box while external settings are missing.

## GitHub-style comments

Use Giscus when comments should feel like GitHub. GitHub Discussions are enabled for this repository, and `hugo.yaml` is configured to use the `General` category.

To change the category later, get the new Giscus `repoId`, `category`, and `categoryId`, then update `hugo.yaml`:

```yaml
params:
  comments:
    enabled: true
    giscus:
      enabled: true
      repo: NAMUORI00/yskim-blog
      repoId: R_kgDOSz9RGA
      category: Blog Comments
      categoryId: replace-with-giscus-category-id
      mapping: pathname
```

The theme toggle sends light and dark theme updates to the Giscus frame.

## Anonymous comments

Use the Cloudflare mode when comments should support anonymous visitors with CAPTCHA protection:

1. Create a D1 database.
2. Apply `schema/comments.sql` to the database.
3. Bind the database to the Pages project as `COMMENTS_DB`.
4. Create a Turnstile widget and put its public site key in `hugo.yaml`.
5. Add the encrypted secret `TURNSTILE_SECRET_KEY` to the Pages project.
6. Add the encrypted secret `COMMENTS_ADMIN_TOKEN` to protect moderation.
7. Keep `COMMENTS_AUTO_APPROVE` unset or `false` unless immediate public comments are intended.
8. Set `params.comments.anonymous.enabled` to `true`.

The public API is:

- `GET /api/comments?path=/posts/example/`: returns approved comments for a page.
- `POST /api/comments`: validates Turnstile and stores a pending comment.

The moderation API is:

- `GET /api/comments/moderate?status=pending`
- `POST /api/comments/moderate` with `{ "id": "...", "action": "approve" }`
- `POST /api/comments/moderate` with `{ "id": "...", "action": "reject" }`

Moderation requests must include:

```text
Authorization: Bearer <COMMENTS_ADMIN_TOKEN>
```

Anonymous comments default to review-before-publish.
