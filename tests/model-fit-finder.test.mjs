import assert from "node:assert/strict";
import { buildModelFitFinder, rankModelCandidates } from "../services/model-fit-finder.js";

const choices = {
  goal: "chat",
  targetSize: "compact",
  fileFormat: "gguf",
  quantisation: "q4",
  route: "beginner",
  priority: "balanced",
  rankBy: "downloads",
  keyword: "",
  localOnly: true,
  permissiveOnly: false,
  fieldOrder: ["rank", "target", "format", "quantisation", "route", "priority", "keyword"]
};

const finder = buildModelFitFinder({
  operatingSystem: "Windows 11",
  gpuVramGb: 6,
  systemRamGb: 32,
  preferredTools: ["LM Studio"]
}, choices);

const recommendation = rankModelCandidates([
  {
    modelId: "creator/tiny-chat-3B-Q4_K_M-GGUF",
    downloads: 100000,
    likes: 500,
    tags: ["gguf", "q4_k_m", "text-generation"],
    pipeline_tag: "text-generation",
    library_name: "gguf"
  },
  {
    modelId: "creator/other-chat-4B-Q4_K_M-GGUF",
    downloads: 90000,
    likes: 800,
    tags: ["gguf", "q4_k_m", "text-generation"],
    pipeline_tag: "text-generation",
    library_name: "gguf"
  },
  {
    modelId: "creator/larger-chat-7B-Q4_K_M-GGUF",
    downloads: 85000,
    likes: 700,
    tags: ["gguf", "q4_k_m", "text-generation"],
    pipeline_tag: "text-generation",
    library_name: "gguf"
  }
], finder, choices);

assert.equal(recommendation.status, "found");
assert.equal(recommendation.model.modelId, "creator/tiny-chat-3B-Q4_K_M-GGUF");
assert.equal(recommendation.comparisons.length, 2);
assert.equal(recommendation.comparisons[0].modelId, "creator/other-chat-4B-Q4_K_M-GGUF");
assert.ok(recommendation.comparisons[0].reason.includes("matches"));
assert.ok(recommendation.comparisons[0].tradeOff.includes("Trade-off") || recommendation.comparisons[0].tradeOff.includes("Compare"));
assert.ok(recommendation.summary.includes("starting candidate"));

console.log("model-fit-finder comparison fixtures passed");
