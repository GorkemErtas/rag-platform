import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { env, validateDemoEnvironment } from "../config/env.js";
import { DEMO_PATHS } from "./demo-service.js";

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
  if (env.demoMode) {
    validateDemoEnvironment();
    if (absoluteCorpusPath !== env.corpusPath) throw new Error("Demo corpus selection does not match CORPUS_PATH");
  }
  const files = (await findMarkdownFiles(absoluteCorpusPath)).sort();

  const corpus = await Promise.all(
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
  if (env.demoMode) {
    const selected = corpus.map((document) => ({ ...document, path: `demo/${document.path}` }));
    if (selected.length !== DEMO_PATHS.length || selected.some((document) => !DEMO_PATHS.includes(document.path))) {
      throw new Error("Demo corpus must contain only the three approved synthetic documents");
    }
    return selected;
  }
  return corpus;
}
