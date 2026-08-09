import { parseModelCardInsights } from "./model-card-parser.js";

const FORMAT_RULES = [
  {
    id: "gguf",
    label: "GGUF",
    source: "filename",
    confidence: "high",
    test: (file) => file.path.toLowerCase().endsWith(".gguf")
  },
  {
    id: "safetensors",
    label: "safetensors",
    source: "filename",
    confidence: "high",
    test: (file) => file.path.toLowerCase().endsWith(".safetensors")
  },
  {
    id: "pytorch",
    label: "PyTorch binary",
    source: "filename",
    confidence: "high",
    test: (file) => /(^|\/)(pytorch_model|model).*\.(bin|pt|pth)$/i.test(file.path)
  },
  {
    id: "onnx",
    label: "ONNX",
    source: "filename",
    confidence: "high",
    test: (file) => file.path.toLowerCase().endsWith(".onnx")
  },
  {
    id: "mlx",
    label: "MLX",
    source: "filename",
    confidence: "high",
    test: (file) => /(^|\/|[-_])mlx($|\/|[-_.])/i.test(file.path)
  },
  {
    id: "tokenizer",
    label: "tokenizer files",
    source: "filename",
    confidence: "high",
    test: (file) => /(^|\/)(tokenizer|vocab|merges|sentencepiece|special_tokens_map)/i.test(file.path)
  },
  {
    id: "config",
    label: "configuration files",
    source: "filename",
    confidence: "high",
    test: (file) => /(^|\/)(config|generation_config|preprocessor_config|model_index)\.json$/i.test(file.path)
  }
];

const QUANTISATION_PATTERNS = [
  /\bIQ[1-4](?:_[A-Z0-9]+)*\b/gi,
  /\bQ[2-8](?:_[A-Z0-9]+)*\b/gi,
  /\b(?:FP16|BF16|FP32|INT8)\b/gi,
  /\b(?:4-bit|8-bit)\b/gi
];

const MODEL_KIND_LABELS = [
  "chat",
  "instruct",
  "base",
  "code-focused",
  "embedding",
  "image",
  "audio",
  "multimodal",
  "reranker",
  "classifier"
];

const MODEL_KIND_PRIORITY = [
  "reranker",
  "embedding",
  "classifier",
  "image",
  "audio",
  "multimodal",
  "code-focused",
  "chat",
  "instruct",
  "base"
];

const PIPELINE_KIND_RULES = [
  { pattern: /sentence-similarity|feature-extraction/i, kind: "embedding", score: 9 },
  { pattern: /text-to-image|image-to-image|unconditional-image-generation/i, kind: "image", score: 9 },
  { pattern: /automatic-speech-recognition|text-to-speech|text-to-audio|audio-classification|audio-to-audio/i, kind: "audio", score: 9 },
  { pattern: /image-text-to-text|visual-question-answering|document-question-answering/i, kind: "multimodal", score: 9 },
  { pattern: /zero-shot-classification|token-classification|text-classification|image-classification/i, kind: "classifier", score: 8 },
  { pattern: /conversational/i, kind: "chat", score: 8 }
];

const LIBRARY_KIND_RULES = [
  { pattern: /^sentence-transformers$/i, kind: "embedding", score: 8 },
  { pattern: /^diffusers$/i, kind: "image", score: 8 },
  { pattern: /cross-encoder/i, kind: "reranker", score: 7 }
];

const TEXT_KIND_RULES = [
  { pattern: /\b(reranker|rerank|reranking|cross-encoder|cross encoder)\b/i, kind: "reranker", score: 8 },
  { pattern: /\b(embedding|embeddings|sentence-transformers|sentence transformers|retrieval|semantic search)\b/i, kind: "embedding", score: 6 },
  { pattern: /\b(classifier|classification|sentiment analysis|sequence classification|token classification)\b/i, kind: "classifier", score: 6 },
  { pattern: /\b(text-to-image|image generation|diffusion|stable diffusion|image-to-image)\b/i, kind: "image", score: 6 },
  { pattern: /\b(audio|speech|whisper|asr|text-to-speech|text to speech)\b/i, kind: "audio", score: 6 },
  { pattern: /\b(multimodal|vision-language|vision language|vlm|image-text|image text|video-language)\b/i, kind: "multimodal", score: 6 },
  { pattern: /\b(code|coder|coding|programming|codegen|code-generation)\b/i, kind: "code-focused", score: 6 },
  { pattern: /\b(chat|conversational|assistant)\b/i, kind: "chat", score: 5 },
  { pattern: /\b(instruct|instruction|instruction-tuned|it)\b/i, kind: "instruct", score: 5 },
  { pattern: /\b(base|pretrained|foundation)\b/i, kind: "base", score: 5 }
];

