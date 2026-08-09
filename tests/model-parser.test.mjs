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

console.log(`model-parser fixtures passed: ${cases.length}`);
