import type { RetrievalEvaluationCase } from "./evaluation-cases.js";

export const retrievalEvaluationCasesV3: RetrievalEvaluationCase[] = [
  // --------------------------------------------------
  // Asset naming / build organization
  // --------------------------------------------------

  {
    question:
      "What naming convention should playable assets follow?",
    answerable: true,
    expectedPaths: ["asset-naming.md"],
  },
  {
    question:
      "Where must audio files be stored so the build pipeline can find them?",
    answerable: true,
    expectedPaths: ["asset-naming.md"],
  },
  {
    question:
      "What is the most common asset organization mistake that causes size regressions?",
    answerable: true,
    expectedPaths: ["asset-naming.md"],
  },

  // --------------------------------------------------
  // Incident process
  // --------------------------------------------------

  {
    question:
      "What situations cause an incident to be opened?",
    answerable: true,
    expectedPaths: ["incident-process.md"],
  },
  {
    question:
      "Who owns communication during an incident, and who owns the technical fix?",
    answerable: true,
    expectedPaths: ["incident-process.md"],
  },
  {
    question:
      "How quickly must an incident postmortem be added to the corpus?",
    answerable: true,
    expectedPaths: ["incident-process.md"],
  },

  // --------------------------------------------------
  // Review process
  // --------------------------------------------------

  {
    question:
      "What internal reviews must a playable pass before client delivery?",
    answerable: true,
    expectedPaths: ["review-process.md"],
  },
  {
    question:
      "Can the author of a playable perform its delivery review?",
    answerable: true,
    expectedPaths: ["review-process.md"],
  },
  {
    question:
      "How are client-visible playable builds distributed to clients?",
    answerable: true,
    expectedPaths: ["review-process.md"],
  },

  // --------------------------------------------------
  // Build versions
  // --------------------------------------------------

  {
    question:
      "What changed in lumen-build 4.1 compared with the previous release?",
    answerable: true,
    expectedPaths: ["lumen-build-4.1.md"],
  },
  {
    question:
      "Which lumen-build version introduced the unified compression path and moved audio through the shared compressor?",
    answerable: true,
    expectedPaths: ["lumen-build-4.1.md"],
  },
  {
    question:
      "Which lumen-build release introduced the export post-processing plugin system?",
    answerable: true,
    expectedPaths: ["lumen-build-4.0.md"],
  },

  // --------------------------------------------------
  // Production sync / temporal discrimination
  // --------------------------------------------------

  {
    question:
      "According to the November 17, 2025 production sync, what was the status of the Lumen SDK v3 migration?",
    answerable: true,
    expectedPaths: ["2025-11-17-production-sync.md"],
  },
  {
    question:
      "In the May 18, 2026 production sync, what was confirmed about Waffle Rush and the SDK migration?",
    answerable: true,
    expectedPaths: ["2026-05-18-production-sync.md"],
  },
  {
    question:
      "Which production sync mentioned that v2 would remain the default until January?",
    answerable: true,
    expectedPaths: ["2025-11-17-production-sync.md"],
  },
  {
    question:
      "Which production sync confirmed that legacy lumen.track calls had been removed from Waffle Rush?",
    answerable: true,
    expectedPaths: ["2026-05-18-production-sync.md"],
  },

  // --------------------------------------------------
  // Similar-document discrimination
  // --------------------------------------------------

  {
    question:
      "Which project was awaiting client feedback in the May 19, 2025 production sync?",
    answerable: true,
    expectedPaths: ["2025-05-19-production-sync.md"],
  },
  {
    question:
      "Which project was delivered and had localization coverage as the week's focus on May 5, 2025?",
    answerable: true,
    expectedPaths: ["2025-05-05-production-sync.md"],
  },

  // --------------------------------------------------
  // Out-of-corpus / abstention
  // --------------------------------------------------

  {
    question:
      "How long should a developer spend writing an incident postmortem?",
    answerable: false,
    expectedPaths: [],
  },
  {
    question:
      "What image editor must artists use when creating playable assets?",
    answerable: false,
    expectedPaths: [],
  },
  {
    question:
      "What is the maximum number of client revisions allowed before delivery?",
    answerable: false,
    expectedPaths: [],
  },
  {
    question:
      "What CDN provider hosts the staging CDN?",
    answerable: false,
    expectedPaths: [],
  },
];