const ARCHITECTURE_KIND_RULES = [
  { pattern: /SentenceTransformer|Embedding/i, kind: "embedding", score: 7 },
  { pattern: /CrossEncoder|ForSequenceClassification|SequenceClassification/i, kind: "classifier", score: 7 },
  { pattern: /Whisper|Wav2Vec|Speech|Audio/i, kind: "audio", score: 7 },
  { pattern: /CLIP|Llava|LLaVA|VisionEncoderDecoder|Blip|Qwen2VL|Idefics|Florence|VLM/i, kind: "multimodal", score: 7 },
  { pattern: /StableDiffusion|Diffusion|UNet2D|AutoencoderKL/i, kind: "image", score: 7 },
  { pattern: /CausalLM/i, kind: "base", score: 2 }
];

/**
 * Convert normalized Hugging Face metadata into conservative interpreted facts.
 *
 * @param {object} model
 * @returns {{
 *   modelId: string,
 *   parameterCount: object,
 *   sizeCategory: object,
 *   modelKind: object,
 *   primaryTask: object,
 *   languages: object,
 *   architecture: object,
 *   licence: object,
 *   contextLength: object,
 *   formats: Array<object>,
 *   quantisations: Array<object>,
 *   relevantFiles: Array<object>,
 *   modelCardInsights: object,
 *   glossaryTermIds: Array<string>,
 *   facts: Array<object>,
 *   estimates: Array<object>,
 *   warnings: Array<string>
 * }}
 */
export function parseModelFacts(model) {
  const safeModel = model && typeof model === "object" ? model : {};
  const files = Array.isArray(safeModel.files) ? safeModel.files : [];
  const tags = Array.isArray(safeModel.tags) ? safeModel.tags : [];
  const modelCardMarkdown = typeof safeModel.modelCardMarkdown === "string" ? safeModel.modelCardMarkdown : "";
  const rawMetadata = safeModel.rawMetadata && typeof safeModel.rawMetadata === "object" ? safeModel.rawMetadata : {};

  const parameterCount = detectParameterCount(safeModel);
  const formats = detectFormats(files);
  const quantisations = detectQuantisations(files, tags, modelCardMarkdown, safeModel.safetensorsParameters);
  const relevantFiles = detectRelevantFiles(files, formats, quantisations);
  const modelKind = detectModelKind(safeModel, tags, modelCardMarkdown);
  const primaryTask = detectPrimaryTask(safeModel, tags);
  const contextLength = detectContextLength(rawMetadata, modelCardMarkdown);
  const modelCardInsights = parseModelCardInsights(modelCardMarkdown);
  const architecture = createKnownFact(safeModel.architecture, "metadata", "high");
  const languages = createKnownFact(safeModel.languages || [], "metadata", safeModel.languages?.length ? "high" : "low");
  const licence = createKnownFact(safeModel.license, "metadata", safeModel.license ? "high" : "low");
  const sizeCategory = categorizeModelSize(parameterCount.value);
  const glossaryTermIds = detectGlossaryTerms({
    model: safeModel,
    parameterCount,
    modelKind,
    primaryTask,
    formats,
    quantisations,
    contextLength
  });
  const warnings = buildWarnings(safeModel, parameterCount, formats);

  return {
    modelId: safeModel.modelId || "",
    parameterCount,
    sizeCategory,
    modelKind,
    primaryTask,
    languages,
    architecture,
    licence,
    contextLength,
    modelCardInsights,
    formats,
    quantisations,
    relevantFiles,
    glossaryTermIds,
    facts: buildFactList({
      parameterCount,
      modelKind,
      primaryTask,
      architecture,
      licence,
      contextLength,
      formats,
      quantisations
    }),
    estimates: [
      parameterCount,
      modelKind,
      primaryTask,
      contextLength
    ].filter((fact) => fact.source === "inference" || fact.confidence !== "high"),
    warnings
  };
}

