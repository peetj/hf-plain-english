const BUILT_IN_TERMS = [
  {
    terms: ["instruct", "instruction tuned", "instruction-tuned", "instruct model"],
    title: "Instruct",
    answer: "Instruct means the model has been tuned to follow user instructions, such as answering a question, summarising text, or explaining code. It is usually a better starting point for chat than a base model.",
    sourceLabel: "Model naming convention"
  },
  {
    terms: ["base", "base model"],
    title: "Base model",
    answer: "A base model mainly predicts or continues text. It may not behave like a helpful assistant unless it has also been instruction tuned or chat tuned.",
    sourceLabel: "Glossary"
  },
  {
    terms: ["1b", "2b", "3b", "4b", "7b", "8b", "13b", "30b", "billion parameters"],
    title: "B model size labels",
    answer: "In model names, B usually means billion parameters. For example, 1B means about 1 billion learned numbers. Bigger models often need more memory, but bigger is not automatically better for every use.",
    sourceLabel: "Glossary"
  },
  {
    terms: ["q4_k_m", "q4", "q5_k_m", "quantisation", "quantization", "quantised", "quantized"],
    title: "Quantisation",
    answer: "Quantisation stores the model weights using fewer bits so the model uses less memory and disk space. Q4_K_M is a common 4-bit GGUF option that often balances size and quality for local testing.",
    sourceLabel: "Glossary"
  },
  {
    terms: ["chat template", "chat templates", "apply_chat_template"],
    title: "Chat template",
    answer: "A chat template is the message format a chat model expects. It tells the software how to wrap user, assistant, and system messages before the model generates an answer. The wrong template can make a good model behave oddly.",
    sourceLabel: "Glossary"
  },
  {
    terms: ["benchmark", "benchmarks", "evaluation benchmark", "leaderboard", "eval", "evals"],
    title: "Evaluation benchmark",
    answer: "An evaluation benchmark is a test used to compare model performance. It can be useful evidence, but it does not guarantee the model is right for your task, safe to use, or practical on your computer.",
    sourceLabel: "Glossary"
  },
  {
    terms: ["gguf"],
    title: "GGUF",
    answer: "GGUF is a model file format commonly used by local language-model apps and llama.cpp-based tools. For beginners, a GGUF file is often easier to try locally than raw full-precision weights.",
    sourceLabel: "Glossary"
  },
  {
    terms: ["downloads", "download count", "likes"],
    title: "Downloads and likes",
    answer: "Downloads and likes are popularity signals on Hugging Face. They can help identify active or widely tried models, but they do not prove the model is safe, high quality, or right for your computer.",
    sourceLabel: "Hugging Face metadata"
  },
  {
    terms: ["model card", "readme"],
    title: "Model card",
    answer: "A model card is the README-style explanation on a model page. It may describe intended use, examples, limits, licence notes, training details, and warnings. Some model cards are incomplete.",
    sourceLabel: "Hugging Face page"
  },
  {
    terms: ["license", "licence", "commercial use", "commercial"],
    title: "Licence",
    answer: "The licence controls how the model can be used or shared. Licence metadata can be missing or incomplete, so check the original model page before relying on it, especially for business use.",
    sourceLabel: "Trust and licence guidance"
  }
];

const FALLBACK_FOLLOW_UPS = [
  "What does Instruct mean?",
  "What does this model name mean?",
  "Will this run on my computer?",
  "Which file should I download?",
  "Can I use this commercially?"
];

