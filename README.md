# mypage

Personal site built on Astro 4.x + Tailwind + DaisyUI, seeded from the Astrofy
template. All content lives as Markdown in an Obsidian vault and is synced into
`src/content/` on demand.

## Workflow

```bash
pnpm sync   # pull published notes from $OBSIDIAN_VAULT (default ~/Documents/Obsidian)
pnpm dev    # start Astro dev server (shows ALL notes, including unpublished)
pnpm build  # production build (published: true only)
```

- Dev: every note is visible, so you can preview drafts.
- Prod: only notes with `published: true` ship.
- The vault is **read-only source**. Never put Astro files inside it.

### Environment

```bash
export OBSIDIAN_VAULT="$HOME/Documents/Obsidian"   # override if needed
```

## Content model

Six collections, defined in `src/content/config.ts`:

| Collection    | Purpose                                                      |
|---------------|--------------------------------------------------------------|
| `blog`        | Blog posts. Fixed category enum + free-form tags.            |
| `projects`    | Projects. `tracks: [hardware|software|both]` filter.         |
| `experience`  | Reusable experience blocks with per-perspective summaries.   |
| `resume`      | Three tracks (`main`, `hardware`, `software`) composed from experience + projects. |
| `about`       | About page(s).                                               |
| `learnings`   | Short notes / things I'm studying.                           |

Blog categories (enum): `Hardware`, `Backend`, `Smart Factory`, `AI`, `Learnings`, `Career Journey`.

## Obsidian frontmatter templates

The sync script routes each note by its `collection` field and copies it only
if `published: true`. File slug comes from (in order) `slug` → `title` → filename.

Wikilinks like `[[Note Title]]` or `[[projects/Foo|alias]]` are rewritten to
`/{collection}/{slug}`. Images (both `![[img.png]]` and `![alt](rel/path.png)`)
are copied into `/public/assets/{collection}/{slug}/` and paths rewritten.

### 1. Blog post

```yaml
---
collection: blog
published: true          # required for production
title: "Carrier bolt loosening: a root-cause log"
description: "Six weeks of reading vibration data the wrong way."
pubDate: 2026-03-18
updatedDate: 2026-04-02  # optional
category: Hardware       # one of the fixed enum values
tags: [oled, process, rca]
heroImage: /assets/blog/carrier-bolt/hero.webp  # optional
badge: NEW               # optional
---
```

### 2. Project

```yaml
---
collection: projects
published: true
title: "MES event pipeline"
description: "Kafka → CDC → Elasticsearch ingestion for shop-floor events."
pubDate: 2025-11-01
tracks: [software]       # or [hardware], [both], [hardware, software]
role: "Backend engineer"
stack: [Go, Kafka, Debezium, Elasticsearch, AWS]
tags: [smart-factory, streaming]
repo: https://github.com/you/mes-pipeline    # optional
demo: https://...                             # optional
heroImage: /assets/projects/mes/hero.webp
featured: true           # surfaces on landing page
---
```

### 3. Experience block

Summaries + highlights are split by perspective so the same role feeds
different resume tracks differently. Either perspective may be omitted.

```yaml
---
collection: experience
published: true
company: "Samsung Display"
role: "OLED Module Mechanical Engineer"
location: "Asan, KR"
startDate: 2019-03-01
endDate: 2022-08-31
current: false
stack: [GD&T, FEA, SPC, Minitab]
perspectives:
  hardware:
    summary: "Owned mechanical integrity of the OLED module line."
    highlights:
      - "Cut adhesive-process defect rate 41% by redesigning the jig tolerance stack."
      - "Led RCA for carrier-bolt loosening that had stalled line #3 for six weeks."
  software:
    summary: "Built the data-side muscles that later became my engineering focus."
    highlights:
      - "Wrote Python scripts against the MES data warehouse to automate SPC reports."
      - "Prototyped a vibration-log parser that flagged loosening events 2 shifts earlier."
---
```

### 4. Resume (one file per track)

`experience` and `projects` are references — use the target file's slug.

```yaml
---
collection: resume
published: true
track: hardware          # main | hardware | software
title: "Minsoo Shin — Hardware Track"
tagline: "OLED module mechanical engineer turned systems thinker."
summary: "Five years in display process engineering..."
experience:
  - samsung-display
  - partridge-systems
projects:
  - carrier-bolt-rca
skills:
  - group: "Mechanical"
    items: [GD&T, FEA, DFMEA, tolerance stack]
  - group: "Process / Quality"
    items: [SPC, Minitab, 8D, RCA]
education:
  - school: "Hongik University"
    degree: "B.S., Materials Science & Engineering"
    startDate: 2013-03-01
    endDate: 2019-02-28
contact:
  email: me@example.com
  github: https://github.com/you
  linkedin: https://www.linkedin.com/in/you
---

Optional free-form markdown body rendered under the structured sections.
```

## Project layout

```
src/
  content/
    config.ts           # 6 collections + zod schemas + exported enums
    {blog,projects,experience,resume,about,learnings}/
  lib/
    content.ts          # isProd-aware helpers: getBlogPosts, getProjectsByTrack, getResume, ...
  pages/
    index.astro
    about.astro
    resume/[track].astro
    projects/index.astro
    blog/index.astro
    blog/[...slug].astro
    blog/category/[category].astro
    blog/tag/[tag].astro
    learnings/index.astro
    learnings/[...slug].astro
    rss.xml.js
scripts/
  sync-from-vault.ts    # pnpm sync
```

## Roadmap

- [ ] Pagefind search (post-build index)
- [ ] astro-og-canvas for automatic OG images
- [ ] Extend RSS to per-category feeds

## License

MIT (template: [Astrofy](https://github.com/manuelernestog/astrofy))
