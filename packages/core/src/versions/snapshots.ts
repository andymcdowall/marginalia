import type { GitClient } from "../git/GitClient.js";
import type { SaveCommit } from "./saveCommit.js";

export type SnapshotInfo = {
  tag: string; // full short ref, e.g. snapshot/main/my-name
  slug: string;
  objectName: string; // the peeled (commit) sha the tag points to
  taggerDate: string;
  subject: string; // the snapshot's name
  body: string; // the snapshot's note
};

const FS = "\x1f"; // git format field separator (SPEC.md's "%1f"/"%1e" are shorthand for %x1f/%x1e)
const RS = "\x1e";

// SPEC.md §9.2. lowercased; non-alphanumerics become "-"; trimmed; max 40 chars.
export function slugify(name: string): string {
  let slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (slug.length > 40) {
    slug = slug.slice(0, 40).replace(/-+$/, "");
  }
  return slug || "snapshot";
}

function tagPrefix(branch: string): string {
  return `snapshot/${branch}/`;
}

function refPattern(branch: string): string {
  return `refs/tags/${tagPrefix(branch)}`;
}

async function existingSlugs(git: GitClient, branch: string): Promise<Set<string>> {
  const result = await git.run(["for-each-ref", refPattern(branch), "--format=%(refname:short)"]);
  const slugs = new Set<string>();
  for (const line of result.stdout.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    slugs.add(trimmed.slice(tagPrefix(branch).length));
  }
  return slugs;
}

export async function createSnapshot(
  git: GitClient,
  saveCommit: SaveCommit,
  branch: string,
  name: string,
  note: string
): Promise<string> {
  await saveCommit.flush();
  const baseSlug = slugify(name);
  const existing = await existingSlugs(git, branch);
  let slug = baseSlug;
  for (let n = 2; existing.has(slug); n++) {
    slug = `${baseSlug}-${n}`;
  }
  const tag = `${tagPrefix(branch)}${slug}`;
  const message = note ? `${name}\n\n${note}` : name;
  await git.must(["tag", "-a", tag, "-m", message]);
  return tag;
}

export async function listSnapshots(git: GitClient, branch: string): Promise<SnapshotInfo[]> {
  const format =
    ["%(refname:short)", "%(*objectname)", "%(taggerdate:iso-strict)", "%(contents:subject)", "%(contents:body)"].join(
      FS
    ) + RS;
  const result = await git.run(["for-each-ref", refPattern(branch), "--sort=-taggerdate", `--format=${format}`]);

  const out: SnapshotInfo[] = [];
  for (const rawRecord of result.stdout.split(RS)) {
    const record = rawRecord.replace(/^\n+/, "").trim();
    if (!record) continue;
    const [tag, objectName, taggerDate, subject, body] = record.split(FS);
    if (!tag) continue;
    out.push({
      tag,
      slug: tag.slice(tagPrefix(branch).length),
      objectName: objectName ?? "",
      taggerDate: taggerDate ?? "",
      subject: subject ?? "",
      body: body ?? "",
    });
  }
  return out;
}

// Restores a file's content at `sha` (a snapshot's objectName or any commit) into the working
// tree as an ordinary edit — it becomes part of the current draft until the idea is saved. Never
// resets or rewrites history (SPEC.md §9.2).
export async function restoreToVersion(
  git: GitClient,
  saveCommit: SaveCommit,
  absPath: string,
  sha: string
): Promise<void> {
  const rel = git.toRelative(absPath);
  const show = await git.run(["show", `${sha}:${rel}`]);
  const content = show.code === 0 ? show.stdout : "";
  await saveCommit.save(absPath, content);
}
