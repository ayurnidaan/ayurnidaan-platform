import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const apps = ["customer-mobile", "doctor-mobile", "admin-portal", "hospital-saas"];
const required = [
  "README.md",
  "docs/platform/SYSTEM_MAP.md",
  ...apps.flatMap((app) => [`apps/${app}/package.json`, `apps/${app}/.env.example`]),
  "apps/vaidya-ai/pyproject.toml",
  "apps/vaidya-ai/.env.example",
  "apps/vaidya-ai/vedai/server.py",
  "docs/rag-system/README.md",
  "docs/platform/RAG_IMPORT.md",
];

const failures = [];
for (const path of required) {
  if (!existsSync(join(root, path))) failures.push(`Missing required file: ${path}`);
}

const forbiddenNames = new Set(["node_modules", ".git", ".expo", ".vercel", "dist", "build"]);
const forbiddenEnv = /^\.env(?:\..+)?$/;
const allowedEnv = /\.example$/;

function walk(directory) {
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    const rel = relative(root, path).replaceAll("\\", "/");
    if (statSync(path).isDirectory()) {
      if (entry === ".git" && directory === root) continue;
      if (forbiddenNames.has(entry)) failures.push(`Generated or nested metadata directory included: ${rel}`);
      else walk(path);
      continue;
    }
    if (forbiddenEnv.test(entry) && !allowedEnv.test(entry)) failures.push(`Local environment file included: ${rel}`);
  }
}

for (const app of apps) {
  const packagePath = join(root, "apps", app, "package.json");
  if (existsSync(packagePath)) {
    try {
      JSON.parse(readFileSync(packagePath, "utf8"));
    } catch (error) {
      failures.push(`Invalid JSON in apps/${app}/package.json: ${error.message}`);
    }
  }
}

walk(root);

if (failures.length) {
  console.error("Repository verification failed:\n" + failures.map((item) => `- ${item}`).join("\n"));
  process.exit(1);
}

console.log("Repository structure verified: four JavaScript applications and one Python RAG application, documentation, configuration templates and no generated dependency/build directories.");
