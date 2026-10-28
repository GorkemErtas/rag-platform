import type { RagEvaluationCase } from "./rag-evaluation-cases.js";

export const ragEvaluationCasesV4: RagEvaluationCase[] = [
  // --------------------------------------------------
  // March 2026 incident postmortem
  // --------------------------------------------------

  {
    question:
      "Why were eleven AppLovin deliveries rejected in March 2026?",
    shouldAnswer: true,
    expectedPhraseGroups: [
      ["5 mb", "5mb"],
      ["compress", "compression"],
      ["inline", "inlining"],
      ["audio"],
    ],
    expectedPaths: ["incident-postmortem-2026-03.md"],
  },

  {
    question:
      "Why did the internal verify stage fail to catch the March 2026 size regression?",
    shouldAnswer: true,
    expectedPhraseGroups: [
      ["before inlining", "before inline"],
      ["size check", "verify"],
      ["final", "network"],
    ],
    expectedPaths: ["incident-postmortem-2026-03.md"],
  },

  {
    question:
      "What fixes were introduced after the March 2026 delivery incident?",
    shouldAnswer: true,
    expectedPhraseGroups: [
      ["final inlined artifact"],
      ["stage order"],
      ["ci"],
      ["regression test"],
      ["three", "3"],
    ],
    expectedPaths: ["incident-postmortem-2026-03.md"],
  },

  {
    question:
      "What lesson was learned from the March 2026 AppLovin incident?",
    shouldAnswer: true,
    expectedPhraseGroups: [
      ["exact artifact", "artifact"],
      ["network receives", "network"],
      ["size check", "size checks"],
    ],
    expectedPaths: ["incident-postmortem-2026-03.md"],
  },

  // --------------------------------------------------
  // Unity / Meta network specs
  // --------------------------------------------------

  {
    question:
      "How must a Unity playable be packaged, and what are its size limits?",
    shouldAnswer: true,
    expectedPhraseGroups: [
      ["zip"],
      ["index.html"],
      ["5 mb", "5mb"],
      ["10 mb", "10mb"],
    ],
    expectedPaths: ["network-specs-unity-meta.md"],
  },

  {
    question:
      "What special document requirement does Unity have for mraid.js?",
    shouldAnswer: true,
    expectedPhraseGroups: [
      ["mraid.js"],
      ["head"],
    ],
    expectedPaths: ["network-specs-unity-meta.md"],
  },

  {
    question:
      "What are the main delivery constraints for Meta playables?",
    shouldAnswer: true,
    expectedPhraseGroups: [
      ["single html", "single html file"],
      ["2 mb", "2mb"],
      ["5 seconds"],
      ["sponsored"],
      ["4 seconds"],
    ],
    expectedPaths: ["network-specs-unity-meta.md"],
  },

  {
    question:
      "If the same playable concept targets Unity and Meta, should developers manually edit each exported build?",
    shouldAnswer: true,
    expectedPhraseGroups: [
      ["no", "never"],
      ["per-network", "per network"],
      ["same source"],
      ["platform"],
    ],
    expectedPaths: ["network-specs-unity-meta.md"],
  },

  // --------------------------------------------------
  // Developer onboarding
  // --------------------------------------------------

  {
    question:
      "What does a new developer do during their first week?",
    shouldAnswer: true,
    expectedPhraseGroups: [
      ["environment setup"],
      ["lumen-build", "lumen build"],
      ["shadow delivery"],
      ["past playable"],
      ["training"],
    ],
    expectedPaths: ["onboarding-new-dev.md"],
  },

  {
    question:
      "What kind of real work can a new developer take in week two?",
    shouldAnswer: true,
    expectedPhraseGroups: [
      ["existing playable"],
      ["iteration"],
      ["3-day", "3 day", "three-day", "three day"],
    ],
    expectedPaths: ["onboarding-new-dev.md"],
  },

  {
    question:
      "When may a new developer first own a new-concept delivery?",
    shouldAnswer: true,
    expectedPhraseGroups: [
      ["fourth week", "week 4", "4th week"],
    ],
    expectedPaths: ["onboarding-new-dev.md"],
  },

  {
    question:
      "Who grants repository, CI, client-folder, and production-upload access?",
    shouldAnswer: true,
    expectedPhraseGroups: [
      ["platform"],
      ["producer"],
      ["client folders"],
      ["production"],
    ],
    expectedPaths: ["onboarding-new-dev.md"],
  },

  // --------------------------------------------------
  // UI style guide
  // --------------------------------------------------

  {
    question:
      "What font rules apply inside a playable?",
    shouldAnswer: true,
    expectedPhraseGroups: [
      ["system font"],
      ["embedded fonts"],
      ["logo"],
      ["cta"],
      ["subset", "subsetted"],
    ],
    expectedPaths: ["style-guide-ui.md"],
  },

  {
    question:
      "What must happen after a playable reaches a fail state?",
    shouldAnswer: true,
    expectedPhraseGroups: [
      ["retry"],
      ["one tap", "1 tap"],
    ],
    expectedPaths: ["style-guide-ui.md"],
  },

  {
    question:
      "What is allowed on an end card?",
    shouldAnswer: true,
    expectedPhraseGroups: [
      ["logo"],
      ["one line", "1 line"],
      ["cta"],
      ["nothing else"],
    ],
    expectedPaths: ["style-guide-ui.md"],
  },

  // --------------------------------------------------
  // Company overview
  // --------------------------------------------------

  {
    question:
      "How is Lumen Playables organized?",
    shouldAnswer: true,
    expectedPhraseGroups: [
      ["three production pods", "three pods", "3 production pods", "3 pods"],
      ["nova"],
      ["orbit"],
      ["flare"],
      ["platform"],
    ],
    expectedPaths: ["company-overview.md"],
  },

  {
    question:
      "Who communicates with clients, and is the Platform team client-facing?",
    shouldAnswer: true,
    expectedPhraseGroups: [
      ["producer"],
      ["platform"],
      ["not", "never"],
      ["client-facing", "client facing"],
    ],
    expectedPaths: ["company-overview.md"],
  },

  {
    question:
      "How long does Lumen normally take to deliver a new concept versus an iteration?",
    shouldAnswer: true,
    expectedPhraseGroups: [
      ["10 business days"],
      ["3 business days"],
    ],
    expectedPaths: ["company-overview.md"],
  },

  {
    question:
      "About how many playables does Lumen deliver each month?",
    shouldAnswer: true,
    expectedPhraseGroups: [
      ["60"],
    ],
    expectedPaths: ["company-overview.md"],
  },

  // --------------------------------------------------
  // Cross-document questions
  // --------------------------------------------------

  {
    question:
      "A new developer is preparing a Meta playable. When can they own a new concept, and what interaction timing constraint must that Meta build satisfy?",
    shouldAnswer: true,
    expectedPhraseGroups: [
      ["fourth week", "week 4", "4th week"],
      ["4 seconds", "four seconds"],
    ],
    expectedPaths: [
      "onboarding-new-dev.md",
      "network-specs-unity-meta.md",
    ],
  },

  {
    question:
      "Who owns the build pipeline, and what March 2026 fix protects it from another stage-order regression?",
    shouldAnswer: true,
    expectedPhraseGroups: [
      ["platform"],
      ["stage order"],
      ["ci"],
    ],
    expectedPaths: [
      "company-overview.md",
      "incident-postmortem-2026-03.md",
    ],
  },

  // --------------------------------------------------
  // Out-of-corpus
  // --------------------------------------------------

  {
    question:
      "What laptop model is issued to new developers?",
    shouldAnswer: false,
    expectedPhraseGroups: [],
    expectedPaths: [],
  },

  {
    question:
      "What is the maximum salary for a pod producer?",
    shouldAnswer: false,
    expectedPhraseGroups: [],
    expectedPaths: [],
  },

  {
    question:
      "Which cloud provider hosts the production CDN?",
    shouldAnswer: false,
    expectedPhraseGroups: [],
    expectedPaths: [],
  },

  {
    question:
      "How many annual vacation days does a Platform engineer receive?",
    shouldAnswer: false,
    expectedPhraseGroups: [],
    expectedPaths: [],
  },
];