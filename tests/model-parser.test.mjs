import assert from "node:assert/strict";
import { parseModelFacts } from "../services/model-parser.js";

function fixture(overrides) {
  return {
    modelId: "example/model",
    tags: [],
    files: [{ path: "config.json" }, { path: "model.safetensors" }],
    rawMetadata: {
      config: {
        architectures: ["AutoModelForCausalLM"]
      }
    },
    modelCardMarkdown: "",
    ...overrides
  };
}

const cases = [
  {
    name: "chat model from conversational metadata",
    model: fixture({
      modelId: "Qwen/Qwen3-0.6B",
      pipelineTag: "conversational",
      tags: ["conversational"]
    }),
    expected: "chat"
  },
  {
    name: "instruct model from model name",
    model: fixture({
      modelId: "meta-llama/Llama-3.1-8B-Instruct",
      pipelineTag: "text-generation"
    }),
    expected: "instruct"
  },
  {
    name: "base model from tags",
    model: fixture({
      modelId: "mistralai/Mistral-7B-v0.1",
      tags: ["base"]
    }),
    expected: "base"
  },
  {
    name: "code model beats generic instruct clues",
    model: fixture({
      modelId: "Qwen/Qwen2.5-Coder-7B-Instruct",
      pipelineTag: "text-generation"
    }),
    expected: "code-focused"
  },
  {
    name: "embedding model from pipeline tag and library",
    model: fixture({
      modelId: "sentence-transformers/all-MiniLM-L6-v2",
      pipelineTag: "feature-extraction",
      libraryName: "sentence-transformers"
    }),
    expected: "embedding"
  },
  {
    name: "image model from diffusers metadata",
    model: fixture({
      modelId: "stabilityai/stable-diffusion-xl-base-1.0",
      pipelineTag: "text-to-image",
      libraryName: "diffusers",
      rawMetadata: { config: { architectures: ["StableDiffusionPipeline"] } }
    }),
    expected: "image"
  },
  {
    name: "audio model from speech pipeline",
    model: fixture({
      modelId: "openai/whisper-small",
      pipelineTag: "automatic-speech-recognition",
      rawMetadata: { config: { architectures: ["WhisperForConditionalGeneration"] } }
    }),
    expected: "audio"
  },
  {
    name: "multimodal model from vision-language task",
    model: fixture({
      modelId: "llava-hf/llava-1.5-7b-hf",
      pipelineTag: "image-text-to-text",
      tags: ["vision-language"],
      rawMetadata: { config: { architectures: ["LlavaForConditionalGeneration"] } }
    }),
    expected: "multimodal"
  },
  {
    name: "reranker model from reranker tags despite classification task",
    model: fixture({
      modelId: "BAAI/bge-reranker-base",
      pipelineTag: "text-classification",
      tags: ["reranker", "cross-encoder"],
      libraryName: "sentence-transformers"
    }),
    expected: "reranker"
  },
  {
    name: "classifier model from classification pipeline",
    model: fixture({
      modelId: "distilbert/distilbert-base-uncased-finetuned-sst-2-english",
      pipelineTag: "text-classification",
      tags: ["text-classification", "sentiment-analysis"],
      rawMetadata: { config: { architectures: ["DistilBertForSequenceClassification"] } }
    }),
    expected: "classifier"
  },
  {
    name: "ambiguous weak page stays unclear",
    model: fixture({
      modelId: "example/chat-code-model",
      rawMetadata: { config: {} }
    }),
    expected: "unclear"
  },
  {
    name: "bare text-generation page stays unknown",
    model: fixture({
      modelId: "example/plain-model",
      pipelineTag: "text-generation",
      rawMetadata: { config: {} }
    }),
    expected: null
  }
];

for (const testCase of cases) {
  const interpreted = parseModelFacts(testCase.model);
  assert.equal(interpreted.modelKind.value, testCase.expected, testCase.name);
}

const chatTerms = parseModelFacts(fixture({
  modelId: "example/helpful-chat-model",
  pipelineTag: "conversational",
  tags: ["conversational"],
  rawMetadata: {
    config: {
      chat_template: "{% for message in messages %}{{ message.role }}: {{ message.content }}{% endfor %}"
    }
  }
})).glossaryTermIds;

assert.ok(chatTerms.includes("chat-template"), "chat template term is shown for chat-template clues");

const benchmarkTerms = parseModelFacts(fixture({
  modelId: "example/benchmarked-model",
  modelCardMarkdown: "## Evaluation\n\nThis model was evaluated on MMLU and HumanEval benchmarks."
})).glossaryTermIds;

assert.ok(benchmarkTerms.includes("evaluation-benchmark"), "benchmark term is shown for evaluation clues");

const datasetTerms = parseModelFacts(fixture({
  modelId: "example/trained-model",
  modelCardMarkdown: "## Training data\n\nThe model was fine-tuned on a small public dataset."
})).glossaryTermIds;

assert.ok(datasetTerms.includes("dataset"), "dataset term is shown for training-data clues");

const fileGroups = parseModelFacts(fixture({
  modelId: "example/file-heavy-model",
  files: [
    { path: "model.Q4_K_M.gguf" },
    { path: "model.safetensors" },
    { path: "tokenizer.json" },
    { path: "config.json" },
    { path: "adapter_model.safetensors" },
    { path: "README.md" }
  ]
})).relevantFiles;

const fileByPath = new Map(fileGroups.map((file) => [file.path, file]));

assert.equal(fileByPath.get("model.Q4_K_M.gguf")?.category, "quantised-local", "quantised GGUF is grouped as a local model file");
assert.equal(fileByPath.get("model.safetensors")?.category, "runnable-model", "safetensors weights are grouped as model weights");
assert.equal(fileByPath.get("tokenizer.json")?.category, "tokenizer", "tokenizer files are grouped separately");
assert.equal(fileByPath.get("config.json")?.category, "config", "config files are grouped separately");
assert.equal(fileByPath.get("adapter_model.safetensors")?.category, "adapter", "adapter files are grouped separately from base weights");
assert.equal(fileByPath.get("README.md")?.category, "example", "readme metadata is grouped as lower-priority context");
assert.equal(fileGroups[0].path, "model.Q4_K_M.gguf", "most useful beginner file appears first");

console.log(`model-parser fixtures passed: ${cases.length}`);
