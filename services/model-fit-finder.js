const GOAL_CONFIG = {
  chat: {
    label: "Chat",
    taskPhrase: "chat or instruction model",
    format: "GGUF",
    quantisation: "Q4_K_M first; Q5_K_M if the model is already small",
    searchTerms: ["gguf", "q4_k_m", "instruct", "chat"],
    avoid: "Avoid base-only models, FP16/BF16 weights, and 13B+ models unless you expect slow RAM offloading."
  },
  code: {
    label: "Coding",
    taskPhrase: "coding assistant model",
    format: "GGUF",
    quantisation: "Q4_K_M first; Q5_K_M only for smaller coding models",
    searchTerms: ["gguf", "q4_k_m", "code", "instruct"],
    avoid: "Avoid large FP16 coding models and repositories without a chat or instruct variant."
  },
  embedding: {
    label: "Search",
    taskPhrase: "embedding model",
    format: "safetensors or sentence-transformers",
    quantisation: "Quantisation is less important than choosing a small embedding model",
    searchTerms: ["sentence-transformers", "embedding", "small"],
    avoid: "Avoid chat models; embeddings are for search, matching, retrieval, or clustering."
  },
  image: {
    label: "Images",
    taskPhrase: "image generation model",
    format: "Diffusers-compatible repository",
    quantisation: "FP16 can still be heavy; prefer small or turbo/lightning variants on modest GPUs",
    searchTerms: ["diffusers", "text-to-image", "small"],
    avoid: "Avoid large diffusion checkpoints until the extension can estimate image-model memory more precisely."
  }
};

const ROUTE_CONFIG = {
  beginner: {
    label: "Beginner app",
    searchBoosts: ["lm studio"],
    routeText: "Prefer a beginner desktop route when possible."
  },
  ollama: {
    label: "Ollama",
    searchBoosts: ["ollama"],
    routeText: "Prefer models with an Ollama-ready path or enough information to create one."
  },
  python: {
    label: "Python",
    searchBoosts: ["transformers"],
    routeText: "Python gives more control, but the setup is more technical."
  },
  unsure: {
    label: "Not sure",
    searchBoosts: [],
    routeText: "Start with the simplest route that matches the detected model files."
  }
};

const PRIORITY_CONFIG = {
  balanced: {
    label: "Balanced",
    rangeBias: 1,
    text: "Balance output quality with a realistic local setup."
  },
  speed: {
    label: "Speed",
    rangeBias: 0.65,
    text: "Prefer smaller models that start quickly and leave memory spare."
  },
  quality: {
    label: "Quality",
    rangeBias: 1.25,
    text: "Prefer the largest model that still looks realistic for this machine."
  }
};

export function buildModelFitFinder(hardwareProfile = {}, choices = {}) {
  const goal = getConfig(GOAL_CONFIG, choices.goal, "chat");
  const route = getConfig(ROUTE_CONFIG, choices.route, "beginner");
  const priority = getConfig(PRIORITY_CONFIG, choices.priority, "balanced");
  const sizing = estimateLocalSizeGuidance(hardwareProfile, goal.key, priority.rangeBias);
  const queryTerms = buildSearchTerms(goal, route, sizing);

  return {
    summary: buildSummary(hardwareProfile, goal, sizing),
    rows: [
      ["Best target", `${goal.taskPhrase}; ${sizing.primaryRange}.`],
      ["Stretch target", sizing.stretchRange],
      ["File format", goal.format],
      ["Quantisation", goal.quantisation],
      ["Route", `${route.routeText} ${priority.text}`],
      ["Search terms", queryTerms.join(" ")],
      ["Avoid", goal.avoid]
    ],
    searchLinks: buildSearchLinks(goal, route, queryTerms)
  };
}

function getConfig(config, value, fallbackKey) {
  const key = typeof value === "string" && config[value] ? value : fallbackKey;
  return {
    key,
    ...config[key]
  };
}

function estimateLocalSizeGuidance(hardwareProfile, goal, rangeBias) {
  const gpuVramGb = Number(hardwareProfile?.gpuVramGb);
  const systemRamGb = Number(hardwareProfile?.systemRamGb);

  if (goal === "embedding") {
    return {
      primaryRange: "small embedding models",
      stretchRange: "Larger embedding models are fine if Python setup and disk space are acceptable",
      searchSizeTerms: ["small"]
    };
  }

  if (goal === "image") {
    const hasModestGpu = Number.isFinite(gpuVramGb) && gpuVramGb >= 6;
    return {
      primaryRange: hasModestGpu ? "small or optimised image models" : "hosted image inference before local downloads",
      stretchRange: hasModestGpu ? "SDXL-class models may still be tight; start with smaller variants" : "Use hosted inference before downloading large image models",
      searchSizeTerms: hasModestGpu ? ["small", "turbo"] : ["small"]
    };
  }

  const baseBand = chooseLanguageModelBand(gpuVramGb, systemRamGb);
  const adjustedBand = applyPriorityBias(baseBand, rangeBias);

  return {
    primaryRange: adjustedBand.primary,
    stretchRange: adjustedBand.stretch,
    searchSizeTerms: adjustedBand.searchTerms
  };
}