function detectParameterCount(model) {
  const directParameters = numberOrNull(model.parameters);

  if (directParameters) {
    return createKnownFact(directParameters, "metadata", "high");
  }

  const safetensorsTotal = numberOrNull(model.rawMetadata?.safetensors?.total);

  if (safetensorsTotal) {
    return createKnownFact(safetensorsTotal, "metadata", "high");
  }

  if (model.safetensorsParameters && typeof model.safetensorsParameters === "object") {
    const parameterValues = Object.values(model.safetensorsParameters).filter(Number.isFinite);
    const total = parameterValues.reduce((sum, value) => sum + value, 0);

    if (total > 0) {
      return createKnownFact(total, "metadata", "high");
    }
  }

  const nameMatch = findParameterCountInText(`${model.modelId || ""} ${normalizeStringArray(model.tags).join(" ")}`);

  if (nameMatch) {
    return {
      value: nameMatch,
      source: "inference",
      confidence: "low"
    };
  }

  return createUnknownFact();
}

function findParameterCountInText(text) {
  const match = String(text).match(/(?:^|[-_\s])(\d+(?:\.\d+)?)\s*([bm])(?:[-_\s]|$)/i);

  if (!match) {
    return null;
  }

  const amount = Number.parseFloat(match[1]);
  const unit = match[2].toLowerCase();

  if (!Number.isFinite(amount)) {
    return null;
  }

  return Math.round(amount * (unit === "b" ? 1_000_000_000 : 1_000_000));
}

function detectFormats(files) {
  return FORMAT_RULES
    .map((rule) => {
      const matchedFiles = files.filter(rule.test);

      if (matchedFiles.length === 0) {
        return null;
      }

      return {
        id: rule.id,
        label: rule.label,
        value: rule.label,
        source: rule.source,
        confidence: rule.confidence,
        files: matchedFiles.map((file) => file.path)
      };
    })
    .filter(Boolean);
}

function detectQuantisations(files, tags, modelCardMarkdown, safetensorsParameters) {
  const sources = [
    ...files.map((file) => ({ text: file.path, source: "filename" })),
    ...tags.map((tag) => ({ text: tag, source: "metadata" })),
    ...Object.keys(safetensorsParameters && typeof safetensorsParameters === "object" ? safetensorsParameters : {}).map((key) => ({ text: key, source: "metadata" })),
    { text: modelCardMarkdown.slice(0, 20000), source: "model-card" }
  ];
  const seen = new Map();

  for (const sourceItem of sources) {
    for (const pattern of QUANTISATION_PATTERNS) {
      pattern.lastIndex = 0;
      const matches = sourceItem.text.match(pattern) || [];

      for (const match of matches) {
        const normalized = normalizeQuantisationLabel(match);

        if (!seen.has(normalized)) {
          seen.set(normalized, {
            value: normalized,
            source: sourceItem.source,
            confidence: sourceItem.source === "filename" ? "high" : "medium"
          });
        }
      }
    }
  }

  return Array.from(seen.values()).sort((a, b) => a.value.localeCompare(b.value));
}

function detectRelevantFiles(files, formats, quantisations) {
  const formatByFile = new Map();

  for (const format of formats) {
    for (const filePath of format.files) {
      const current = formatByFile.get(filePath) || [];
      current.push(format.label);
      formatByFile.set(filePath, current);
    }
  }

  return files
    .filter((file) => formatByFile.has(file.path))
    .map((file) => {
      const fileQuantisations = quantisations
        .filter((quantisation) => file.path.toUpperCase().includes(quantisation.value.toUpperCase()))
        .map((quantisation) => quantisation.value);

      return {
        path: file.path,
        name: file.name || file.path.split("/").pop() || file.path,
        formats: formatByFile.get(file.path),
        quantisations: fileQuantisations,
        explanation: explainFile(file.path, formatByFile.get(file.path), fileQuantisations)
      };
    });
}

