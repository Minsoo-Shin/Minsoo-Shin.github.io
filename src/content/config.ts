import { z, defineCollection, reference } from "astro:content";

export const BLOG_CATEGORIES = [
  "Hardware",
  "Backend",
  "Smart Factory",
  "Physical AI",
  "AI",
  "Learnings",
  "Career Journey",
] as const;

export const RESUME_TRACKS = ["main", "hardware", "software"] as const;
export const PROJECT_TRACKS = ["hardware", "software", "both"] as const;
export const PROJECT_KINDS = ["company", "side", "open-source"] as const;

const uniqueTags = z
  .array(z.string())
  .refine((items) => new Set(items).size === items.length, {
    message: "tags must be unique",
  })
  .optional();

const blogCollection = defineCollection({
  type: "content",
  schema: z.object({
    title: z.string(),
    description: z.string(),
    pubDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    category: z.enum(BLOG_CATEGORIES),
    tags: uniqueTags,
    heroImage: z.string().optional(),
    badge: z.string().optional(),
    published: z.boolean().default(false),
  }),
});

const projectsCollection = defineCollection({
  type: "content",
  schema: z.object({
    title: z.string(),
    description: z.string(),
    pubDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    tracks: z.array(z.enum(PROJECT_TRACKS)).min(1),
    kind: z.enum(PROJECT_KINDS).default("company"),
    company: z.string().optional(),
    role: z.string().optional(),
    stack: z.array(z.string()).optional(),
    tags: uniqueTags,
    repo: z.string().url().optional(),
    demo: z.string().url().optional(),
    heroImage: z.string().optional(),
    featured: z.boolean().default(false),
    published: z.boolean().default(false),
  }),
});

const experienceCollection = defineCollection({
  type: "content",
  schema: z.object({
    company: z.string(),
    role: z.string(),
    location: z.string().optional(),
    startDate: z.coerce.date(),
    endDate: z.coerce.date().optional(),
    current: z.boolean().default(false),
    stack: z.array(z.string()).optional(),
    perspectives: z.object({
      hardware: z
        .object({
          summary: z.string().optional(),
          highlights: z.array(z.string()).optional(),
        })
        .optional(),
      software: z
        .object({
          summary: z.string().optional(),
          highlights: z.array(z.string()).optional(),
        })
        .optional(),
    }),
    published: z.boolean().default(false),
  }),
});

const resumeCollection = defineCollection({
  type: "content",
  schema: z.object({
    track: z.enum(RESUME_TRACKS),
    title: z.string(),
    tagline: z.string().optional(),
    summary: z.string().optional(),
    experience: z.array(reference("experience")).optional(),
    projects: z.array(reference("projects")).optional(),
    skills: z
      .array(
        z.object({
          group: z.string(),
          items: z.array(z.string()),
        })
      )
      .optional(),
    education: z
      .array(
        z.object({
          school: z.string(),
          degree: z.string().optional(),
          startDate: z.coerce.date().optional(),
          endDate: z.coerce.date().optional(),
        })
      )
      .optional(),
    contact: z
      .object({
        email: z.string().email().optional(),
        github: z.string().url().optional(),
        linkedin: z.string().url().optional(),
      })
      .optional(),
    published: z.boolean().default(false),
  }),
});

const aboutCollection = defineCollection({
  type: "content",
  schema: z.object({
    title: z.string(),
    updatedDate: z.coerce.date().optional(),
    published: z.boolean().default(false),
  }),
});

const learningsCollection = defineCollection({
  type: "content",
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
    pubDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    topic: z.string().optional(),
    tags: uniqueTags,
    published: z.boolean().default(false),
  }),
});

export const collections = {
  blog: blogCollection,
  projects: projectsCollection,
  experience: experienceCollection,
  resume: resumeCollection,
  about: aboutCollection,
  learnings: learningsCollection,
};
