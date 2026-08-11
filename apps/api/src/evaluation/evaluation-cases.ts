export interface RetrievalEvaluationCase {
  question: string;
  answerable: boolean;
  expectedPaths: string[];
}

export const retrievalEvaluationCases: RetrievalEvaluationCase[] = [
  // Official case-study questions
  {
    question:
      "What is the maximum file size for an AppLovin playable, and how does it ship?",
    answerable: true,
    expectedPaths: ["network-specs-applovin.md"],
  },
  {
    question:
      "How do I initialize the current Lumen SDK, and what happened to lumen.track?",
    answerable: true,
    expectedPaths: ["sdk-notes-v3.md"],
  },
  {
    question:
      "Why are sound assets built in a separate pass?",
    answerable: true,
    expectedPaths: ["build-pipeline.md"],
  },
  {
    question:
      "What caused the March 2026 AppLovin rejections and what was fixed?",
    answerable: true,
    expectedPaths: ["incident-postmortem-2026-03.md"],
  },
  {
    question:
      "Which languages must every playable ship with, and what is the fallback?",
    answerable: true,
    expectedPaths: ["localization-guide.md"],
  },

  // Positive cases
  {
    question:
      "What is AppLovin's playable size limit?",
    answerable: true,
    expectedPaths: ["network-specs-applovin.md"],
  },
  {
    question:
      "What replaced lumen.track in the latest SDK?",
    answerable: true,
    expectedPaths: ["sdk-notes-v3.md"],
  },
  {
    question:
      "How should audio files be handled during the build process?",
    answerable: true,
    expectedPaths: ["build-pipeline.md"],
  },
  {
    question:
      "Why did AppLovin reject our playables in March 2026?",
    answerable: true,
    expectedPaths: ["incident-postmortem-2026-03.md"],
  },
  {
    question:
      "What localization fallback should a playable use?",
    answerable: true,
    expectedPaths: ["localization-guide.md"],
  },

  // Negative cases
  {
    question:
      "How many paid vacation days do employees receive each year?",
    answerable: false,
    expectedPaths: [],
  },
  {
    question:
      "What is the salary range for a senior software engineer?",
    answerable: false,
    expectedPaths: [],
  },
  {
    question:
      "What health insurance provider does the company use?",
    answerable: false,
    expectedPaths: [],
  },
  {
    question:
      "What is the company's remote work policy?",
    answerable: false,
    expectedPaths: [],
  },
  {
    question:
      "How many employees currently work at the company?",
    answerable: false,
    expectedPaths: [],
  },
];