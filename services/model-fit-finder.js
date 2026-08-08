const GOAL_CONFIG = {
  chat: {
    label: "Chat",
    taskPhrase: "chat or instruction model",
    format: "GGUF",
    quantisation: "Q4_K_M first; Q5_K_M if the model is already small",
    searchFilter: "Text Generation + GGUF",
    filters: {
      library: "gguf",
      pipelineTag: "text-generation"
    },
    secondaryLabel: "Q4_K_M variants",
    secondarySearch: "Q4_K_M",
    avoid: "Avoid base-only models, FP16/BF16 weights, and 13B+ models unless you expect slow RAM offloading."
  },
  code: {
    label: "Coding",
    taskPhrase: "coding assistant model",
    format: "GGUF",
    quantisation: "Q4_K_M first; Q5_K_M only for smaller coding models",
    searchFilter: "Text Generation + GGUF, narrowed by code",
    filters: {
      library: "gguf",
      pipelineTag: "text-generation",
      search: "code"
    },
    secondaryLabel: "Coder variants",
    secondarySearch: "coder",
    avoid: "Avoid large FP16 coding models and repositories without a chat or instruct variant."
  },
  embedding: {
    label: "Embeddings",
    taskPhrase: "embedding model",
    format: "safetensors or sentence-transformers",
    quantisation: "Quantisation is less important than choosing a small embedding model",
    searchFilter: "Feature Extraction + Sentence Transformers",
    filters: {
      library: "sentence-transformers",
      pipelineTag: "feature-extraction"
    },
    secondaryLabel: "Embedding name search",
    secondarySearch: "embedding",
    avoid: "Avoid chat models; embeddings are for search, matching, retrieval, or clustering."
  },
  image: {
    label: "Images",
    taskPhrase: "image generation model",
    format: "Diffusers-compatible repository",
    quantisation: "FP16 can still be heavy; prefer small or turbo/lightning variants on modest GPUs",
    searchFilter: "Text-to-Image + Diffusers",
    filters: {
      library: "diffusers",
      pipelineTag: "text-to-image"
    },
    secondaryLabel: "Fast image variants",
    secondarySearch: "turbo",
    avoid: "Avoid large diffusion checkpoints until the extension can estimate image-model memory more precisely."
  }
};

const ROUTE_CONFIG = {
  beginner: {
    label: "Beginner app",
    routeText: "Prefer a beginner desktop route when possible."
  },
  ollama: {
    label: "Ollama",
    routeText: "Prefer models with an Ollama-ready path or enough information to create one."
  },
  python: {
    label: "Python",
    routeText: "Python gives more control, but the setup is more technical."
  },
  unsure: {
    label: "Not sure",
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

  return {
    summary: buildSummary(hardwareProfile, goal, sizing),
    rows: [
      ["Best target", `${goal.taskPhrase}; ${sizing.primaryRange}.`],
      ["Stretch target", sizing.stretchRange],
      ["File format", goal.format],
      ["Quantisation", goal.quantisation],
      ["Route", `${route.routeText} ${priority.text}`],
      ["Search filter", goal.searchFilter],
      ["Scan results for", sizing.scanAdvice],
      ["Avoid", goal.avoid]
    ],
    searchLinks: buildSearchLinks(goal)
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
      scanAdvice: "small, well-documented embedding models with clear sentence-transformers or Transformers usage."
    };
  }

  if (goal === "image") {
    const hasModestGpu = Number.isFinite(gpuVramGb) && gpuVramGb >= 6;
    return {
      primaryRange: hasModestGpu ? "small or optimised image models" : "hosted image inference before local downloads",
      stretchRange: hasModestGpu ? "SDXL-class models may still be tight; start with smaller variants" : "Use hosted inference before downloading large image models",
      scanAdvice: hasModestGpu
        ? "small, turbo, lightning, or low-VRAM notes before downloading."
        : "hosted demos or inference-provider support before local files."
    };
  }

  const baseBand = chooseLanguageModelBand(gpuVramGb, systemRamGb);
  const adjustedBand = applyPriorityBias(baseBand, rangeBias);

  return {
    primaryRange: adjustedBand.primary,
    stretchRange: adjustedBand.stretch,
    scanAdvice: adjustedBand.scanAdvice
  };
}

function chooseLanguageModelBand(gpuVramGb, systemRamGb) {
  if (Number.isFinite(gpuVramGb) && gpuVramGb >= 24) {
    return createBand("13B-30B Q4 models", "30B+ Q4 models may work, but check VRAM and context length carefully", "model cards or filenames around 13B-30B with Q4_K_M files.");
  }

  if (Number.isFinite(gpuVramGb) && gpuVramGb >= 12) {
    return createBand("7B-13B Q4 models", "14B models may work if quantised and context length is not extreme", "model cards or filenames around 7B-13B with Q4_K_M files.");
  }

  if (Number.isFinite(gpuVramGb) && gpuVramGb >= 8) {
    return createBand("3B-7B Q4 models", "8B models are worth trying when they are well quantised", "model cards or filenames around 3B-7B with Q4_K_M files.");
  }

  if (Number.isFinite(gpuVramGb) && gpuVramGb >= 6) {
    return createBand("3B-4B Q4 models for comfort", "7B Q4 can be possible, but expect partial offloading or slower runs", "model cards or filenames around 3B-4B with Q4_K_M files; treat 7B as a stretch.");
  }

  if (Number.isFinite(systemRamGb) && systemRamGb >= 16) {
    return createBand("1B-3B Q4 models", "7B Q4 may run from system RAM, but it is a patience test", "model cards or filenames around 1B-3B with Q4_K_M files.");
  }

  return createBand("1B-2B Q4 models", "Use hosted inference for anything larger until the hardware profile improves", "model cards or filenames around 1B-2B with Q4_K_M files.");
}

function createBand(primary, stretch, scanAdvice) {
  return {
    primary,
    stretch,
    scanAdvice
  };
}

function applyPriorityBias(band, rangeBias) {
  if (rangeBias < 0.8) {
    return {
      primary: band.primary.replace(/(?: for comfort)?$/, " with the smallest practical size"),
      stretch: "Only stretch upward after a smaller model runs comfortably.",
      scanAdvice: `${band.scanAdvice} Prefer the lower end of that range.`
    };
  }

  if (rangeBias > 1.15) {
    return {
      primary: band.primary,
      stretch: `${band.stretch}. Prefer Q5_K_M only when the target range is already comfortable.`,
      scanAdvice: `${band.scanAdvice} You can compare Q5_K_M only after a Q4_K_M file looks practical.`
    };
  }

  return band;
}

function buildSearchLinks(goal) {
  return [
    {
      label: `${goal.label} filtered search`,
      url: buildHuggingFaceModelsUrl(goal.filters)
    },
    {
      label: goal.secondaryLabel,
      url: buildHuggingFaceModelsUrl({
        ...goal.filters,
        search: goal.secondarySearch
      })
    }
  ];
}

function buildHuggingFaceModelsUrl(filters) {
  const params = new URLSearchParams({
    sort: "trending"
  });

  if (filters?.library) {
    params.set("library", filters.library);
  }

  if (filters?.pipelineTag) {
    params.set("pipeline_tag", filters.pipelineTag);
  }

  if (filters?.search) {
    params.set("search", filters.search);
  }

  return `https://huggingface.co/models?${params.toString()}`;
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
