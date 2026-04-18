import { getCollection, getEntries, type CollectionEntry, type CollectionKey } from "astro:content";
import { BLOG_CATEGORIES, PROJECT_TRACKS, RESUME_TRACKS } from "../content/config";

const isProd = import.meta.env.PROD;

type PublishableEntry<K extends CollectionKey> = CollectionEntry<K> & {
  data: { published?: boolean };
};

function publishedFilter<K extends CollectionKey>(entry: PublishableEntry<K>) {
  if (!isProd) return true;
  return entry.data.published === true;
}

export async function getPublished<K extends CollectionKey>(name: K) {
  return (await getCollection(name, publishedFilter as never)) as CollectionEntry<K>[];
}

export async function getBlogPosts() {
  const posts = await getPublished("blog");
  return posts.sort(
    (a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf()
  );
}

export async function getBlogByCategory() {
  const posts = await getBlogPosts();
  const grouped = new Map<(typeof BLOG_CATEGORIES)[number], typeof posts>();
  for (const cat of BLOG_CATEGORIES) grouped.set(cat, []);
  for (const p of posts) grouped.get(p.data.category)!.push(p);
  return grouped;
}

export async function getAllTags() {
  const posts = await getBlogPosts();
  const set = new Set<string>();
  for (const p of posts) p.data.tags?.forEach((t) => set.add(t));
  return [...set].sort();
}

export async function getPostsByTag(tag: string) {
  const posts = await getBlogPosts();
  return posts.filter((p) => p.data.tags?.includes(tag));
}

export async function getPostsByCategory(category: string) {
  const posts = await getBlogPosts();
  return posts.filter((p) => p.data.category === category);
}

export async function getProjects() {
  const projects = await getPublished("projects");
  return projects.sort(
    (a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf()
  );
}

export async function getProjectsByTrack(
  track: (typeof PROJECT_TRACKS)[number] | "all"
) {
  const projects = await getProjects();
  if (track === "all") return projects;
  return projects.filter(
    (p) => p.data.tracks.includes(track) || p.data.tracks.includes("both")
  );
}

export async function getFeaturedProjects() {
  const projects = await getProjects();
  return projects.filter((p) => p.data.featured);
}

export async function getExperience() {
  const entries = await getPublished("experience");
  return entries.sort(
    (a, b) => b.data.startDate.valueOf() - a.data.startDate.valueOf()
  );
}

export async function getResume(track: (typeof RESUME_TRACKS)[number]) {
  const resumes = await getPublished("resume");
  const entry = resumes.find((r) => r.data.track === track);
  if (!entry) return null;

  const experience = entry.data.experience
    ? await getEntries(entry.data.experience)
    : [];
  const projects = entry.data.projects
    ? await getEntries(entry.data.projects)
    : [];

  return { entry, experience, projects };
}

export async function getLearnings() {
  const entries = await getPublished("learnings");
  return entries.sort(
    (a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf()
  );
}

export async function getAbout() {
  const entries = await getPublished("about");
  return entries[0] ?? null;
}
