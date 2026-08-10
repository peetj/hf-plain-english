/**
 * Recommend a practical route for using a Hugging Face model from verified facts.
 *
 * @param {object} model Normalized Hugging Face metadata.
 * @param {object} interpreted Parsed model facts.
 * @param {object} hardwareEstimate Cautious hardware estimate.
 * @param {object} hardwareProfile Local hardware profile.
 * @returns {{
 *   primaryTool: string,
 *   confidence: "high" | "medium" | "low",
 *   reasons: string[],
 *   alternatives: string[],
 *   warnings: string[],
 *   notRecommended: string[],
 *   commands: string[]
 * }}
 */
export function recommendModelTool(model, interpreted, hardwareEstimate, hardwareProfile = {}) {
  const formats = new Set((interpreted?.formats || []).map((format) => format.id));
  const fileCategories = new Set((interpreted?.relevantFiles || []).map((file) => file.category));
  const relevantFiles = Array.isArray(interpreted?.relevantFiles) ? interpreted.relevantFiles : [];
  const modelKind = interpreted?.modelKind?.value || "unknown";
  const libraryName = String(model?.libraryName || "").toLowerCase();
  const primaryTask = interpreted?.primaryTask?.value || model?.pipelineTag || "unknown";
  const modelId = typeof model?.modelId === "string" ? model.modelId : "";
  const warnings = [];
  const alternatives = [];
  const preferredTools = Array.isArray(hardwareProfile.preferredTools) ? hardwareProfile.preferredTools : [];
  const hasKnownOllamaRoute = detectKnownOllamaRoute(model);
  const hasBeginnerLocalFile = fileCategories.has("quantised-local") || formats.has("gguf");
  const commandsAllowed = canShowCommands(model, interpreted, hardwareEstimate);

  if (model?.gated || model?.private) {
    warnings.push("This model may require signing in to Hugging Face or accepting access terms before downloading files.");
  }

  if (hardwareEstimate?.fit?.overall === "unlikely") {
    warnings.push("The local hardware estimate says this is unlikely to fit comfortably on the stored hardware profile.");
  } else if (hardwareEstimate?.fit?.overall === "unknown") {
    warnings.push("Hardware fit could not be estimated from the available parameter and precision information.");
  }

  if (modelKind === "unclear") {
    warnings.push("The model type is unclear from the page clues, so do not assume it is meant for normal chat without checking the model card examples.");
  }

  if (modelKind === "embedding") {
    return {
      primaryTool: "not suitable for ordinary chatbot use",
      confidence: "high",
      reasons: [
        "The model appears to be for embeddings, which are used for search, matching, retrieval, or clustering rather than normal conversation."
      ],
      alternatives: buildEmbeddingAlternatives(libraryName),
      notRecommended: [
        "LM Studio and Ollama are chat-first tools; an embedding model is normally used inside search or retrieval software instead."
      ],
      warnings,
      commands: []
    };
  }

  if (["reranker", "classifier", "audio", "multimodal"].includes(modelKind)) {
    return {
      primaryTool: "not suitable for ordinary chatbot use",
      confidence: modelKind === "multimodal" ? "medium" : "high",
      reasons: [
        specialistReason(modelKind, primaryTask)
      ],
      alternatives: specialistAlternatives(modelKind, libraryName),
      notRecommended: specialistNotRecommended(modelKind),
      warnings,
      commands: []
    };
  }

  if (modelKind === "image") {
    return {
      primaryTool: libraryName === "diffusers" ? "Diffusers" : "not suitable for ordinary chatbot use",
      confidence: libraryName === "diffusers" ? "medium" : "high",
      reasons: [
        `Hugging Face reports the task as ${primaryTask}, so local chatbot tools are probably not the right interface.`,
        libraryName === "diffusers"
          ? "The repository uses Diffusers metadata, which points to image-generation Python tooling."
          : "The page does not provide enough tool-specific evidence for a beginner image workflow."
      ],
      alternatives: libraryName === "diffusers" ? ["Use the model card's Diffusers example if one is provided."] : [],
      notRecommended: ["LM Studio and Ollama are not the right starting point for image-generation models."],
      warnings,
      commands: []
    };
  }

  if (formats.has("gguf")) {
    const prefersLmStudio = preferredTools.includes("LM Studio");
    const prefersOllama = preferredTools.includes("Ollama");
    const chatOrInstruct = modelKind === "chat" || modelKind === "instruct";
    const languageModel = chatOrInstruct || modelKind === "base" || modelKind === "code-focused" || modelKind === "unknown";

    if (prefersOllama && hasKnownOllamaRoute && languageModel) {
      alternatives.push("LM Studio is still a safer visual fallback if the Ollama instructions do not match this exact repository.");

      return {
        primaryTool: "Ollama",
        confidence: chatOrInstruct ? "medium" : "low",
        reasons: [
          "A GGUF file was detected, and the page appears to mention an Ollama route.",
          chatOrInstruct
            ? "The model appears to be chat or instruction tuned, which is the kind of model Ollama commonly runs."
            : "The model type is not clearly chat-tuned, so treat the Ollama route as something to verify on the model card."
        ],
        alternatives,
        notRecommended: buildNotRecommendedForLocalModel({ hasKnownOllamaRoute, primaryTool: "Ollama" }),
        warnings: addBaseModelWarning(warnings, modelKind),
        commands: commandsAllowed ? buildOllamaCommands(model) : []
      };
    }

    if (prefersLmStudio || chatOrInstruct) {
      alternatives.push("llama.cpp can also run GGUF files if you are comfortable with command-line tooling.");

      if (prefersOllama) {
        alternatives.push(hasKnownOllamaRoute
          ? "Ollama may also work because the page appears to mention an Ollama route."
          : "Ollama is not the first choice here unless the model card gives an Ollama tag or Modelfile instructions.");
      }

      return {
        primaryTool: "LM Studio",
        confidence: chatOrInstruct ? "high" : "medium",
        reasons: [
          "A GGUF file was detected, which is a common local model format.",
          chatOrInstruct
            ? "The model appears to be chat or instruction tuned, which fits LM Studio's visual testing workflow."
            : "LM Studio is a beginner-friendly way to inspect and try GGUF language models."
        ],
        alternatives,
        notRecommended: buildNotRecommendedForLocalModel({ hasKnownOllamaRoute, primaryTool: "LM Studio" }),
        warnings: addBaseModelWarning(warnings, modelKind),
        commands: []
      };
    }

    return {
      primaryTool: "llama.cpp",
      confidence: "medium",
      reasons: [
        "A GGUF file was detected, and llama.cpp is the common runtime family for GGUF models."
      ],
      alternatives: ["LM Studio may be easier if you prefer a graphical interface."],
      notRecommended: buildNotRecommendedForLocalModel({ hasKnownOllamaRoute, primaryTool: "llama.cpp" }),
      warnings: addBaseModelWarning(warnings, modelKind),
      commands: commandsAllowed ? buildLlamaCppCommands(relevantFiles) : []
    };
  }

  if (formats.has("mlx")) {
    return {
      primaryTool: "MLX",
      confidence: "medium",
      reasons: [
        "MLX-related files were detected, which usually target Apple's MLX ecosystem."
      ],
      alternatives: libraryName === "transformers" ? ["Python Transformers may also work if the repository includes compatible weights."] : [],
      notRecommended: ["LM Studio and Ollama usually do not load MLX repositories directly."],
      warnings,
      commands: []
    };
  }

  if (formats.has("onnx")) {
    return {
      primaryTool: "ONNX runtime",
      confidence: "medium",
      reasons: [
        "ONNX files were detected, which are meant for ONNX Runtime or compatible tooling."
      ],
      alternatives: libraryName === "transformers" ? ["Python Transformers may also work if compatible weights are present."] : [],
      notRecommended: ["LM Studio and Ollama are not the normal route for ONNX model files."],
      warnings,
      commands: []
    };
  }

  if ((formats.has("safetensors") || formats.has("pytorch")) && libraryName === "transformers") {
    return {
      primaryTool: "Python Transformers",
      confidence: "high",
      reasons: [
        "The repository uses Hugging Face Transformers metadata.",
        formats.has("safetensors")
          ? "safetensors model weights were detected."
          : "PyTorch model files were detected."
      ],
      alternatives: [
        "A desktop app may require a converted or separately published GGUF version.",
        "Ollama should only be used if there is a known Ollama model tag or a custom setup."
      ],
      notRecommended: [
        hasBeginnerLocalFile
          ? "Do not mix the raw Transformers weights with a GGUF desktop workflow unless the model card explains that route."
          : "LM Studio and Ollama usually need a GGUF or dedicated Ollama version, not raw safetensors/PyTorch weights."
      ],
      warnings: addBaseModelWarning(warnings, modelKind),
      commands: commandsAllowed ? buildPythonTransformersCommands(modelId) : []
    };
  }

  if (formats.has("safetensors") || formats.has("pytorch")) {
    return {
      primaryTool: "Python Transformers",
      confidence: "medium",
      reasons: [
        "Model weight files were detected, but the exact loading library is not fully clear from metadata."
      ],
      alternatives: ["Check the model card for the exact Python library before downloading."],
      notRecommended: ["Do not assume this will open in LM Studio or Ollama unless a GGUF or Ollama route is shown."],
      warnings: addBaseModelWarning(warnings, modelKind),
      commands: []
    };
  }

  return {
    primaryTool: "insufficient information",
    confidence: "low",
    reasons: [
      "No clearly runnable local format was detected from the repository file list."
    ],
    alternatives: [],
    notRecommended: ["Do not download random files yet; first check whether the model card names a supported tool or points to another runnable version."],
    warnings: addBaseModelWarning(warnings, modelKind),
    commands: []
  };
}

