import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import gallerySeed from "../../data/gallery.json";
import menuSeed from "../../data/menu.json";
import restaurantSeed from "../../data/restaurant.json";
import settingsSeed from "../../data/settings.json";
import { PublicError } from "../../shared/errors";
import { isLocalImagePath } from "../../shared/text";

export type DocName = "restaurant" | "menu" | "gallery" | "settings";
export type PersistenceMode = "filesystem" | "github" | "unconfigured";

export interface ContentStore {
  mode: PersistenceMode;
  read(doc: DocName): Promise<unknown>;
  write(doc: DocName, data: unknown, message: string): Promise<void>;
  writeImage(publicPath: string, bytes: Uint8Array, message: string): Promise<void>;
  deleteImage(publicPath: string, message: string): Promise<void>;
}

const seeds: Record<DocName, unknown> = {
  restaurant: restaurantSeed,
  menu: menuSeed,
  gallery: gallerySeed,
  settings: settingsSeed,
};

function isDeployed() {
  const context = process.env.CONTEXT;
  if (context === "production" || context === "deploy-preview" || context === "branch-deploy") return true;
  if (context === "dev") return false;
  return Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME);
}

export function persistenceMode(): PersistenceMode {
  const hasGit = Boolean(process.env.GIT_PROVIDER_TOKEN && process.env.GIT_REPOSITORY);
  if (process.env.PERSISTENCE === "github" && hasGit) return "github";
  if (isDeployed() && hasGit) return "github";
  if (!isDeployed()) return "filesystem";
  return "unconfigured";
}

function commitMessage(message: string) {
  return message.replace(/[\r\n]/g, " ").slice(0, 120);
}

function imageParts(publicPath: string) {
  const match = /^\/images\/(logo|hero|menu|gallery)\/([A-Za-z0-9][A-Za-z0-9._-]{0,100}\.(jpg|jpeg|png|webp))$/i.exec(
    publicPath,
  );
  if (!match) throw new PublicError(400, "That image path is not allowed.");
  return { folder: match[1], filename: match[2], repoPath: `public/images/${match[1]}/${match[2]}` };
}

function createFileStore(root: string): ContentStore {
  const dataDir = path.join(root, "data");
  return {
    mode: "filesystem",
    async read(doc) {
      try {
        return JSON.parse(await readFile(path.join(dataDir, `${doc}.json`), "utf8")) as unknown;
      } catch (error) {
        if (error instanceof PublicError) throw error;
        throw new PublicError(500, "Stored content could not be read.");
      }
    },
    async write(doc, data, _message) {
      const serialized = `${JSON.stringify(data, null, 2)}\n`;
      JSON.parse(serialized);
      await mkdir(dataDir, { recursive: true });
      await writeFile(path.join(dataDir, `${doc}.json`), serialized, "utf8");
    },
    async writeImage(publicPath, bytes) {
      const { folder, filename } = imageParts(publicPath);
      const directory = path.join(root, "public", "images", folder);
      await mkdir(directory, { recursive: true });
      await writeFile(path.join(directory, filename), bytes);
    },
    async deleteImage(publicPath) {
      if (!isLocalImagePath(publicPath)) throw new PublicError(400, "That image path is not allowed.");
      const { folder, filename } = imageParts(publicPath);
      await rm(path.join(root, "public", "images", folder, filename), { force: true });
    },
  };
}

function gitSettings() {
  const token = process.env.GIT_PROVIDER_TOKEN || "";
  const repo = process.env.GIT_REPOSITORY || "";
  const branch = process.env.GIT_BRANCH || "main";
  if (!token || !/^[^/\s]+\/[^/\s]+$/.test(repo)) {
    throw new PublicError(503, "Saving is not configured yet. Add the Git repository settings on Netlify.");
  }
  if (!/^[A-Za-z0-9._/-]{1,100}$/.test(branch) || branch.includes("..")) {
    throw new PublicError(503, "The branch setting is not valid.");
  }
  return { token, repo, branch };
}

