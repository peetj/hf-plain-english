import assert from "node:assert/strict";
import { parseModelFacts } from "../services/model-parser.js";
import { recommendModelTool } from "../services/recommendation-engine.js";

const comfortableHardware = {
  fit: {
    overall: "likely"
  }
};

function model(overrides = {}) {
  return {
    modelId: "example/model",
    pipelineTag: "text-generation",
    libraryName: "transformers",
    tags: [],
    files: [],
    modelCardMarkdown: "",
    rawMetadata: {
      config: {
        architectures: ["AutoModelForCausalLM"]
      }
    },
    ...overrides
  };
}

function recommend(overrides, hardwareProfile = {}) {
  const normalized = model(overrides);
  return recommendModelTool(normalized, parseModelFacts(normalized), comfortableHardware, hardwareProfile);
}

const lmStudio = recommend({
  modelId: "example/Helpful-7B-Instruct-GGUF",
  files: [{ path: "helpful.Q4_K_M.gguf" }]
}, {
  preferredTools: ["LM Studio"]
});

assert.equal(lmStudio.primaryTool, "LM Studio", "beginner GGUF chat models start with LM Studio");
assert.ok(lmStudio.notRecommended.some((note) => /Ollama/.test(note)), "Ollama is caveated when no Ollama route is known");

const ollama = recommend({
  modelId: "example/Helpful-7B-Instruct-GGUF",
  files: [{ path: "helpful.Q4_K_M.gguf" }],
  modelCardMarkdown: "## Ollama\n\nRun this with `ollama run example/helpful` or create it from a Modelfile."
}, {
  preferredTools: ["Ollama"]
});

assert.equal(ollama.primaryTool, "Ollama", "Ollama is recommended only when the page gives an Ollama route");
assert.ok(ollama.reasons.join(" ").includes("Ollama route"), "Ollama recommendation explains the route evidence");

const transformers = recommend({
  modelId: "example/Raw-7B",
  files: [{ path: "model.safetensors" }],
  libraryName: "transformers"
});

assert.equal(transformers.primaryTool, "Python Transformers", "Transformers safetensors repos recommend Python Transformers");
assert.ok(transformers.notRecommended.some((note) => /LM Studio/.test(note)), "raw weights warn against assuming desktop tools");

const embedding = recommend({
  modelId: "sentence-transformers/all-MiniLM-L6-v2",
  pipelineTag: "feature-extraction",
  libraryName: "sentence-transformers",
  files: [{ path: "model.safetensors" }]
});

assert.equal(embedding.primaryTool, "not suitable for ordinary chatbot use", "embedding models are not treated as chat models");
assert.ok(embedding.alternatives.join(" ").includes("sentence-transformers"), "embedding models point to specialist retrieval tooling");

console.log("recommendation-engine fixtures passed");
