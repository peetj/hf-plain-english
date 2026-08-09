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
 *   commands: string[]
 * }}
 */
export function recommendModelTool(model, interpreted, hardwareEstimate, hardwareProfile = {}) {
  const formats = new Set((interpreted?.formats || []).map((format) => format.id));
  const modelKind = interpreted?.modelKind?.value || "unknown";
  const libraryName = String(model?.libraryName || "").toLowerCase();
  const primaryTask = interpreted?.primaryTask?.value || model?.pipelineTag || "unknown";
  const warnings = [];
  const alternatives = [];

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
      warnings,
      commands: []
    };
  }

  if (modelKind === "image") {
    return {
      primaryTool: libraryName === "diffusers" ? "Python Transformers" : "not suitable for ordinary chatbot use",
      confidence: libraryName === "diffusers" ? "medium" : "high",
      reasons: [
        `Hugging Face reports the task as ${primaryTask}, so local chatbot tools are probably not the right interface.`
      ],
      alternatives: libraryName === "diffusers" ? ["Use a Python setup with the matching image-generation library."] : [],
      warnings,
      commands: []
    };
  }

  if (formats.has("gguf")) {
    const preferredTools = Array.isArray(hardwareProfile.preferredTools) ? hardwareProfile.preferredTools : [];
    const prefersLmStudio = preferredTools.includes("LM Studio");
    const chatOrInstruct = modelKind === "chat" || modelKind === "instruct";

    if (prefersLmStudio || chatOrInstruct) {
      alternatives.push("llama.cpp can also run GGUF files if you are comfortable with command-line tooling.");

      if (preferredTools.includes("Ollama")) {
        alternatives.push("Ollama may work only if there is a known Ollama model tag or a suitable Modelfile setup.");
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
      warnings: addBaseModelWarning(warnings, modelKind),
      commands: []
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
      warnings: addBaseModelWarning(warnings, modelKind),
      commands: []
    };
  }

  if (formats.has("safetensors") || formats.has("pytorch")) {
    return {
      primaryTool: "Python Transformers",
      confidence: "medium",
      reasons: [
        "Model weight files were detected, but the exact loading library is not fully clear from metadata."
      ],
      alternatives: [],
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
    warnings: addBaseModelWarning(warnings, modelKind),
    commands: []
  };
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

function addBaseModelWarning(warnings, modelKind) {
  if (modelKind !== "base") {
    return warnings;
  }

  return [
    ...warnings,
    "This appears to be a base model, so it may not behave like a normal assistant without instruction/chat tuning."
  ];
}
