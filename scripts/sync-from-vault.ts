#!/usr/bin/env tsx
/**
 * Sync published Markdown notes from an Obsidian vault into src/content/.
 *
 * Source:  $OBSIDIAN_VAULT  (default: ~/Documents/Obsidian)
 * Target:  <repo>/src/content/<collection>/...
 *
 * Routing: each note's frontmatter must declare `collection: blog|projects|experience|resume|about|learnings`.
 * Only files with `published: true` are synced (a soft-delete on the target side removes previously-synced files
 * that no longer qualify).
 *
 * Transforms:
 *  - Wikilinks: [[Note Title]] / [[Note Title|alias]]  →  [alias](/blog/slug-of-note-title)
 *    If the link is prefixed with a known collection (e.g. [[projects/foo]]), the link is routed to that collection.
 *  - Embedded images: ![[image.png]] and ![alt](path/to/image.png) → copied to /public/assets/<collection>/<slug>/
 *    and rewritten to /assets/<collection>/<slug>/<basename>.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import matter from "gray-matter";

const VAULT = process.env.OBSIDIAN_VAULT
  ? path.resolve(process.env.OBSIDIAN_VAULT.replace(/^~/, os.homedir()))
  : path.join(os.homedir(), "Documents", "Obsidian");

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const CONTENT_DIR = path.join(REPO, "src", "content");
const ASSETS_DIR = path.join(REPO, "public", "assets");

const COLLECTIONS = ["blog", "projects", "experience", "resume", "about", "learnings"] as const;
type Collection = (typeof COLLECTIONS)[number];

const IMAGE_EXT = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".avif"]);

type SourceNote = {
  absPath: string;
  collection: Collection;
  slug: string;
  frontmatter: Record<string, unknown>;
  body: string;
};

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

async function walk(dir: string): Promise<string[]> {
  const out: string[] = [];
  let entries: import("node:fs").Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (e.name.startsWith(".")) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(full)));
    else if (e.isFile() && e.name.endsWith(".md")) out.push(full);
  }
  return out;
}

async function collectSourceNotes(): Promise<SourceNote[]> {
  const files = await walk(VAULT);
  const notes: SourceNote[] = [];
  for (const absPath of files) {
    const raw = await fs.readFile(absPath, "utf8");
    let parsed: matter.GrayMatterFile<string>;
    try {
      parsed = matter(raw);
    } catch {
      continue;
    }
    const fm = parsed.data ?? {};
    if (fm.published !== true) continue;
    const collection = fm.collection as Collection | undefined;
    if (!collection || !COLLECTIONS.includes(collection)) continue;
    const slug =
      (fm.slug as string | undefined) ??
      slugify((fm.title as string | undefined) ?? path.basename(absPath, ".md"));
    notes.push({ absPath, collection, slug, frontmatter: fm, body: parsed.content });
  }
  return notes;
}

function buildWikilinkIndex(notes: SourceNote[]) {
  const index = new Map<string, { collection: Collection; slug: string }>();
  for (const n of notes) {
    const title = (n.frontmatter.title as string | undefined) ?? path.basename(n.absPath, ".md");
    const key = title.toLowerCase();
    if (!index.has(key)) index.set(key, { collection: n.collection, slug: n.slug });
    const fileKey = path.basename(n.absPath, ".md").toLowerCase();
    if (!index.has(fileKey)) index.set(fileKey, { collection: n.collection, slug: n.slug });
  }
  return index;
}

function transformBody(
  body: string,
  note: SourceNote,
  wikiIndex: Map<string, { collection: Collection; slug: string }>,
  imageCopies: Map<string, string>
): string {
  let out = body;

  // Embedded images: ![[image.png|alt]]
  out = out.replace(/!\[\[([^\]]+)\]\]/g, (_m, inner: string) => {
    const [target, alt] = inner.split("|").map((s) => s.trim());
    const ext = path.extname(target).toLowerCase();
    if (!IMAGE_EXT.has(ext)) return `[[${inner}]]`;
    const basename = path.basename(target);
    const publicRel = path.posix.join("/assets", note.collection, note.slug, basename);
    imageCopies.set(basename, publicRel);
    return `![${alt ?? basename}](${publicRel})`;
  });

  // Standard markdown images: ![alt](path)
  out = out.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (m, alt: string, src: string) => {
    if (/^(https?:|data:|\/)/.test(src)) return m;
    const ext = path.extname(src).toLowerCase();
    if (!IMAGE_EXT.has(ext)) return m;
    const basename = path.basename(src);
    const publicRel = path.posix.join("/assets", note.collection, note.slug, basename);
    imageCopies.set(src, publicRel);
    return `![${alt}](${publicRel})`;
  });

  // Wikilinks: [[Target]] or [[Target|alias]] or [[collection/Target|alias]]
  out = out.replace(/\[\[([^\]]+)\]\]/g, (_m, inner: string) => {
    const [rawTarget, aliasRaw] = inner.split("|").map((s) => s.trim());
    const alias = aliasRaw ?? rawTarget;
    let target = rawTarget;
    let forcedCollection: Collection | undefined;
    const slash = rawTarget.indexOf("/");
    if (slash > 0) {
      const maybe = rawTarget.slice(0, slash) as Collection;
      if (COLLECTIONS.includes(maybe)) {
        forcedCollection = maybe;
        target = rawTarget.slice(slash + 1);
      }
    }
    const found = wikiIndex.get(target.toLowerCase());
    if (!found) return alias;
    const collection = forcedCollection ?? found.collection;
    return `[${alias}](/${collection}/${found.slug})`;
  });

  return out;
}

async function copyImage(vaultRelOrBasename: string, targetPublicRel: string, vaultRoot: string) {
  const candidates: string[] = [];
  if (path.isAbsolute(vaultRelOrBasename)) candidates.push(vaultRelOrBasename);
  else {
    candidates.push(path.join(vaultRoot, vaultRelOrBasename));
    // Obsidian attachments folder fallbacks:
    candidates.push(path.join(vaultRoot, "attachments", path.basename(vaultRelOrBasename)));
    candidates.push(path.join(vaultRoot, "assets", path.basename(vaultRelOrBasename)));
  }
  for (const src of candidates) {
    try {
      const stat = await fs.stat(src);
      if (!stat.isFile()) continue;
      const dest = path.join(REPO, "public", targetPublicRel.replace(/^\//, ""));
      await fs.mkdir(path.dirname(dest), { recursive: true });
      await fs.copyFile(src, dest);
      return true;
    } catch {
      /* try next */
    }
  }
  console.warn(`  ! image not found: ${vaultRelOrBasename}`);
  return false;
}