export function answerLearnerQuestion(question, context = {}) {
  const cleanQuestion = String(question || "").trim();

  if (!cleanQuestion) {
    return {
      status: "empty",
      title: "Ask a question",
      answer: "Type a question about the current model page, the suggested starting candidate, a file name, hardware fit, licence, or an AI term.",
      sourceLabel: "Local helper",
      followUps: FALLBACK_FOLLOW_UPS
    };
  }

  const normalizedQuestion = normalizeText(cleanQuestion);
  const explicitTermAnswer = extractExplicitTerm(cleanQuestion)
    ? answerTermQuestion(cleanQuestion, normalizedQuestion, context)
    : null;

  return answerModelNameQuestion(normalizedQuestion, context)
    || explicitTermAnswer
    || answerLicenceQuestion(normalizedQuestion, context)
    || answerPopularityQuestion(normalizedQuestion, context)
    || answerFileQuestion(normalizedQuestion, context)
    || answerHardwareQuestion(normalizedQuestion, context)
    || answerToolQuestion(normalizedQuestion, context)
    || answerPurposeQuestion(normalizedQuestion, context)
    || answerTermQuestion(cleanQuestion, normalizedQuestion, context)
    || createUnknownAnswer();
}

function answerTermQuestion(question, normalizedQuestion, context) {
  const explicitTerm = extractExplicitTerm(question);
  const definitions = buildDefinitions(context);
  const candidates = explicitTerm ? [normalizeText(explicitTerm), normalizedQuestion] : [normalizedQuestion];

  for (const candidate of candidates) {
    const directMatch = definitions.find((definition) => definition.terms.some((term) => normalizeText(term) === candidate));

    if (directMatch) {
      return createDefinitionAnswer(directMatch);
    }
  }

  const matchingDefinition = definitions.find((definition) =>
    definition.terms.some((term) => includesWordLike(normalizedQuestion, normalizeText(term)))
  );

  return matchingDefinition ? createDefinitionAnswer(matchingDefinition) : null;
}

function answerModelNameQuestion(normalizedQuestion, context) {
  const modelId = getActiveModelId(context);

  if (!modelId || !/(model name|name mean|break.*down|explain.*name)/i.test(normalizedQuestion)) {
    return null;
  }

  const chunks = explainModelName(modelId);

  if (chunks.length === 0) {
    return null;
  }

  return {
    status: "answered",
    title: "Model name breakdown",
    answer: `${modelId} appears to contain these clues: ${chunks.map((chunk) => `${chunk.label}: ${chunk.explanation}`).join(" ")}`,
    sourceLabel: "Model name",
    followUps: ["What does Instruct mean?", "What does Q4_K_M mean?", "Will this run on my computer?"]
  };
}

function answerFileQuestion(normalizedQuestion, context) {
  if (!/(which file|download|file|gguf|safetensors|weights)/i.test(normalizedQuestion)) {
    return null;
  }

  const files = Array.isArray(context.interpreted?.relevantFiles) ? context.interpreted.relevantFiles : [];
  const visibleFiles = files.filter((file) => !file.formats?.includes("configuration files"));
  const ggufFile = visibleFiles.find((file) => file.path?.toLowerCase().endsWith(".gguf"));
  const firstFile = ggufFile || visibleFiles[0];

  if (!firstFile) {
    return {
      status: "partial",
      title: "Files",
      answer: "I cannot see a clear model file from the current page data. Open the Files tab on Hugging Face and look for model weight files such as .gguf, .safetensors, .bin, .onnx, or MLX files.",
      sourceLabel: "Repository files",
      followUps: ["What is GGUF?", "What is safetensors?"]
    };
  }

  return {
    status: "answered",
    title: "File to inspect first",
    answer: `Start by inspecting ${firstFile.path}. ${firstFile.explanation || "This looks like one of the more relevant files for running the model."} Do not download until the licence and hardware fit also look acceptable.`,
    sourceLabel: "Repository files",
    followUps: ["Will this run on my computer?", "What does GGUF mean?", "Can I use this commercially?"]
  };
}