function detectModelKind(model, tags, modelCardMarkdown) {
  const scores = new Map(MODEL_KIND_LABELS.map((kind) => [kind, { kind, score: 0, sources: new Set() }]));
  const rawMetadata = model.rawMetadata && typeof model.rawMetadata === "object" ? model.rawMetadata : {};
  const config = rawMetadata.config && typeof rawMetadata.config === "object" ? rawMetadata.config : {};
  const pipelineTag = String(model.pipelineTag || "");
  const libraryName = String(model.libraryName || "");
  const tagText = normalizeStringArray(tags).join(" ");
  const modelText = String(model.modelId || "");
  const architectureText = [
    model.architecture,
    config.architectures,
    config.model_type,
    config.auto_map && Object.values(config.auto_map)
  ].flat(3).filter(Boolean).join(" ");
  const fileText = normalizeFiles(model.files).map((file) => file.path).join(" ");
  const cardText = modelCardMarkdown.slice(0, 30000);

  addKindScores(scores, pipelineTag, PIPELINE_KIND_RULES, "metadata");
  addKindScores(scores, libraryName, LIBRARY_KIND_RULES, "metadata");
  addKindScores(scores, `${modelText} ${tagText}`, TEXT_KIND_RULES, "metadata", 1);
  addKindScores(scores, architectureText, ARCHITECTURE_KIND_RULES, "metadata");
  addKindScores(scores, fileText, TEXT_KIND_RULES, "filename", -2);
  addKindScores(scores, cardText, TEXT_KIND_RULES, "model-card", -1);

  const ranked = Array.from(scores.values())
    .filter((item) => item.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }

      return MODEL_KIND_PRIORITY.indexOf(a.kind) - MODEL_KIND_PRIORITY.indexOf(b.kind);
    });

  if (ranked.length === 0 || ranked[0].score < 5) {
    return createUnknownFact();
  }

  const top = ranked[0];
  const runnerUp = ranked[1];

  if (runnerUp && isMeaningfullyAmbiguous(top, runnerUp)) {
    return createKnownFact("unclear", "inference", "low");
  }

  return createKnownFact(top.kind, bestModelKindSource(top.sources), confidenceFromModelKindScore(top.score));
}

function addKindScores(scores, text, rules, source, scoreAdjustment = 0) {
  if (!text) {
    return;
  }

  for (const rule of rules) {
    if (!rule.pattern.test(String(text))) {
      continue;
    }

    const current = scores.get(rule.kind);

    if (!current) {
      continue;
    }

    current.score += Math.max(1, rule.score + scoreAdjustment);
    current.sources.add(source);
  }
}

function isMeaningfullyAmbiguous(top, runnerUp) {
  const difference = top.score - runnerUp.score;

  if (difference > 1) {
    return false;
  }

  const compatiblePairs = new Set([
    "chat:instruct",
    "instruct:chat",
    "code-focused:instruct",
    "instruct:code-focused",
    "reranker:classifier",
    "classifier:reranker",
    "reranker:embedding",
    "embedding:reranker"
  ]);

  return !compatiblePairs.has(`${top.kind}:${runnerUp.kind}`);
}

function bestModelKindSource(sources) {
  const sourceList = Array.from(sources);

  if (sourceList.includes("metadata")) {
    return "metadata";
  }

  if (sourceList.includes("model-card")) {
    return "model-card";
  }

  if (sourceList.includes("filename")) {
    return "filename";
  }

  return "inference";
}

function confidenceFromModelKindScore(score) {
  if (score >= 8) {
    return "high";
  }

  if (score >= 5) {
    return "medium";
  }

  return "low";
}

function normalizeFiles(files) {
  return Array.isArray(files)
    ? files.filter((file) => file && typeof file.path === "string")
    : [];
}

function detectPrimaryTask(model, tags) {
  if (typeof model.pipelineTag === "string" && model.pipelineTag.trim() !== "") {
    return createKnownFact(model.pipelineTag, "metadata", "high");
  }

  const taskTag = normalizeStringArray(tags).find((tag) => /generation|classification|embedding|translation|summarization|question-answering|text-to-image/i.test(tag));

  if (taskTag) {
    return createKnownFact(taskTag, "metadata", "medium");
  }

  return createUnknownFact();
}