async function clearSyncedFiles() {
  // Remove previously synced files (those with a sentinel comment) so unpublished notes vanish.
  for (const c of COLLECTIONS) {
    const dir = path.join(CONTENT_DIR, c);
    let entries: import("node:fs").Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (!e.isFile() || !e.name.endsWith(".md")) continue;
      const p = path.join(dir, e.name);
      const raw = await fs.readFile(p, "utf8");
      // Only check the YAML frontmatter (between the first two --- fences).
      // Long frontmatter can push the marker past an arbitrary byte cutoff.
      const fmEnd = raw.indexOf("\n---", 4);
      const fm = fmEnd > 0 ? raw.slice(0, fmEnd) : raw.slice(0, 2000);
      if (fm.includes("synced-from-vault: true")) await fs.unlink(p);
    }
  }
  // Clear synced asset dirs
  try {
    await fs.rm(ASSETS_DIR, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}

async function main() {
  console.log(`vault:   ${VAULT}`);
  console.log(`target:  ${CONTENT_DIR}`);

  try {
    await fs.access(VAULT);
  } catch {
    console.error(`ERROR: vault not found at ${VAULT}. Set OBSIDIAN_VAULT env var to override.`);
    process.exit(1);
  }

  await clearSyncedFiles();

  const notes = await collectSourceNotes();
  if (notes.length === 0) {
    console.log("no published notes found.");
    return;
  }
  const wikiIndex = buildWikilinkIndex(notes);

  let written = 0;
  for (const note of notes) {
    const imageCopies = new Map<string, string>();
    const transformed = transformBody(note.body, note, wikiIndex, imageCopies);

    const fm = { ...note.frontmatter, "synced-from-vault": true };
    delete (fm as Record<string, unknown>).collection; // not part of schema
    delete (fm as Record<string, unknown>).slug;

    const serialized = matter.stringify(transformed, fm);
    const destDir = path.join(CONTENT_DIR, note.collection);
    await fs.mkdir(destDir, { recursive: true });
    const destPath = path.join(destDir, `${note.slug}.md`);
    await fs.writeFile(destPath, serialized, "utf8");
    written += 1;

    for (const [src, publicRel] of imageCopies) {
      await copyImage(src, publicRel, VAULT);
    }
    console.log(`  + ${note.collection}/${note.slug}.md`);
  }

  console.log(`\ndone. ${written} file(s) synced.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
