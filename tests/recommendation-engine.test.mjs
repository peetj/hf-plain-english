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
  modelId: "example/Raw-7B-Instruct",
  files: [{ path: "model.safetensors" }],
  libraryName: "transformers"
});

assert.equal(transformers.primaryTool, "Python Transformers", "Transformers safetensors repos recommend Python Transformers");
assert.ok(transformers.notRecommended.some((note) => /LM Studio/.test(note)), "raw weights warn against assuming desktop tools");
assert.ok(transformers.commands.some((command) => /pip install transformers/.test(command)), "safe Transformers routes include setup command examples");
assert.ok(transformers.commands.every((command) => !/(?:hf_[A-Za-z0-9]+|token\s*=)/i.test(command)), "commands do not include secrets or access tokens");

const embedding = recommend({
  modelId: "sentence-transformers/all-MiniLM-L6-v2",
  pipelineTag: "feature-extraction",
  libraryName: "sentence-transformers",
  files: [{ path: "model.safetensors" }]
});

assert.equal(embedding.primaryTool, "not suitable for ordinary chatbot use", "embedding models are not treated as chat models");
assert.ok(embedding.alternatives.join(" ").includes("sentence-transformers"), "embedding models point to specialist retrieval tooling");
assert.equal(embedding.commands.length, 0, "specialist non-chat models do not show commands");

assert.equal(lmStudio.commands.length, 0, "LM Studio route does not pretend a shell command is needed");
assert.ok(ollama.commands.some((command) => command.includes("ollama run example/helpful")), "Ollama route uses the model-card command when present");

const llamaCpp = recommend({
  modelId: "example/Base-7B-GGUF",
  tags: ["base"],
  files: [{ path: "base.Q4_K_M.gguf" }]
});

assert.equal(llamaCpp.primaryTool, "llama.cpp", "GGUF base models without beginner preference can use llama.cpp");
assert.ok(llamaCpp.commands.some((command) => /llama-cli/.test(command)), "llama.cpp route includes an example command");

const gated = recommend({
  modelId: "example/Gated-7B-Instruct",
  gated: true,
  files: [{ path: "model.safetensors" }],
  libraryName: "transformers"
});

assert.equal(gated.commands.length, 0, "gated models do not show commands");

const unknown = recommend({
  modelId: "example/Unknown-7B",
  files: [{ path: "model.safetensors" }],
  libraryName: "transformers"
});

assert.equal(unknown.commands.length, 0, "unknown model types do not show commands");

console.log("recommendation-engine fixtures passed");
