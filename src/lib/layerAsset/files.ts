import { promises as fs } from "node:fs";
import { resolve, relative, isAbsolute, sep } from "node:path";
import { bundleFileSchema } from "./schema";

export async function bundleFile(root: string, file: string): Promise<string> {
  bundleFileSchema.parse(file);
  const base = await fs.realpath(root);
  let current = base;
  for (const part of file.split("/")) {
    current = resolve(current, part);
    try {
      if ((await fs.lstat(current)).isSymbolicLink()) throw new Error(`Symlink is not allowed: ${file}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  const rel = relative(base, current);
  if (isAbsolute(rel) || rel === ".." || rel.startsWith(`..${sep}`)) throw new Error("Path escapes bundle");
  return current;
}