function detectKnownOllamaRoute(model) {
  const tagText = Array.isArray(model?.tags) ? model.tags.join(" ") : "";
  const cardText = typeof model?.modelCardMarkdown === "string" ? model.modelCardMarkdown.slice(0, 20000) : "";
  return /\bollama\b/i.test(`${tagText} ${cardText}`)
    && /\b(?:ollama[ \t]+run|modelfile|ollama[ \t]+create|ollama\.com\/library)\b/i.test(cardText);
}

function canShowCommands(model, interpreted, hardwareEstimate) {
  const modelKind = interpreted?.modelKind?.value || "unknown";

  if (!model?.modelId || model?.gated || model?.private) {
    return false;
  }

  if (modelKind === "unknown" || modelKind === "unclear" || ["embedding", "reranker", "classifier", "image", "audio", "multimodal"].includes(modelKind)) {
    return false;
  }

  if (hardwareEstimate?.fit?.overall === "unlikely") {
    return false;
  }

  return true;
}

function buildLlamaCppCommands(relevantFiles) {
  const ggufFile = getBestGgufFile(relevantFiles);

  if (!ggufFile) {
    return [];
  }

  return [
    `# Example llama.cpp command after downloading the GGUF file\nllama-cli -m "${ggufFile.path}" -p "Hello, explain what you can do." -n 80`
  ];
}

