import type { RagEvaluationCase } from "./rag-evaluation-cases.js";

export const ragEvaluationCasesV3: RagEvaluationCase[] = [
  {
    question:
      "What naming convention should playable assets follow?",
    shouldAnswer: true,
    expectedPhraseGroups: [
      ["pod_game_asset_variant"],
      ["lower snake case", "snake case"],
    ],
    expectedPaths: ["asset-naming.md"],
  },

  {
    question:
      "Where must audio files be stored so the build pipeline can find them?",
    shouldAnswer: true,
    expectedPhraseGroups: [
      ["audio/"],
      ["not", "never"],
      ["texture"],
    ],
    expectedPaths: ["asset-naming.md"],
  },

  {
    question:
      "What is the most common asset organization mistake that causes size regressions?",
    shouldAnswer: true,
    expectedPhraseGroups: [
      ["audio"],
      ["misplaced", "wrong"],
      ["size regression", "size"],
    ],
    expectedPaths: ["asset-naming.md"],
  },

  {
    question:
      "What situations cause an incident to be opened?",
    shouldAnswer: true,
    expectedPhraseGroups: [
      ["delivery rejection"],
      ["client-visible outage", "client visible outage"],
      ["data issue"],
    ],
    expectedPaths: ["incident-process.md"],
  },

  {
    question:
      "Who owns communication during an incident, and who owns the technical fix?",
    shouldAnswer: true,
    expectedPhraseGroups: [
      ["pod producer"],
      ["platform"],
      ["communication"],
      ["technical fix", "fix"],
    ],
    expectedPaths: ["incident-process.md"],
  },

  {
    question:
      "How quickly must an incident postmortem be added to the corpus?",
    shouldAnswer: true,
    expectedPhraseGroups: [
      ["five business days", "5 business days"],
    ],
    expectedPaths: ["incident-process.md"],
  },

  {
    question:
      "What internal reviews must a playable pass before client delivery?",
    shouldAnswer: true,
    expectedPhraseGroups: [
      ["design review"],
      ["delivery review"],
    ],
    expectedPaths: ["review-process.md"],
  },

  {
    question:
      "Can the author of a playable perform its delivery review?",
    shouldAnswer: true,
    expectedPhraseGroups: [
      ["no", "cannot", "can't", "never"],
      ["different pod"],
    ],
    expectedPaths: ["review-process.md"],
  },

  {
    question:
      "How are client-visible playable builds distributed to clients?",
    shouldAnswer: true,
    expectedPhraseGroups: [
      ["staging cdn"],
      [
        "direct file transfers",
        "direct transfers",
        "not allowed",
      ],
    ],
    expectedPaths: ["review-process.md"],
  },

  {
    question:
      "What changed in lumen-build 4.1 compared with the previous release?",
    shouldAnswer: true,
    expectedPhraseGroups: [
      ["unified compression"],
      ["audio"],
      ["shared compressor"],
      ["incremental", "faster incremental"],
    ],
    expectedPaths: ["lumen-build-4.1.md"],
  },

  {
    question:
      "Which lumen-build release introduced the export post-processing plugin system?",
    shouldAnswer: true,
    expectedPhraseGroups: [
      ["4.0"],
      ["plugin"],
      ["export post-processing", "post-processing"],
    ],
    expectedPaths: ["lumen-build-4.0.md"],
  },

  {
    question:
      "According to the November 17, 2025 production sync, what was the status of the Lumen SDK v3 migration?",
    shouldAnswer: true,
    expectedPhraseGroups: [
      ["v3 beta"],
      ["migration guide"],
      ["v2"],
      ["default"],
      ["january"],
    ],
    expectedPaths: ["2025-11-17-production-sync.md"],
  },

  {
    question:
      "In the May 18, 2026 production sync, what was confirmed about Waffle Rush and the SDK migration?",
    shouldAnswer: true,
    expectedPhraseGroups: [
      ["waffle rush"],
      ["lumensdk.init"],
      ["lumen.track"],
      ["removed"],
    ],
    expectedPaths: ["2026-05-18-production-sync.md"],
  },

  {
    question:
      "Which project was awaiting client feedback in the May 19, 2025 production sync?",
    shouldAnswer: true,
    expectedPhraseGroups: [
      ["gloom garden"],
      ["awaiting client feedback"],
    ],
    expectedPaths: ["2025-05-19-production-sync.md"],
  },

  {
    question:
      "Which project was delivered and had localization coverage as the week's focus on May 5, 2025?",
    shouldAnswer: true,
    expectedPhraseGroups: [
      ["rooftop dash"],
      ["localization coverage"],
    ],
    expectedPaths: ["2025-05-05-production-sync.md"],
  },

  // Negative cases

  {
    question:
      "How long should a developer spend writing an incident postmortem?",
    shouldAnswer: false,
    expectedPhraseGroups: [],
    expectedPaths: [],
  },

  {
    question:
      "What image editor must artists use when creating playable assets?",
    shouldAnswer: false,
    expectedPhraseGroups: [],
    expectedPaths: [],
  },

  {
    question:
      "What is the maximum number of client revisions allowed before delivery?",
    shouldAnswer: false,
    expectedPhraseGroups: [],
    expectedPaths: [],
  },

  {
    question:
      "What CDN provider hosts the staging CDN?",
    shouldAnswer: false,
    expectedPhraseGroups: [],
    expectedPaths: [],
  },
];