function answerHardwareQuestion(normalizedQuestion, context) {
  if (!/(run|fit|computer|pc|gpu|vram|ram|hardware|local)/i.test(normalizedQuestion)) {
    return null;
  }

  const estimate = context.hardwareEstimate;

  if (!estimate) {
    return {
      status: "partial",
      title: "Hardware fit",
      answer: "I do not have a current model-page hardware estimate yet. Use the saved hardware box in Find a Model for Me, then open a specific Hugging Face model page.",
      sourceLabel: "Hardware profile",
      followUps: ["What is VRAM?", "What does Q4_K_M mean?"]
    };
  }

  return {
    status: estimate.fit?.overall === "unknown" ? "partial" : "answered",
    title: "Hardware fit",
    answer: `${estimate.explanation} Saved profile: ${formatHardwareProfile(context.hardwareProfile)}. Treat this as a cautious estimate, not an exact requirement.`,
    sourceLabel: "Local hardware estimate",
    followUps: ["Which file should I download?", "What is VRAM?", "What does quantisation mean?"]
  };
}

function answerLicenceQuestion(normalizedQuestion, context) {
  if (!/(licen[cs]e|commercial|business|legal|allowed|permission)/i.test(normalizedQuestion)) {
    return null;
  }

  const licence = context.model?.license || context.interpreted?.licence?.value;

  return {
    status: licence ? "answered" : "partial",
    title: "Licence",
    answer: licence
      ? `The detected licence metadata is ${licence}. That is only a pointer; check the model page licence text before relying on it, especially for commercial use. This extension does not provide legal advice.`
      : "I do not see clear licence metadata for this page. Missing licence metadata is not permission. Check the model page and model card before using the model seriously.",
    sourceLabel: "Hugging Face metadata",
    followUps: ["What is a model card?", "Can I use this commercially?"]
  };
}

function answerToolQuestion(normalizedQuestion, context) {
  if (!/(tool|lm studio|ollama|python|transformers|how.*run|what.*use|next step)/i.test(normalizedQuestion)) {
    return null;
  }

  const recommendation = context.recommendation;

  if (!recommendation) {
    return {
      status: "partial",
      title: "What to use",
      answer: "I do not have a current page recommendation yet. Open a specific model page so I can inspect its files and task metadata.",
      sourceLabel: "Local recommendation",
      followUps: ["What is LM Studio?", "What is Ollama?", "Which file should I download?"]
    };
  }

  const reasons = recommendation.reasons?.length ? ` Reason: ${recommendation.reasons.join(" ")}` : "";

  return {
    status: recommendation.confidence === "low" ? "partial" : "answered",
    title: "What to use",
    answer: `The current recommendation is ${recommendation.primaryTool}.${reasons}`,
    sourceLabel: "Local recommendation",
    followUps: ["Will this run on my computer?", "Which file should I download?"]
  };
}

function answerPopularityQuestion(normalizedQuestion, context) {
  if (!/(download|downloads|like|likes|popular|trusted|good)/i.test(normalizedQuestion)) {
    return null;
  }

  if (/(which file|file should|download.*file|file.*download)/i.test(normalizedQuestion)) {
    return null;
  }

  const model = context.model || context.modelFinderRecommendation?.model;

  if (!model) {
    return null;
  }

  return {
    status: "answered",
    title: "Popularity signals",
    answer: `${model.modelId || model.modelName || "This model"} has ${formatCount(model.downloads)} downloads and ${formatCount(model.likes)} likes in the data I can see. That is useful popularity evidence, but still check the model card, licence, files, and hardware fit before downloading.`,
    sourceLabel: "Hugging Face metadata",
    followUps: ["What is a model card?", "Can I use this commercially?", "Will this run on my computer?"]
  };
}

function answerPurposeQuestion(normalizedQuestion, context) {
  if (!/(what.*is|good for|use for|purpose|chat|code|embedding|image)/i.test(normalizedQuestion)) {
    return null;
  }

  const interpreted = context.interpreted;
  const modelKind = interpreted?.modelKind?.value;
  const task = interpreted?.primaryTask?.value || context.model?.pipelineTag;

  if (!modelKind && !task) {
    return null;
  }

  return {
    status: "answered",
    title: "What it is for",
    answer: `This looks like ${withIndefiniteArticle(describeModelKindLabel(modelKind || "model"))} ${task ? `for ${task}` : ""}. ${explainKind(modelKind, task)}`,
    sourceLabel: "Parsed model metadata",
    followUps: ["What does Instruct mean?", "Which file should I download?", "What tool should I use?"]
  };
}