function githubError(status: number) {
  console.error(`GitHub request failed with status ${status}`);
  if (status === 401 || status === 403) return new PublicError(502, "Could not save. The repository token was rejected.");
  if (status === 404) return new PublicError(502, "Could not save. Check the repository name and branch.");
  if (status === 409 || status === 422) return new PublicError(409, "The content changed while saving. Refresh and try again.");
  return new PublicError(502, "Could not save changes. Please try again.");
}

async function githubRequest(repoPath: string, method: string, body?: Record<string, unknown>) {
  const { token, repo, branch } = gitSettings();
  const url = new URL(
    `https://api.github.com/repos/${repo}/contents/${repoPath
      .split("/")
      .map((part) => encodeURIComponent(part))
      .join("/")}`,
  );
  if (method === "GET") url.searchParams.set("ref", branch);
  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "User-Agent": "Khan-Baba-CMS",
        "X-GitHub-Api-Version": "2022-11-28",
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify({ ...body, branch }) : undefined,
      signal: AbortSignal.timeout(20000),
    });
  } catch {
    throw new PublicError(502, "Could not reach the repository. Please try again.");
  }
  return response;
}

async function githubSha(repoPath: string): Promise<string | null> {
  const response = await githubRequest(repoPath, "GET");
  if (response.status === 404) return null;
  if (!response.ok) throw githubError(response.status);
  const payload = (await response.json()) as { sha?: string };
  if (!payload.sha || Array.isArray(payload)) throw new PublicError(500, "Stored content could not be read.");
  return payload.sha;
}

function createGitHubStore(): ContentStore {
  return {
    mode: "github",
    async read(doc) {
      const response = await githubRequest(`data/${doc}.json`, "GET");
      if (!response.ok) throw githubError(response.status);
      const payload = (await response.json()) as { content?: string };
      if (!payload.content || Array.isArray(payload)) throw new PublicError(500, "Stored content could not be read.");
      try {
        return JSON.parse(Buffer.from(payload.content.replace(/\s/g, ""), "base64").toString("utf8")) as unknown;
      } catch {
        throw new PublicError(500, "Stored content could not be read.");
      }
    },
    async write(doc, data, message) {
      const repoPath = `data/${doc}.json`;
      const sha = await githubSha(repoPath);
      const response = await githubRequest(repoPath, "PUT", {
        message: commitMessage(message),
        content: Buffer.from(`${JSON.stringify(data, null, 2)}\n`, "utf8").toString("base64"),
        ...(sha ? { sha } : {}),
      });
      if (!response.ok) throw githubError(response.status);
    },
    async writeImage(publicPath, bytes, message) {
      const { repoPath } = imageParts(publicPath);
      const sha = await githubSha(repoPath);
      const response = await githubRequest(repoPath, "PUT", {
        message: commitMessage(message),
        content: Buffer.from(bytes).toString("base64"),
        ...(sha ? { sha } : {}),
      });
      if (!response.ok) throw githubError(response.status);
    },
    async deleteImage(publicPath, message) {
      const { repoPath } = imageParts(publicPath);
      const sha = await githubSha(repoPath);
      if (!sha) return;
      const response = await githubRequest(repoPath, "DELETE", {
        message: commitMessage(message),
        sha,
      });
      if (!response.ok && response.status !== 404) throw githubError(response.status);
    },
  };
}

function createReadOnlyStore(): ContentStore {
  const fail = async () => {
    throw new PublicError(503, "Saving is not configured yet. Add the Git repository settings on Netlify, then try again.");
  };
  return {
    mode: "unconfigured",
    async read(doc) {
      return structuredClone(seeds[doc]);
    },
    write: fail,
    writeImage: fail,
    deleteImage: fail,
  };
}

export function getStore(): ContentStore {
  const mode = persistenceMode();
  if (mode === "github") return createGitHubStore();
  if (mode === "filesystem") return createFileStore(process.env.DATA_ROOT || process.cwd());
  return createReadOnlyStore();
}
