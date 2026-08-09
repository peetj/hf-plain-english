const SECTION_RULES = [
  {
    id: "intendedUse",
    label: "What the author says it is for",
    missingLabel: "intended use",
    explanation: "This helps you understand the job the model author designed or recommends it for.",
    patterns: [
      /\bintended\s+use\b/i,
      /\buse\s+cases?\b/i,
      /\buses?\b/i,
      /\bapplications?\b/i,
      /\bwhat\s+(?:is|can)\s+this\s+model\b/i
    ]
  },
  {
    id: "limitations",
    label: "Limits to watch",
    missingLabel: "limitations",
    explanation: "This is where the author may explain what the model is bad at, unreliable for, or not meant to do.",
    patterns: [
      /\blimitations?\b/i,
      /\bcaveats?\b/i,
      /\bout\s+of\s+scope\b/i,
      /\bfailure\s+modes?\b/i,
      /\bknown\s+issues?\b/i
    ]
  },
  {
    id: "licenceNotes",
    label: "Licence notes",
    missingLabel: "licence notes",
    explanation: "This may add plain-language usage restrictions beyond the short licence tag shown by Hugging Face.",
    patterns: [
      /\blicen[cs]e\b/i,
      /\blicen[cs]ing\b/i,
      /\busage\s+rights?\b/i,
      /\bterms?\s+of\s+use\b/i
    ]
  },
  {
    id: "hardwareExamples",
    label: "Running or setup clues",
    missingLabel: "hardware or inference examples",
    explanation: "This may show tools, setup notes, memory hints, or example code. Treat examples as author guidance, not guaranteed one-click instructions.",
    patterns: [
      /\bhow\s+to\s+use\b/i,
      /\binference\b/i,
      /\brunning\b/i,
      /\bquick\s*start\b/i,
      /\bexamples?\b/i,
      /\bdeployment\b/i,
      /\brequirements?\b/i,
      /\bhardware\b/i
    ]
  },
  {
    id: "trainingData",
    label: "Training data clues",
    missingLabel: "training data notes",
    explanation: "This may tell you what data the model learned from, which matters for bias, quality, and suitability.",
    patterns: [
      /\btraining\s+data\b/i,
      /\bdatasets?\b/i,
      /\bdata\b/i,
      /\bpretraining\b/i,
      /\bfine[-\s]?tuning\s+data\b/i
    ]
  },
  {
    id: "safetyWarnings",
    label: "Safety warnings",
    missingLabel: "safety warnings",
    explanation: "This may include warnings about harmful output, bias, misuse, sensitive domains, or content that needs extra care.",
    patterns: [
      /\bsafety\b/i,
      /\bethical\b/i,
      /\brisks?\b/i,
      /\bmisuse\b/i,
      /\bbias\b/i,
      /\bresponsible\s+use\b/i,
      /\bcontent\s+warning\b/i
    ]
  }
];

const MAX_SECTION_CHARACTERS = 1800;
const MAX_POINT_COUNT = 3;
const MAX_POINT_LENGTH = 210;
const MIN_POINT_LENGTH = 10;

/**
 * Extract conservative, source-grounded notes from a Hugging Face model card.
 *
 * The parser only trusts recognisable markdown headings. It does not infer
 * missing information from the model name, tags, or general model knowledge.
 *
 * @param {string} markdown
 * @returns {{
 *   found: boolean,
 *   summary: string,
 *   missingSummary: string,
 *   sections: Array<{
 *     id: string,
 *     label: string,
 *     missingLabel: string,
 *     explanation: string,
 *     status: "found" | "missing",
 *     sourceHeading: string,
 *     points: string[]
 *   }>
 * }}
 */