function chooseLanguageModelBand(gpuVramGb, systemRamGb) {
  if (Number.isFinite(gpuVramGb) && gpuVramGb >= 24) {
    return createBand("13B-30B Q4 models", "30B+ Q4 models may work, but check VRAM and context length carefully", ["13b", "30b"]);
  }

  if (Number.isFinite(gpuVramGb) && gpuVramGb >= 12) {
    return createBand("7B-13B Q4 models", "14B models may work if quantised and context length is not extreme", ["7b", "13b"]);
  }

  if (Number.isFinite(gpuVramGb) && gpuVramGb >= 8) {
    return createBand("3B-7B Q4 models", "8B models are worth trying when they are well quantised", ["3b", "7b"]);
  }

  if (Number.isFinite(gpuVramGb) && gpuVramGb >= 6) {
    return createBand("3B-4B Q4 models for comfort", "7B Q4 can be possible, but expect partial offloading or slower runs", ["3b", "4b", "7b"]);
  }

  if (Number.isFinite(systemRamGb) && systemRamGb >= 16) {
    return createBand("1B-3B Q4 models", "7B Q4 may run from system RAM, but it is a patience test", ["1b", "3b"]);
  }

  return createBand("1B-2B Q4 models", "Use hosted inference for anything larger until the hardware profile improves", ["1b", "2b"]);
}

function createBand(primary, stretch, searchTerms) {
  return {
    primary,
    stretch,
    searchTerms
  };
}

function applyPriorityBias(band, rangeBias) {
  if (rangeBias < 0.8) {
    return {
      primary: band.primary.replace(/(?: for comfort)?$/, " with the smallest practical size"),
      stretch: "Only stretch upward after a smaller model runs comfortably.",
      searchTerms: band.searchTerms.slice(0, 2)
    };
  }

  if (rangeBias > 1.15) {
    return {
      primary: band.primary,
      stretch: `${band.stretch}. Prefer Q5_K_M only when the target range is already comfortable.`,
      searchTerms: band.searchTerms
    };
  }

  return band;
}

function buildSearchTerms(goal, route, sizing) {
  const routeBoosts = goal.key === "chat" || goal.key === "code" ? route.searchBoosts : [];

  return Array.from(new Set([
    ...goal.searchTerms,
    ...sizing.searchSizeTerms,
    ...routeBoosts
  ]));
}

function buildSearchLinks(goal, route, queryTerms) {
  const primaryQuery = queryTerms.join(" ");
  const fallbackQuery = [goal.searchTerms[0], goal.searchTerms[1], route.searchBoosts[0]]
    .filter(Boolean)
    .join(" ");

  return [
    {
      label: `${goal.label} models`,
      url: buildHuggingFaceSearchUrl(primaryQuery)
    },
    {
      label: "Broader search",
      url: buildHuggingFaceSearchUrl(fallbackQuery || primaryQuery)
    }
  ];
}

function buildHuggingFaceSearchUrl(query) {
  return `https://huggingface.co/models?sort=trending&search=${encodeURIComponent(query)}`;
}

function buildSummary(hardwareProfile, goal, sizing) {
  const profile = formatHardwareProfile(hardwareProfile);
  return `${profile}: ${capitalizeFirst(sizing.primaryRange)} ${getRangeVerb(sizing.primaryRange)} the safest starting point for ${withIndefiniteArticle(goal.taskPhrase)}.`;
}

function formatHardwareProfile(profile) {
  const parts = [];
  const gpuVramGb = Number(profile?.gpuVramGb);
  const systemRamGb = Number(profile?.systemRamGb);

  if (profile?.operatingSystem) {
    parts.push(profile.operatingSystem);
  }

  if (Number.isFinite(gpuVramGb)) {
    parts.push(`${gpuVramGb} GB VRAM`);
  }

  if (Number.isFinite(systemRamGb)) {
    parts.push(`${systemRamGb} GB RAM`);
  }

  return parts.length ? parts.join(", ") : "Saved hardware profile";
}

function withIndefiniteArticle(phrase) {
  return /^[aeiou]/i.test(phrase) ? `an ${phrase}` : `a ${phrase}`;
}

function capitalizeFirst(text) {
  return `${String(text).charAt(0).toUpperCase()}${String(text).slice(1)}`;
}

function getRangeVerb(text) {
  return /\bmodels\b/i.test(text) ? "are" : "is";
}
