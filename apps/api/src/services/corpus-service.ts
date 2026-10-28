import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

export interface CorpusDocument {
  path: string;
  title: string;
  content: string;
}

async function findMarkdownFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, {
    withFileTypes: true,
  });

  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(directory, entry.name);

      if (entry.isDirectory()) {
        return findMarkdownFiles(fullPath);
      }

      if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
        return [fullPath];
      }

      return [];
    }),
  );

  return files.flat();
}

export async function loadCorpus(
  corpusPath: string,
): Promise<CorpusDocument[]> {
  const absoluteCorpusPath = path.resolve(corpusPath);
  const files = (await findMarkdownFiles(absoluteCorpusPath)).sort();

  return Promise.all(
    files.map(async (filePath) => {
      const content = await readFile(filePath, "utf-8");

      return {
        path: path
          .relative(absoluteCorpusPath, filePath)
          .replaceAll("\\", "/"),
        title: path.basename(filePath, path.extname(filePath)),
        content,
      };
    }),
  );
}
