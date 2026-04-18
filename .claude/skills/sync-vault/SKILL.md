---
name: sync-vault
description: Sync published Markdown notes from the user's Obsidian vault ($OBSIDIAN_VAULT, default ~/Documents/Obsidian) into src/content/ for this Astro site. Use when the user asks to "sync vault", "pull notes", "vault 싱크", "옵시디언 동기화", "ingest", "sync from obsidian" — or after they say they added/updated notes in Obsidian and want to preview on the site. Do NOT use for direct edits to src/content/ files.
---

# Sync from Obsidian vault

This site pulls content from a read-only Obsidian vault. The user keeps their
personal knowledge base there and publishes selected notes to this site.

## Steps

1. **Check dev server.** The user always wants `http://localhost:4321` reachable.
   ```bash
   lsof -nP -iTCP:4321 | grep LISTEN || true
   ```
   If nothing is listening, run `pnpm dev` with `run_in_background: true` before
   or after sync — either works, but never leave it down.

2. **Run the sync.**
   ```bash
   pnpm sync
   ```
   The script (`scripts/sync-from-vault.ts`) walks `$OBSIDIAN_VAULT` (default
   `~/Documents/Obsidian`), picks files with `collection: <name>` and
   `published: true` in their frontmatter, and copies them into
   `src/content/<collection>/<slug>.md` with a `synced-from-vault: true` marker.

3. **Report.** Parse the command output (`+ blog/slug.md`, `+ projects/...`) and
   tell the user exactly what landed or was removed. If an image failed
   (`! image not found: ...`), surface that — it usually means the file lives
   under a non-default attachments folder.

4. **Verify the build is still green.**
   ```bash
   pnpm build
   ```
   If it fails, the most common cause is a vault note whose frontmatter doesn't
   match the collection's zod schema. Show the user the offending file and
   field. Do NOT edit vault files directly — the vault is read-only source;
   instruct the user to fix the frontmatter in Obsidian.

## Important constraints

- **Vault is read-only.** Never write into `$OBSIDIAN_VAULT`. If the user asks
  you to fix a vault note, tell them to edit it in Obsidian and re-sync.
- **Don't touch hand-authored files.** Files in `src/content/` without the
  `synced-from-vault: true` frontmatter marker are authored directly in the
  repo. The sync script leaves them alone; you should too.
- **Collection routing is mandatory.** A vault note must declare
  `collection: blog|projects|experience|resume|about|learnings`. If the user
  says "it's not showing up," first ask/check if `collection` and
  `published: true` are set.
- **Slug determination order:** `frontmatter.slug` → slugified `title` →
  filename. Surface the resulting slug to the user when reporting.

## Common failure modes

| Symptom | Likely cause |
|---|---|
| Note missing from site | `published: true` not set, or `collection:` missing/typo'd |
| Build fails with zod error | Frontmatter field type mismatch (e.g. `pubDate` not parseable, `category` not in enum, empty string for a URL field) |
| Image broken on site | Image not in vault root / `attachments/` / `assets/` — ask user for the exact path |
| Wikilink renders as plain text | Target note doesn't have `published: true` or `collection:`, so it's not in the wikilink index |

## After a successful sync

Ask the user whether they want to:
- preview specific pages, or
- commit the synced files (if the repo is git-tracked).

Do not auto-commit.