function detectContextLength(rawMetadata, modelCardMarkdown) {
  const config = rawMetadata.config && typeof rawMetadata.config === "object" ? rawMetadata.config : {};
  const configCandidates = [
    config.max_position_embeddings,
    config.max_sequence_length,
    config.seq_length,
    config.n_positions,
    config.text_config?.max_position_embeddings
  ].filter(Number.isFinite);

  if (configCandidates.length > 0) {
    return createKnownFact(configCandidates[0], "metadata", "high");
  }

  const cardMatch = modelCardMarkdown.match(/\b(?:context length|context window|sequence length|max(?:imum)? context)\D{0,40}(\d{3,7})\b/i);

  if (cardMatch) {
    return createKnownFact(Number.parseInt(cardMatch[1], 10), "model-card", "medium");
  }

  return createUnknownFact();
}

function categorizeModelSize(parameterCount) {
  if (!Number.isFinite(parameterCount)) {
    return createUnknownFact();
  }

  if (parameterCount < 1_000_000_000) {
    return createKnownFact("extremely small", "inference", "medium");
  }

  if (parameterCount < 3_000_000_000) {
    return createKnownFact("small", "inference", "medium");
  }

  if (parameterCount < 8_000_000_000) {
    return createKnownFact("medium local model", "inference", "medium");
  }

  if (parameterCount < 20_000_000_000) {
    return createKnownFact("large local model", "inference", "medium");
  }

  return createKnownFact("very large local model", "inference", "medium");
}

function detectGlossaryTerms({ model, parameterCount, modelKind, primaryTask, formats, quantisations, contextLength }) {
  const termIds = new Set(["model-card", "pipeline-tag", "licence"]);
  const searchableText = buildGlossarySearchText(model);

  if (Number.isFinite(parameterCount.value)) {
    termIds.add("parameters");
    termIds.add("model-weights");
    termIds.add("billion-parameter-label");
  }

  if (contextLength.value) {
    termIds.add("context-length");
  }

  if (model.libraryName === "transformers") {
    termIds.add("transformers");
  }

  for (const format of formats) {
    if (format.id === "gguf") {
      termIds.add("gguf");
      termIds.add("llama-cpp");
      termIds.add("lm-studio");
    }

    if (format.id === "safetensors") {
      termIds.add("safetensors");
    }

    if (format.id === "tokenizer") {
      termIds.add("tokenizer");
    }
  }

  if (quantisations.length > 0) {
    termIds.add("quantisation");

    for (const quantisation of quantisations) {
      if (quantisation.value === "FP16") {
        termIds.add("fp16");
      }

      if (quantisation.value === "BF16") {
        termIds.add("bf16");
      }

      if (quantisation.value === "Q4_K_M") {
        termIds.add("q4-k-m");
      }
    }
  }

  if (model.gated) {
    termIds.add("gated-model");
  }

  if (modelKind.value === "instruct") {
    termIds.add("instruct-model");
    termIds.add("chat-template");
  }

  if (modelKind.value === "chat") {
    termIds.add("chat-model");
    termIds.add("chat-template");
  }

  if (modelKind.value === "base") {
    termIds.add("base-model");
  }

  if (modelKind.value === "code-focused") {
    termIds.add("code-model");
  }

  if (modelKind.value === "embedding" || primaryTask.value === "feature-extraction") {
    termIds.add("embedding-model");
  }

  if (modelKind.value === "image") {
    termIds.add("image-model");
  }

  if (modelKind.value === "audio") {
    termIds.add("audio-model");
  }

  if (modelKind.value === "multimodal") {
    termIds.add("multimodal-model");
  }

  if (modelKind.value === "reranker") {
    termIds.add("reranker");
  }

  if (modelKind.value === "classifier") {
    termIds.add("classifier");
  }

  if (modelKind.value === "unclear") {
    termIds.add("unclear-model-type");
  }

  if (hasChatTemplateClue(searchableText)) {
    termIds.add("chat-template");
  }

  if (hasDatasetClue(searchableText)) {
    termIds.add("dataset");
  }

  if (hasBenchmarkClue(searchableText)) {
    termIds.add("evaluation-benchmark");
  }

  return Array.from(termIds);
}

