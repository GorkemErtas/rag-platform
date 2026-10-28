export interface RagEvaluationCase {
  question: string;
  shouldAnswer: boolean;

  /**
   * All phrase groups must be satisfied.
   *
   * Each inner array represents alternatives:
   * ["one", "1"] means either "one" OR "1" is acceptable.
   */
  expectedPhraseGroups: string[][];

  /**
   * At least one of these source paths should be present
   * for answerable questions.
   */
  expectedPaths: string[];
  requireAllExpectedPaths?: boolean;
}

export const ragEvaluationCases: RagEvaluationCase[] = [
  // --------------------------------------------------
  // Playable brief guidelines
  // --------------------------------------------------

  {
    question:
      "What information must be included in a valid playable brief?",
    shouldAnswer: true,
    expectedPhraseGroups: [
      ["core loop"],
      ["target audience"],
      ["tone"],
      ["visual style"],
      ["call to action", "cta"],
      ["network-specific", "network specific"],
    ],
    expectedPaths: ["playable-brief-guidelines.md"],
  },

  {
    question:
      "How quickly must the player be able to interact with a playable?",
    shouldAnswer: true,
    expectedPhraseGroups: [
      ["3 seconds", "three seconds"],
    ],
    expectedPaths: ["playable-brief-guidelines.md"],
  },

  {
    question:
      "What should we do if an intro lasts longer than three seconds?",
    shouldAnswer: true,
    expectedPhraseGroups: [
      ["skippable", "skip"],
    ],
    expectedPaths: ["playable-brief-guidelines.md"],
  },

  {
    question:
      "A client wants three different gameplay mechanics in one playable. How should we handle the brief?",
    shouldAnswer: true,
    expectedPhraseGroups: [
      ["escalate", "escalated", "escalation"],
      ["pod producer", "producer"],
    ],
    expectedPaths: ["playable-brief-guidelines.md"],
  },

  // --------------------------------------------------
  // QA checklist
  // --------------------------------------------------

  {
    question:
      "What checks must pass before a playable can be delivered to a client?",
    shouldAnswer: true,
    expectedPhraseGroups: [
      ["size"],
      ["3 seconds", "three seconds"],
      ["localization"],
      ["sound", "audio"],
      ["memory"],
    ],
    expectedPaths: ["qa-checklist.md"],
  },

  {
  question:
    "An AppLovin build still makes analytics requests. Can it be delivered?",
  shouldAnswer: true,
  expectedPhraseGroups: [
    ["no", "cannot", "can't", "blocked"],
    ["outbound"],
    ["analytics"],
  ],
  expectedPaths: [
    "qa-checklist.md",
    "network-specs-applovin.md",
  ],
},

  {
    question:
      "What audio behavior should QA verify before delivery?",
    shouldAnswer: true,
    expectedPhraseGroups: [
      ["mute"],
      [
        "no audio autoplay",
        "no autoplay",
        "before first interaction",
      ],
    ],
    expectedPaths: ["qa-checklist.md"],
  },

  {
    question:
      "How do we check for memory problems before delivering a playable?",
    shouldAnswer: true,
    expectedPhraseGroups: [
      ["three full loops", "three loops", "3 full loops", "3 loops"],
      ["no growth", "memory growth"],
    ],
    expectedPaths: ["qa-checklist.md"],
  },

  // --------------------------------------------------
  // UI style guide
  // --------------------------------------------------

  {
    question:
      "How many primary CTAs may be visible at the same time?",
    shouldAnswer: true,
    expectedPhraseGroups: [
      ["one", "1"],
      ["primary cta"],
    ],
    expectedPaths: ["style-guide-ui.md"],
  },

  {
    question:
      "What should happen when the CTA does not have enough contrast with the background?",
    shouldAnswer: true,
    expectedPhraseGroups: [
      ["4.5:1", "4.5"],
      ["dark scrim", "scrim"],
    ],
    expectedPaths: ["style-guide-ui.md"],
  },

  {
    question:
      "Does a 25-second playable need to show progress to the player?",
    shouldAnswer: true,
    expectedPhraseGroups: [
      ["yes"],
      ["progress"],
      ["20 seconds", "twenty seconds"],
    ],
    expectedPaths: ["style-guide-ui.md"],
  },

  {
    question:
      "What elements are allowed on the end card, and should store badges be included in the creative?",
    shouldAnswer: true,
    expectedPhraseGroups: [
      ["logo"],
      ["one line", "1 line"],
      ["cta", "call to action"],
      [
        "network wrapper",
        "not baked",
        "not included",
        "never baked",
      ],
    ],
    expectedPaths: ["style-guide-ui.md"],
  },

  // --------------------------------------------------
  // Out-of-corpus / abstention
  // --------------------------------------------------

  {
    question:
      "Which analytics provider should be used for playable event tracking?",
    shouldAnswer: false,
    expectedPhraseGroups: [],
    expectedPaths: [],
  },

  {
    question:
      "What frame rate must every playable maintain?",
    shouldAnswer: false,
    expectedPhraseGroups: [],
    expectedPaths: [],
  },

  {
    question:
      "What maximum texture resolution is allowed in a playable?",
    shouldAnswer: false,
    expectedPhraseGroups: [],
    expectedPaths: [],
  },
];