function buildDefinitions(context) {
  const glossaryDefinitions = (Array.isArray(context.glossary) ? context.glossary : []).map((entry) => ({
    terms: [entry.term, entry.id],
    title: entry.term,
    answer: `${entry.short} ${entry.detail}`,
    sourceLabel: "Glossary"
  }));
  const tooltipDefinitions = (Array.isArray(context.tooltips) ? context.tooltips : []).map((entry) => ({
    terms: [...(entry.terms || []), entry.title, entry.id],
    title: entry.title,
    answer: entry.text,
    sourceLabel: "Tooltip glossary"
  }));

  return [...BUILT_IN_TERMS, ...glossaryDefinitions, ...tooltipDefinitions];
}

function createDefinitionAnswer(definition) {
  return {
    status: "answered",
    title: definition.title,
    answer: definition.answer,
    sourceLabel: definition.sourceLabel,
    followUps: ["What does this model name mean?", "Will this run on my computer?", "Which file should I download?"]
  };
}

function explainModelName(modelId) {
  const modelName = String(modelId).split("/").pop() || "";
  const parts = modelName.split(/[-_/]+/).filter(Boolean);
  const chunks = [];
  const seen = new Set();
  const quantisationLabels = [...modelName.matchAll(/\b(?:IQ[1-4]|Q[2-8])(?:_[A-Z0-9]+)+\b/gi)]
    .map((match) => match[0]);

  for (const label of quantisationLabels) {
    chunks.push({
      label,
      explanation: "a quantisation label, meaning the model weights were compressed to use less memory."
    });
    seen.add(label.toLowerCase());
  }

  for (const part of parts) {
    if (/^q[2-8]$/i.test(part) && quantisationLabels.some((label) => label.toLowerCase().startsWith(`${part.toLowerCase()}_`))) {
      continue;
    }

    const chunk = explainModelNamePart(part, part.toLowerCase());

    if (chunk && !seen.has(chunk.label.toLowerCase())) {
      chunks.push(chunk);
      seen.add(chunk.label.toLowerCase());
    }
  }

  return chunks;
}

function explainModelNamePart(part, normalized) {
  if (/^\d+(?:\.\d+)?b$/i.test(part)) {
    return {
      label: part,
      explanation: "model size shorthand, usually meaning billions of parameters."
    };
  }

  if (normalized === "instruct" || normalized === "it") {
    return {
      label: part,
      explanation: "tuned to follow instructions rather than only continue text."
    };
  }

  if (normalized === "chat") {
    return {
      label: part,
      explanation: "likely tuned for conversation."
    };
  }

  if (/^q[2-8]/i.test(part) || /^iq[1-4]/i.test(part)) {
    return {
      label: part,
      explanation: "a quantisation label, meaning the model weights were compressed to use less memory."
    };
  }

  if (normalized === "gguf") {
    return {
      label: part,
      explanation: "a local-friendly file format used by llama.cpp-based tools and many desktop apps."
    };
  }

  if (normalized === "fp16" || normalized === "bf16" || normalized === "fp32") {
    return {
      label: part,
      explanation: "a number format for model weights. It affects memory use."
    };
  }

  if (/^v?\d+(?:\.\d+)+$/i.test(part)) {
    return {
      label: part,
      explanation: "probably a version number."
    };
  }

  return null;
}

function createUnknownAnswer() {
  return {
    status: "unknown",
    title: "I cannot answer that safely yet",
    answer: "I do not have enough local understanding to answer that question reliably. I can currently help with model names, common AI terms, files, downloads and likes, licence, hardware fit, and what to try next.",
    sourceLabel: "Local helper limits",
    followUps: FALLBACK_FOLLOW_UPS
  };
}