function buildGlossarySearchText(model) {
  const rawMetadata = model.rawMetadata && typeof model.rawMetadata === "object" ? model.rawMetadata : {};
  const config = rawMetadata.config && typeof rawMetadata.config === "object" ? rawMetadata.config : {};
  const cardText = typeof model.modelCardMarkdown === "string" ? model.modelCardMarkdown.slice(0, 40000) : "";
  const fileText = normalizeFiles(model.files).map((file) => file.path).join(" ");

  return [
    model.modelId,
    model.pipelineTag,
    model.libraryName,
    normalizeStringArray(model.tags).join(" "),
    JSON.stringify({
      chat_template: config.chat_template,
      tokenizer_class: config.tokenizer_class,
      architectures: config.architectures
    }),
    fileText,
    cardText
  ].filter(Boolean).join(" ");
}

function hasChatTemplateClue(text) {
  return /\b(chat\s*template|apply_chat_template|tokenizer_config\.json|system prompt|chatml)\b/i.test(text);
}

function hasDatasetClue(text) {
  return /\b(dataset|datasets|training data|fine[-\s]?tuning data|pretraining data|corpus|data mixture)\b/i.test(text);
}

function hasBenchmarkClue(text) {
  return /\b(benchmark|benchmarks|evaluation|evaluated|leaderboard|mmlu|hellaswag|arc-challenge|gsm8k|humaneval|truthfulqa|winogrande|mt-bench|arena)\b/i.test(text);
}

function buildFactList(items) {
  const facts = [];

  for (const [key, fact] of Object.entries(items)) {
    if (Array.isArray(fact)) {
      for (const entry of fact) {
        facts.push({
          key,
          value: entry.value,
          source: entry.source,
          confidence: entry.confidence
        });
      }
      continue;
    }

    facts.push({
      key,
      value: fact.value,
      source: fact.source,
      confidence: fact.confidence
    });
  }

  return facts;
}

function buildWarnings(model, parameterCount, formats) {
  const warnings = [];

  if (!Number.isFinite(parameterCount.value)) {
    warnings.push("Parameter count was not found in structured metadata.");
  }

  if (!model.license) {
    warnings.push("Licence metadata is missing.");
  }

  if (!formats.some((format) => format.id === "gguf")) {
    warnings.push("No GGUF file was detected in this repository.");
  }

  if (!Array.isArray(model.files) || model.files.length === 0) {
    warnings.push("The repository file list is empty or unavailable.");
  }

  return warnings;
}

function explainFile(filePath, formats, quantisations) {
  const lowerPath = filePath.toLowerCase();

  if (lowerPath.endsWith(".gguf")) {
    const quantText = quantisations.length > 0 ? `${quantisations.join(", ")} quantised ` : "";
    return `A ${quantText}GGUF model file, commonly used by llama.cpp-based local model tools.`;
  }

  if (lowerPath.endsWith(".safetensors")) {
    return "A safetensors model weights file, commonly used with Python Transformers.";
  }

  if (lowerPath.endsWith(".onnx")) {
    return "An ONNX model file for ONNX Runtime or compatible tooling.";
  }

  if (formats.includes("tokenizer files")) {
    return "A tokenizer-related file that helps software turn text into model tokens and back.";
  }

  if (formats.includes("configuration files")) {
    return "A configuration file that describes how model software should load or generate with this model.";
  }

  return "A relevant repository file detected from its filename.";
}

function normalizeQuantisationLabel(label) {
  return label.replace(/-/g, "-").toUpperCase();
}

function createKnownFact(value, source, confidence) {
  return {
    value: value ?? null,
    source,
    confidence
  };
}

function createUnknownFact() {
  return {
    value: null,
    source: "metadata",
    confidence: "low"
  };
}

function numberOrNull(value) {
  return Number.isFinite(value) ? value : null;
}

function normalizeStringArray(value) {
  if (Array.isArray(value)) {
    return value.filter((item) => typeof item === "string");
  }

  if (typeof value === "string" && value.trim() !== "") {
    return [value];
  }

  return [];
}
