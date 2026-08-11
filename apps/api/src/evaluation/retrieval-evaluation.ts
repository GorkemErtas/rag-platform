import type { SearchResult } from "@playable-factory/shared";

import { pool } from "../db/index.js";
import { CURRENT_THRESHOLD } from "../services/rag-service.js";
import {
  searchDocumentsDense,
  searchDocumentsHybrid,
} from "../services/retrieval-service.js";
import { retrievalEvaluationCases } from "./evaluation-cases.js";

const TOP_K = 5;

type SearchFunction = (
  query: string,
  limit?: number,
) => Promise<SearchResult[]>;

interface EvaluationSummary {
  name: string;
  positiveCases: number;
  top1Hits: number;
  top3Hits: number;
  negativeCases: number;
  correctAbstentions: number;
  minPositiveScore: number;
  maxNegativeScore: number;
}

async function evaluate(
  name: string,
  search: SearchFunction,
): Promise<EvaluationSummary> {
  let positiveCases = 0;
  let top1Hits = 0;
  let top3Hits = 0;

  let negativeCases = 0;
  let correctAbstentions = 0;

  const positiveTopScores: number[] = [];
  const negativeTopScores: number[] = [];

  console.log(`\n=== ${name} Retrieval Evaluation ===\n`);

  for (const testCase of retrievalEvaluationCases) {
    const results = await search(
      testCase.question,
      TOP_K,
    );

    const topScore =
      results[0]?.similarity ?? 0;

    if (testCase.answerable) {
      positiveCases += 1;
      positiveTopScores.push(topScore);

      const top1Hit =
        results.length > 0 &&
        testCase.expectedPaths.includes(
          results[0].documentPath,
        );

      const top3Hit = results
        .slice(0, 3)
        .some((result) =>
          testCase.expectedPaths.includes(
            result.documentPath,
          ),
        );

      if (top1Hit) {
        top1Hits += 1;
      }

      if (top3Hit) {
        top3Hits += 1;
      }

      console.log(
        `[ANSWERABLE] ${testCase.question}`,
      );

      console.log(
        `  Expected: ${testCase.expectedPaths.join(", ")}`,
      );

      console.log(
        `  Top-1: ${
          results[0]?.documentPath ?? "none"
        } (${topScore.toFixed(4)})`,
      );

      console.log(
        `  Top-1 hit: ${
          top1Hit ? "YES" : "NO"
        }`,
      );

      console.log(
        `  Top-3 hit: ${
          top3Hit ? "YES" : "NO"
        }`,
      );

      console.log(
        `  Threshold: ${
          topScore >= CURRENT_THRESHOLD
            ? "PASS"
            : "REJECT"
        }`,
      );
    } else {
      negativeCases += 1;
      negativeTopScores.push(topScore);

      const abstained =
        topScore < CURRENT_THRESHOLD;

      if (abstained) {
        correctAbstentions += 1;
      }

      console.log(
        `[UNANSWERABLE] ${testCase.question}`,
      );

      console.log(
        `  Top-1: ${
          results[0]?.documentPath ?? "none"
        } (${topScore.toFixed(4)})`,
      );

      console.log(
        `  Threshold: ${
          abstained
            ? "CORRECT REJECT"
            : "FALSE POSITIVE"
        }`,
      );
    }

    console.log();
  }

  const minPositiveScore =
    positiveTopScores.length > 0
      ? Math.min(...positiveTopScores)
      : 0;

  const maxNegativeScore =
    negativeTopScores.length > 0
      ? Math.max(...negativeTopScores)
      : 0;

  console.log(`=== ${name} Summary ===`);

  console.log(
    `Top-1 source accuracy: ${top1Hits}/${positiveCases} (${(
      (top1Hits / positiveCases) *
      100
    ).toFixed(1)}%)`,
  );

  console.log(
    `Top-3 source recall: ${top3Hits}/${positiveCases} (${(
      (top3Hits / positiveCases) *
      100
    ).toFixed(1)}%)`,
  );

  console.log(
    `Negative abstention accuracy: ${correctAbstentions}/${negativeCases} (${(
      (correctAbstentions / negativeCases) *
      100
    ).toFixed(1)}%)`,
  );

  console.log(
    `Lowest answerable top score: ${minPositiveScore.toFixed(4)}`,
  );

  console.log(
    `Highest unanswerable top score: ${maxNegativeScore.toFixed(4)}`,
  );

  console.log(
    `Current threshold: ${CURRENT_THRESHOLD.toFixed(4)}`,
  );

  return {
    name,
    positiveCases,
    top1Hits,
    top3Hits,
    negativeCases,
    correctAbstentions,
    minPositiveScore,
    maxNegativeScore,
  };
}

function printComparison(
  dense: EvaluationSummary,
  hybrid: EvaluationSummary,
): void {
  const denseTop1 =
    (dense.top1Hits / dense.positiveCases) * 100;

  const hybridTop1 =
    (hybrid.top1Hits / hybrid.positiveCases) * 100;

  const denseTop3 =
    (dense.top3Hits / dense.positiveCases) * 100;

  const hybridTop3 =
    (hybrid.top3Hits / hybrid.positiveCases) *
    100;

  const denseAbstention =
    (dense.correctAbstentions /
      dense.negativeCases) *
    100;

  const hybridAbstention =
    (hybrid.correctAbstentions /
      hybrid.negativeCases) *
    100;

  console.log("\n=== Dense vs Hybrid ===\n");

  console.log(
    `Top-1 accuracy:       ${denseTop1.toFixed(
      1,
    )}% -> ${hybridTop1.toFixed(1)}%`,
  );

  console.log(
    `Top-3 recall:         ${denseTop3.toFixed(
      1,
    )}% -> ${hybridTop3.toFixed(1)}%`,
  );

  console.log(
    `Abstention accuracy: ${denseAbstention.toFixed(
      1,
    )}% -> ${hybridAbstention.toFixed(1)}%`,
  );
}

async function main(): Promise<void> {
  const dense = await evaluate(
    "Dense",
    searchDocumentsDense,
  );

  const hybrid = await evaluate(
    "Hybrid",
    searchDocumentsHybrid,
  );

  printComparison(dense, hybrid);
}

main()
  .catch((error) => {
    console.error(
      "Retrieval evaluation failed:",
      error,
    );

    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });