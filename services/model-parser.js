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
  const structuredSearchable = `${model.modelId || ""} ${model.pipelineTag || ""} ${model.libraryName || ""} ${tags.join(" ")}`.toLowerCase();
  const pipelineTag = String(model.pipelineTag || "").toLowerCase();
  const libraryName = String(model.libraryName || "").toLowerCase();

  if (
    pipelineTag.includes("sentence-similarity") ||
    pipelineTag.includes("feature-extraction") ||
    /\b(embedding|embeddings|sentence-transformers)\b/i.test(structuredSearchable)
  ) {
    return createKnownFact("embedding", pipelineTag ? "metadata" : "inference", pipelineTag ? "high" : "medium");
  }

  if (pipelineTag.includes("text-to-image") || pipelineTag.includes("image-to-image") || libraryName === "diffusers") {
    return createKnownFact("image", pipelineTag || libraryName ? "metadata" : "inference", "high");
  }

  if (pipelineTag.includes("audio") || pipelineTag.includes("speech") || pipelineTag.includes("automatic-speech-recognition")) {
    return createKnownFact("audio", "metadata", "high");
  }

  if (structuredSearchable.includes("multimodal") || structuredSearchable.includes("vision-language") || structuredSearchable.includes("image-text-to-text")) {
    return createKnownFact("multimodal", "metadata", "medium");
  }

  if (/\b(code|coder|coding)\b/i.test(structuredSearchable)) {
    return createKnownFact("code-focused", "inference", "medium");
  }

  if (/\b(chat|conversational)\b/i.test(structuredSearchable)) {
    return createKnownFact("chat", tags.includes("conversational") ? "metadata" : "inference", tags.includes("conversational") ? "high" : "medium");
  }

  if (/\b(instruct|instruction|it)\b/i.test(structuredSearchable)) {
    return createKnownFact("instruct", "inference", "medium");
  }

  if (/\bbase\b/i.test(structuredSearchable)) {
    return createKnownFact("base", "inference", "medium");
  }

  return createUnknownFact();
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

  if (Number.isFinite(parameterCount.value)) {
    termIds.add("parameters");
    termIds.add("model-weights");
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
  }

  if (modelKind.value === "chat") {
    termIds.add("chat-model");
  }

  if (modelKind.value === "base") {
    termIds.add("base-model");
  }

  if (modelKind.value === "embedding" || primaryTask.value === "feature-extraction") {
    termIds.add("embedding-model");
  }

  return Array.from(termIds);
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
