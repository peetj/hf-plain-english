/**
 * Build deterministic beginner-facing explanation text from verified facts and estimates.
 *
 * @param {object} model Normalized Hugging Face metadata.
 * @param {object} interpreted Parsed model facts.
 * @param {object} hardwareEstimate Cautious hardware estimate.
 * @param {object} recommendation Tool recommendation.
 * @returns {{
 *   summary: string,
 *   overview: string,
 *   hardware: string,
 *   run: string,
 *   limitations: string[]
 * }}
 */
export function generateDeterministicExplanation(model, interpreted, hardwareEstimate, recommendation) {
  const modelId = model?.modelId || "this model";
  const task = interpreted?.primaryTask?.value || model?.pipelineTag || "an unknown task";
  const modelKind = interpreted?.modelKind?.value || "unknown";
  const size = interpreted?.sizeCategory?.value || "unknown size";
  const formats = (interpreted?.formats || []).map((format) => format.label);
  const quantisations = (interpreted?.quantisations || []).map((item) => item.value);
  const fitLabel = hardwareEstimate?.fit?.overall || "unknown";
  const primaryTool = recommendation?.primaryTool || "insufficient information";

  return {
    summary: buildSummary({ modelId, task, modelKind, size, formats, primaryTool }),
    overview: buildOverview({ modelId, task, modelKind, formats, quantisations }),
    hardware: buildHardwareText(hardwareEstimate, fitLabel),
    run: buildRunText(recommendation),
    limitations: buildLimitations(model, interpreted, hardwareEstimate, recommendation)
  };
}

function buildSummary({ modelId, task, modelKind, size, formats, primaryTool }) {
  const kindText = modelKind === "unknown" ? "a model" : `${withArticle(modelKind)} model`;
  const formatText = formats.length ? ` Detected file formats include ${formats.join(", ")}.` : "";
  const routeText = primaryTool === "not suitable for ordinary chatbot use"
    ? "it is not suitable for ordinary chatbot use"
    : `the most suitable route currently looks like ${primaryTool}`;

  return `${modelId} appears to be ${kindText} for ${task}. Its size category is ${size}. ${capitalizeFirst(routeText)}.${formatText}`;
}

function buildOverview({ modelId, task, modelKind, formats, quantisations }) {
  const formatText = formats.length
    ? `The repository includes ${formats.join(", ")} files.`
    : "The repository file list did not reveal a common runnable format.";
  const quantText = quantisations.length
    ? `Detected precision or quantisation labels: ${quantisations.join(", ")}.`
    : "No quantisation label was detected.";

  if (modelKind === "embedding") {
    return `${modelId} is best read as an embedding model for ${task}. That means it is more likely useful for search, matching, retrieval, or ranking than for ordinary chat. ${formatText} ${quantText}`;
  }

  if (modelKind === "image") {
    return `${modelId} is best read as an image-related model for ${task}. It should not be treated as a normal local chatbot model unless the repository clearly says so. ${formatText} ${quantText}`;
  }

  if (modelKind === "base") {
    return `${modelId} appears to be a base model for ${task}. A base model may predict text but may not follow instructions like a polished assistant. ${formatText} ${quantText}`;
  }

  if (modelKind === "chat" || modelKind === "instruct") {
    return `${modelId} appears to be a ${modelKind} model for ${task}. That makes it more likely to be useful for prompts, instructions, or conversation. ${formatText} ${quantText}`;
  }

  return `${modelId} reports the task ${task}, but the user-facing model type is not clear from the available metadata. ${formatText} ${quantText}`;
}

function buildHardwareText(estimate, fitLabel) {
  if (!estimate || estimate.fit?.overall === "unknown") {
    return "Hardware fit cannot be estimated from the available facts. A reliable parameter count and precision or quantisation are needed.";
  }

  return `${estimate.explanation} This is an estimate, not an exact VRAM promise.`;
}

function buildRunText(recommendation) {
  const primaryTool = recommendation?.primaryTool || "insufficient information";

  switch (primaryTool) {
    case "LM Studio":
      return "Best starting point: LM Studio. This looks like a model you can try through a beginner-friendly desktop interface, especially because a GGUF file was detected.";
    case "llama.cpp":
      return "Best starting point: llama.cpp. A GGUF file was detected, but this route is more technical than using a desktop app.";
    case "Python Transformers":
      return "Best starting point: Python Transformers. This repository looks set up for Hugging Face's Python tooling, so it may not be a one-click LM Studio or Ollama model unless someone publishes a GGUF or Ollama version.";
    case "MLX":
      return "Best starting point: MLX. This route is mainly relevant for Apple silicon workflows and may be technical for beginners.";
    case "ONNX runtime":
      return "Best starting point: ONNX Runtime. This is usually a developer-oriented route rather than a beginner desktop chat app.";
    case "not suitable for ordinary chatbot use":
      return "This does not look like a normal chatbot model. It may be useful for a specialist task, but a chat app is probably the wrong starting point.";
    default:
      return "There is not enough information to recommend a reliable way to run this model locally.";
  }
}

function buildLimitations(model, interpreted, hardwareEstimate, recommendation) {
  const limitations = [];

  if (!model?.license) {
    limitations.push("Licence metadata is missing; check the original model page before relying on usage rights.");
  }

  if (!Number.isFinite(interpreted?.parameterCount?.value)) {
    limitations.push("Parameter count was not found, so size and hardware conclusions are limited.");
  }

  if (!interpreted?.formats?.some((format) => format.id === "gguf")) {
    limitations.push("No GGUF file was detected, so beginner desktop tools may need a different repository or conversion.");
  }

  if (hardwareEstimate?.fit?.overall === "unknown") {
    limitations.push("Hardware fit could not be estimated from the available metadata.");
  }

  if (Array.isArray(recommendation?.warnings)) {
    limitations.push(...recommendation.warnings);
  }

  return Array.from(new Set(limitations));
}

function withArticle(word) {
  const firstLetter = String(word || "").charAt(0).toLowerCase();
  const article = ["a", "e", "i", "o", "u"].includes(firstLetter) ? "an" : "a";
  return `${article} ${word}`;
}

function capitalizeFirst(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