function extractExplicitTerm(question) {
  const quoted = String(question).match(/["'`\u201c\u201d\u2018\u2019]([^"'`\u201c\u201d\u2018\u2019]+)["'`\u201c\u201d\u2018\u2019]/);

  if (quoted?.[1]) {
    return quoted[1];
  }

  const meanMatch = String(question).match(/\b(?:what does|what is|explain)\s+(.+?)(?:\s+mean|\?|$)/i);

  if (!meanMatch?.[1]) {
    return "";
  }

  return meanMatch[1]
    .replace(/\b(the|a|an|term|word|label)\b/gi, " ")
    .trim();
}

function getActiveModelId(context) {
  return context.model?.modelId || context.interpreted?.modelId || context.modelFinderRecommendation?.model?.modelId || "";
}

function includesWordLike(text, term) {
  if (!term || term.length < 2) {
    return false;
  }

  if (/^[a-z0-9_+-]+$/i.test(term)) {
    return new RegExp(`(^|[^a-z0-9_+-])${escapeRegExp(term)}([^a-z0-9_+-]|$)`, "i").test(text);
  }

  return text.includes(term);
}

function explainKind(kind, task) {
  if (kind === "instruct") {
    return "It should be better at following prompts than a raw base model, assuming the files and tool route are suitable.";
  }

  if (kind === "chat") {
    return "It is likely intended for back-and-forth conversation.";
  }

  if (kind === "base") {
    return "It may not behave like a helpful assistant without extra instruction or chat tuning.";
  }

  if (kind === "embedding" || task === "feature-extraction") {
    return "Embedding models are for search and matching, not normal chat.";
  }

  if (kind === "image" || task === "text-to-image") {
    return "Image models need specialist image-generation tools rather than a chat runner.";
  }

  if (kind === "audio") {
    return "Audio models are for speech or sound tasks, so they usually need specialist audio tooling.";
  }

  if (kind === "multimodal") {
    return "Multimodal models work with more than one kind of input, such as text plus images. Check the model card for the exact setup.";
  }

  if (kind === "code-focused") {
    return "Code-focused models are aimed at programming tasks, but they still need the right files and may need instruction tuning for chat-style help.";
  }

  if (kind === "reranker") {
    return "Rerankers reorder search results by relevance. They are useful inside search systems, not as normal chatbots.";
  }

  if (kind === "classifier") {
    return "Classifiers assign labels or categories. They answer with a category rather than behaving like a chat assistant.";
  }

  if (kind === "unclear") {
    return "The page has mixed or weak clues, so check the model card examples before choosing a tool.";
  }

  return "Check the model card before assuming it fits your use.";
}

function describeModelKindLabel(kind) {
  const labels = {
    "code-focused": "code-focused",
    instruct: "instruction-following",
    image: "image-related",
    multimodal: "text-plus-media",
    reranker: "search reranking",
    classifier: "classification",
    unclear: "unclear"
  };

  return labels[kind] || kind;
}

function formatHardwareProfile(profile) {
  const parts = [];

  if (profile?.operatingSystem) {
    parts.push(profile.operatingSystem);
  }

  if (Number.isFinite(Number(profile?.gpuVramGb))) {
    parts.push(`${profile.gpuVramGb} GB VRAM`);
  }

  if (Number.isFinite(Number(profile?.systemRamGb))) {
    parts.push(`${profile.systemRamGb} GB RAM`);
  }

  return parts.length ? parts.join(", ") : "saved hardware profile";
}

function formatCount(value) {
  return Number.isFinite(Number(value)) ? Number(value).toLocaleString() : "unknown";
}

function withIndefiniteArticle(value) {
  const text = String(value || "model");
  return /^[aeiou]/i.test(text) ? `an ${text}` : `a ${text}`;
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, "\"")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
