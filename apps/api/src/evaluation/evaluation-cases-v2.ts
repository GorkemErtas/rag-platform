import type { RetrievalEvaluationCase } from "./evaluation-cases.js";

export const retrievalEvaluationCasesV2: RetrievalEvaluationCase[] = [
  // --------------------------------------------------
  // Playable brief guidelines
  // --------------------------------------------------

  {
    question:
      "What information must be included in a valid playable brief?",
    answerable: true,
    expectedPaths: ["playable-brief-guidelines.md"],
  },
  {
    question:
      "How quickly must the player be able to interact with a playable?",
    answerable: true,
    expectedPaths: ["playable-brief-guidelines.md"],
  },
  {
    question:
      "What should we do if an intro lasts longer than three seconds?",
    answerable: true,
    expectedPaths: ["playable-brief-guidelines.md"],
  },
  {
    question:
      "A client wants three different gameplay mechanics in one playable. How should we handle the brief?",
    answerable: true,
    expectedPaths: ["playable-brief-guidelines.md"],
  },

  // --------------------------------------------------
  // QA checklist
  // --------------------------------------------------

  {
    question:
      "What checks must pass before a playable can be delivered to a client?",
    answerable: true,
    expectedPaths: ["qa-checklist.md"],
  },
  {
    question:
      "An AppLovin build still makes analytics requests. Can it be delivered?",
    answerable: true,
    expectedPaths: ["qa-checklist.md"],
  },
  {
    question:
      "What audio behavior should QA verify before delivery?",
    answerable: true,
    expectedPaths: ["qa-checklist.md"],
  },
  {
    question:
      "How do we check for memory problems before delivering a playable?",
    answerable: true,
    expectedPaths: ["qa-checklist.md"],
  },

  // --------------------------------------------------
  // UI style guide
  // --------------------------------------------------

  {
    question:
      "How many primary CTAs may be visible at the same time?",
    answerable: true,
    expectedPaths: ["style-guide-ui.md"],
  },
  {
    question:
      "What should happen when the CTA does not have enough contrast with the background?",
    answerable: true,
    expectedPaths: ["style-guide-ui.md"],
  },
  {
    question:
      "Does a 25-second playable need to show progress to the player?",
    answerable: true,
    expectedPaths: ["style-guide-ui.md"],
  },
  {
    question:
      "What elements are allowed on the end card, and should store badges be included in the creative?",
    answerable: true,
    expectedPaths: ["style-guide-ui.md"],
  },

  // --------------------------------------------------
  // Negative / out-of-corpus
  // --------------------------------------------------

  {
    question:
      "Which analytics provider should be used for playable event tracking?",
    answerable: false,
    expectedPaths: [],
  },
  {
    question:
      "What frame rate must every playable maintain?",
    answerable: false,
    expectedPaths: [],
  },
  {
    question:
      "What maximum texture resolution is allowed in a playable?",
    answerable: false,
    expectedPaths: [],
  },
];