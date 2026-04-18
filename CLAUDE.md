# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm sync     # pull published notes from $OBSIDIAN_VAULT into src/content/
pnpm dev      # dev server on :4321 (shows ALL notes, published or not)
pnpm build    # production build (published: true only)
pnpm preview  # serve the built dist/
```

- **Always keep `pnpm dev` alive** on :4321 during a session — the user expects to hit the site at any time. If you run `pnpm build` or anything that can kill it, confirm with `lsof -nP -iTCP:4321` and restart if down.
- `pnpm astro check` requires `@astrojs/check` install prompt — prefer `pnpm build` for verification.

## Environment

- `OBSIDIAN_VAULT` (default: `~/Documents/Obsidian`) — read-only source directory.
- Vault files with both `collection: <name>` and `published: true` in frontmatter are copied by `scripts/sync-from-vault.ts`. Others are ignored.

## Architecture

### Content flow (vault → site)

```
Obsidian vault (.md with frontmatter)
        │    pnpm sync
        ▼
src/content/<collection>/<slug>.md   (+ "synced-from-vault: true" marker)
        │    build/dev
        ▼
Static pages under /blog, /projects, /resume, /learnings, /about
```

- The sync script soft-deletes previously synced files (identified by the `synced-from-vault: true` marker) each run, so unpublished notes disappear. Hand-authored files without that marker survive.
- Wikilinks `[[Target]]` / `[[collection/Target|alias]]` are rewritten to `/collection/slug`. `![[img.png]]` and relative image paths are copied into `/public/assets/<collection>/<slug>/`.

### Content collections (6)

Defined in `src/content/config.ts`. All have `published: boolean (default false)`.

| Collection | Key fields |
|---|---|
| `blog` | `category` (enum `BLOG_CATEGORIES`), free-form `tags` |
| `projects` | `tracks: (hardware|software|both)[]`, `stack`, `repo?`, `demo?`, `featured` |
| `experience` | `perspectives.{hardware,software}` — both optional — composed into resume tracks |
| `resume` | `track: main|hardware|software`, `experience: reference[]`, `projects: reference[]` |
| `about`, `learnings` | simple |

Enum constants (`BLOG_CATEGORIES`, `RESUME_TRACKS`, `PROJECT_TRACKS`) are exported from `config.ts` and used for static path generation.

### Dev vs Prod filtering

`src/lib/content.ts` is the single access point for content. `getPublished()` returns everything in dev, only `published: true` in prod (`import.meta.env.PROD`). Pages must use these helpers — never call `getCollection()` directly, or the published filter will be bypassed.

### Page surface

Every collection that has a `[slug].astro` (or `[...slug].astro`) detail page MUST also have a list page — and **every collection whose items are linked to from other pages MUST have a detail page**. Previously the projects collection had only a list page, which caused cards to link nowhere. When adding a new collection, scaffold both list and detail, and link through `src/lib/content.ts` helpers.

Dynamic routes:
- `/blog/[...slug]`, `/blog/category/[category]`, `/blog/tag/[tag]`
- `/projects/[...slug]`
- `/learnings/[...slug]`
- `/resume/[track]`

Resume composes structured data: experience+projects references are resolved via `getEntries`, and the track-specific perspective (hardware/software) is picked for each experience block inside `src/pages/resume/[track].astro`.

## Pinned dependencies

- `@astrojs/sitemap@3.2.1` — must stay pinned. 3.5+ uses Astro 5's `astro:routes:resolved` hook and crashes with `_routes.reduce undefined` on Astro 4. If you see that error, verify this pin hasn't drifted.

## Conventions observed in this repo

- User prefers terse responses, minimal trailing summaries. Working-directory prompts: confirm scope, then act.
- Never auto-rewrite the user's essays/blog bodies beyond fixing obvious typos. For deeper edits, surface as suggestions and let the user decide. When a post needs a time-gap update (e.g., a 2021 post that should reference 2026 reality), insert a `> [2026 update: TODO]` placeholder rather than writing in the user's voice.
- Blog posts migrated from external platforms (velog, tistory) should note the original URL if their body was reformatted during ingest.
- When adding new blog posts, they must go under a `category` that exists in `BLOG_CATEGORIES`. Tags are free-form.
- Resume frontmatter references (`experience: [slug]`, `projects: [slug]`) use the target file's slug, not the title.

## Common pitfalls

- **Empty-string URL fields** fail zod `.url()` validation. Omit the field entirely instead of setting `repo: ""`.
- **Obsidian attachment paths**: vault images may live in `attachments/`, `assets/`, or inline. The sync script tries those fallbacks before giving up.
- **Wikilink resolution** is title-based + filename-based (lowercased). Unresolved links render as the alias text, not a dead link.