function buildOllamaCommands(model) {
  const cardText = typeof model?.modelCardMarkdown === "string" ? model.modelCardMarkdown.slice(0, 20000) : "";
  const command = extractOllamaRunCommand(cardText);

  if (!command) {
    return [];
  }

  return [
    `# Example from the model page\n${command}`
  ];
}

function buildPythonTransformersCommands(modelId) {
  return [
    "# Example setup command\npip install transformers accelerate safetensors",
    `# Example Python load check\npython -c "from transformers import AutoTokenizer, AutoModelForCausalLM; m='${modelId}'; t=AutoTokenizer.from_pretrained(m); model=AutoModelForCausalLM.from_pretrained(m, device_map='auto'); print('loaded', m)"`
  ];
}

function getBestGgufFile(relevantFiles) {
  return [...relevantFiles]
    .filter((file) => Array.isArray(file.formatIds) && file.formatIds.includes("gguf"))
    .sort((a, b) => {
      const aQuantised = a.category === "quantised-local" ? 0 : 1;
      const bQuantised = b.category === "quantised-local" ? 0 : 1;

      if (aQuantised !== bQuantised) {
        return aQuantised - bQuantised;
      }

      return a.path.localeCompare(b.path);
    })[0] || null;
}

function extractOllamaRunCommand(text) {
  const match = String(text).match(/\bollama[ \t]+run[ \t]+["'`]?([A-Za-z0-9._/-]+)["'`]?/i);

  if (!match) {
    return null;
  }

  return `ollama run ${match[1]}`;
}

function buildNotRecommendedForLocalModel({ hasKnownOllamaRoute, primaryTool }) {
  const notes = [];

  if (primaryTool !== "Ollama" && !hasKnownOllamaRoute) {
    notes.push("Ollama is not the safest first choice unless the model card gives an Ollama tag or Modelfile instructions.");
  }

  notes.push("Python Transformers is usually for raw safetensors or PyTorch repositories, not the easiest route for a GGUF local file.");
  return notes;
}

function buildEmbeddingAlternatives(libraryName) {
  if (libraryName === "sentence-transformers") {
    return ["Use a sentence-transformers or Python retrieval workflow."];
  }

  if (libraryName === "transformers") {
    return ["Use a Python Transformers workflow for embeddings or retrieval."];
  }

  return ["Use retrieval, search, or embedding tooling rather than a chat interface."];
}

function specialistReason(modelKind, primaryTask) {
  const taskText = primaryTask && primaryTask !== "unknown" ? ` Hugging Face reports the task as ${primaryTask}.` : "";

  if (modelKind === "reranker") {
    return `The model appears to rerank search results, which is a search-system job rather than ordinary conversation.${taskText}`;
  }

  if (modelKind === "classifier") {
    return `The model appears to assign labels or categories, not hold a normal chat.${taskText}`;
  }

  if (modelKind === "audio") {
    return `The model appears to work with speech or audio, so a chatbot runner is probably the wrong interface.${taskText}`;
  }

  return `The model appears to combine text with another input type, so the correct tool depends on the model card examples.${taskText}`;
}

function specialistAlternatives(modelKind, libraryName) {
  if (modelKind === "reranker") {
    return ["Use a retrieval or search workflow, often through Python or sentence-transformers tooling."];
  }

  if (modelKind === "classifier") {
    return ["Use a classification workflow, usually through Python Transformers or the library named on the model card."];
  }

  if (modelKind === "audio") {
    return ["Use the audio pipeline or library shown on the model card, such as speech recognition or text-to-speech tooling."];
  }

  if (libraryName === "transformers") {
    return ["Use the model card's Python Transformers example if one is provided."];
  }

  return ["Use the examples on the model card because multimodal models vary widely."];
}

function specialistNotRecommended(modelKind) {
  if (modelKind === "multimodal") {
    return ["Do not assume a normal chatbot runner will handle images, audio, or video inputs; multimodal setup varies by model."];
  }

  return ["LM Studio and Ollama are chat-oriented starting points, so they are usually not the right first tool for this model type."];
}

function addBaseModelWarning(warnings, modelKind) {
  if (modelKind !== "base") {
    return warnings;
  }

  return [
    ...warnings,
    "This appears to be a base model, so it may not behave like a normal assistant without instruction/chat tuning."
  ];
}