export function parseModelCardInsights(markdown) {
  const source = typeof markdown === "string" ? markdown : "";
  const hasReadableMarkdown = source.trim().length > 0;
  const parsedSections = parseMarkdownSections(source);
  const usedSectionIndexes = new Set();

  const sections = SECTION_RULES.map((rule) => {
    const matchingSections = parsedSections
      .map((section, index) => ({ section, index }))
      .filter(({ section, index }) => !usedSectionIndexes.has(index) && matchesRule(section.heading, rule));

    if (matchingSections.length === 0) {
      return createMissingResult(rule);
    }

    const { section, index } = matchingSections[0];
    usedSectionIndexes.add(index);
    const points = extractShortPoints(section.content);

    if (points.length === 0) {
      return createMissingResult(rule);
    }

    return {
      id: rule.id,
      label: rule.label,
      missingLabel: rule.missingLabel,
      explanation: rule.explanation,
      status: "found",
      sourceHeading: section.heading,
      points
    };
  });

  const foundLabels = sections
    .filter((section) => section.status === "found")
    .map((section) => section.missingLabel);
  const missingLabels = sections
    .filter((section) => section.status === "missing")
    .map((section) => section.missingLabel);

  return {
    found: foundLabels.length > 0,
    summary: foundLabels.length > 0
      ? `The model card has visible notes about ${formatHumanList(foundLabels)}.`
      : !hasReadableMarkdown
        ? "No readable model card text was available for this repository."
      : "The model card did not expose recognisable sections for intended use, limits, licence, running examples, training data, or safety.",
    missingSummary: missingLabels.length > 0
      ? `Not clearly found in the model card: ${formatHumanList(missingLabels)}.`
      : "All tracked model-card sections were found.",
    sections
  };
}

function parseMarkdownSections(markdown) {
  const withoutFrontMatter = stripFrontMatter(markdown);
  const lines = withoutFrontMatter.split(/\r?\n/);
  const sections = [];
  let current = null;

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,4})\s+(.+?)\s*#*\s*$/);

    if (headingMatch) {
      if (current) {
        sections.push(current);
      }

      current = {
        heading: cleanInlineMarkdown(headingMatch[2]),
        content: ""
      };
      continue;
    }

    if (current) {
      current.content += `${line}\n`;
    }
  }

  if (current) {
    sections.push(current);
  }

  return sections.filter((section) => section.heading && section.content.trim());
}

function stripFrontMatter(markdown) {
  return markdown.replace(/^---\s*[\s\S]*?\n---\s*/u, "");
}

function matchesRule(heading, rule) {
  const normalized = cleanInlineMarkdown(heading).toLowerCase();
  return rule.patterns.some((pattern) => pattern.test(normalized));
}

function createMissingResult(rule) {
  return {
    id: rule.id,
    label: rule.label,
    missingLabel: rule.missingLabel,
    explanation: rule.explanation,
    status: "missing",
    sourceHeading: "",
    points: []
  };
}

function extractShortPoints(content) {
  const prose = removeCodeBlocks(content)
    .split(/\r?\n/)
    .map(cleanMarkdownLine)
    .filter(Boolean)
    .join("\n")
    .slice(0, MAX_SECTION_CHARACTERS);

  const bullets = prose
    .split(/\n+/)
    .map((line) => line.replace(/^[-*+]\s+|^\d+\.\s+/u, "").trim())
    .filter((line) => line.length >= MIN_POINT_LENGTH);

  const candidates = bullets.length > 0
    ? bullets
    : prose.split(/(?<=[.!?])\s+/u).map((sentence) => sentence.trim());

  const seen = new Set();
  const points = [];

  for (const candidate of candidates) {
    const point = trimPoint(candidate);
    const key = point.toLowerCase();

    if (point.length < MIN_POINT_LENGTH || seen.has(key)) {
      continue;
    }

    seen.add(key);
    points.push(point);

    if (points.length >= MAX_POINT_COUNT) {
      break;
    }
  }

  return points;
}

function removeCodeBlocks(text) {
  return text.replace(/```[\s\S]*?```/gu, " ").replace(/`[^`]+`/gu, " ");
}

function cleanMarkdownLine(line) {
  return cleanInlineMarkdown(line)
    .replace(/^\s*>+\s?/u, "")
    .replace(/\|/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function cleanInlineMarkdown(text) {
  return String(text)
    .replace(/!\[[^\]]*\]\([^)]*\)/gu, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/gu, "$1")
    .replace(/[*_~#]/gu, "")
    .replace(/<[^>]+>/gu, "")
    .trim();
}

function trimPoint(text) {
  const cleaned = cleanInlineMarkdown(text).replace(/\s+/gu, " ").trim();

  if (cleaned.length <= MAX_POINT_LENGTH) {
    return cleaned;
  }

  return `${cleaned.slice(0, MAX_POINT_LENGTH - 1).trimEnd()}...`;
}

function formatHumanList(items) {
  if (items.length <= 1) {
    return items[0] || "";
  }

  if (items.length === 2) {
    return `${items[0]} and ${items[1]}`;
  }

  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}
