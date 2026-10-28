import { pool } from "../db/index.js";
import { answerQuestion } from "../services/rag-service.js";
import {
  ragEvaluationCasesV3 as ragEvaluationCases,
} from "./rag-evaluation-cases-v3.js";

import type { RagEvaluationCase } from "./rag-evaluation-cases.js";

interface EvaluationCounters {
  totalCases: number;

  answerableCases: number;
  correctAnswers: number;

  unanswerableCases: number;
  correctAbstentions: number;

  phraseCoverageHits: number;
  phraseCoverageCases: number;

  sourceCoverageHits: number;
  sourceCoverageCases: number;

  overallPasses: number;
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function checkPhraseCoverage(
  answer: string,
  testCase: RagEvaluationCase,
): {
  passed: boolean;
  matchedGroups: number;
  totalGroups: number;
  missingGroups: string[][];
} {
  if (testCase.expectedPhraseGroups.length === 0) {
    return {
      passed: true,
      matchedGroups: 0,
      totalGroups: 0,
      missingGroups: [],
    };
  }

  const normalizedAnswer = normalizeText(answer);

  const missingGroups: string[][] = [];
  let matchedGroups = 0;

  for (const group of testCase.expectedPhraseGroups) {
    const groupMatched = group.some((phrase) =>
      normalizedAnswer.includes(
        normalizeText(phrase),
      ),
    );

    if (groupMatched) {
      matchedGroups += 1;
    } else {
      missingGroups.push(group);
    }
  }

  return {
    passed:
      matchedGroups ===
      testCase.expectedPhraseGroups.length,
    matchedGroups,
    totalGroups:
      testCase.expectedPhraseGroups.length,
    missingGroups,
  };
}

function checkSourceCoverage(
  sourcePaths: string[],
  testCase: RagEvaluationCase,
): boolean {
  if (testCase.expectedPaths.length === 0) {
    return true;
  }

  return sourcePaths.some((sourcePath) =>
    testCase.expectedPaths.some(
      (expectedPath) =>
        sourcePath === expectedPath ||
        sourcePath.endsWith(`/${expectedPath}`),
    ),
  );
}

function formatPercentage(
  numerator: number,
  denominator: number,
): string {
  if (denominator === 0) {
    return "N/A";
  }

  return `${(
    (numerator / denominator) *
    100
  ).toFixed(1)}%`;
}

async function evaluateCase(
  testCase: RagEvaluationCase,
): Promise<{
  overallPass: boolean;
  answerabilityCorrect: boolean;
  phraseCoveragePassed: boolean;
  sourceCoveragePassed: boolean;
}> {
  console.log(
    `[${
      testCase.shouldAnswer
        ? "ANSWERABLE"
        : "UNANSWERABLE"
    }] ${testCase.question}`,
  );

  const response = await answerQuestion(
    testCase.question,
  );

  const answerabilityCorrect =
    response.answered === testCase.shouldAnswer;

  if (!testCase.shouldAnswer) {
    const overallPass =
      !response.answered;

    console.log(
      `  Answered: ${response.answered}`,
    );

    console.log(
      `  Abstention: ${
        overallPass
          ? "CORRECT"
          : "FALSE POSITIVE"
      }`,
    );

    if (response.answered) {
      console.log(
        `  Unexpected answer: ${response.answer}`,
      );
    }

    console.log();

    return {
      overallPass,
      answerabilityCorrect,
      phraseCoveragePassed: true,
      sourceCoveragePassed: true,
    };
  }

  const phraseCoverage =
    checkPhraseCoverage(
      response.answer,
      testCase,
    );

  const sourcePaths = response.sources.map(
    (source) => source.path,
  );

  const sourceCoveragePassed =
    checkSourceCoverage(
      sourcePaths,
      testCase,
    );

  const overallPass =
    answerabilityCorrect &&
    phraseCoverage.passed &&
    sourceCoveragePassed;

  console.log(
    `  Answered: ${response.answered}`,
  );

  console.log(
    `  Answerability: ${
      answerabilityCorrect ? "PASS" : "FAIL"
    }`,
  );

  console.log(
    `  Fact coverage: ${
      phraseCoverage.passed ? "PASS" : "FAIL"
    } (${phraseCoverage.matchedGroups}/${phraseCoverage.totalGroups})`,
  );

  if (
    phraseCoverage.missingGroups.length > 0
  ) {
    console.log(
      "  Missing fact groups:",
    );

    for (
      const group of
      phraseCoverage.missingGroups
    ) {
      console.log(
        `    - one of: ${group.join(" | ")}`,
      );
    }
  }

  console.log(
    `  Source coverage: ${
      sourceCoveragePassed ? "PASS" : "FAIL"
    }`,
  );

  console.log(
    `  Expected source: ${
      testCase.expectedPaths.join(", ") ||
      "none"
    }`,
  );

  console.log(
    `  Returned sources: ${
      sourcePaths.join(", ") || "none"
    }`,
  );

  console.log(
    `  Overall: ${
      overallPass ? "PASS" : "FAIL"
    }`,
  );

  console.log();
  console.log("  Answer:");
  console.log(
    `  ${response.answer.replace(/\n/g, "\n  ")}`,
  );

  console.log();

  return {
    overallPass,
    answerabilityCorrect,
    phraseCoveragePassed:
      phraseCoverage.passed,
    sourceCoveragePassed,
  };
}

async function main(): Promise<void> {
  const counters: EvaluationCounters = {
    totalCases: ragEvaluationCases.length,

    answerableCases: 0,
    correctAnswers: 0,

    unanswerableCases: 0,
    correctAbstentions: 0,

    phraseCoverageHits: 0,
    phraseCoverageCases: 0,

    sourceCoverageHits: 0,
    sourceCoverageCases: 0,

    overallPasses: 0,
  };

  console.log(
    "\n=== RAG Answer Evaluation ===\n",
  );

  for (const testCase of ragEvaluationCases) {
    const result =
      await evaluateCase(testCase);

    if (testCase.shouldAnswer) {
      counters.answerableCases += 1;

      counters.phraseCoverageCases += 1;
      counters.sourceCoverageCases += 1;

      if (result.answerabilityCorrect) {
        counters.correctAnswers += 1;
      }

      if (result.phraseCoveragePassed) {
        counters.phraseCoverageHits += 1;
      }

      if (result.sourceCoveragePassed) {
        counters.sourceCoverageHits += 1;
      }
    } else {
      counters.unanswerableCases += 1;

      if (result.answerabilityCorrect) {
        counters.correctAbstentions += 1;
      }
    }

    if (result.overallPass) {
      counters.overallPasses += 1;
    }
  }

  console.log(
    "=== RAG Evaluation Summary ===",
  );

  console.log(
    `Overall case accuracy: ${counters.overallPasses}/${counters.totalCases} (${formatPercentage(
      counters.overallPasses,
      counters.totalCases,
    )})`,
  );

  console.log(
    `Answerability accuracy: ${counters.correctAnswers}/${counters.answerableCases} (${formatPercentage(
      counters.correctAnswers,
      counters.answerableCases,
    )})`,
  );

  console.log(
    `Expected fact coverage: ${counters.phraseCoverageHits}/${counters.phraseCoverageCases} (${formatPercentage(
      counters.phraseCoverageHits,
      counters.phraseCoverageCases,
    )})`,
  );

  console.log(
    `Source coverage: ${counters.sourceCoverageHits}/${counters.sourceCoverageCases} (${formatPercentage(
      counters.sourceCoverageHits,
      counters.sourceCoverageCases,
    )})`,
  );

  console.log(
    `Correct abstention: ${counters.correctAbstentions}/${counters.unanswerableCases} (${formatPercentage(
      counters.correctAbstentions,
      counters.unanswerableCases,
    )})`,
  );
}

main()
  .catch((error) => {
    console.error(
      "RAG evaluation failed:",
      error,
    );

    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });