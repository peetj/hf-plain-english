const BITS_PER_PARAMETER = {
  FP32: 32,
  FP16: 16,
  BF16: 16,
  INT8: 8,
  Q8: 8,
  Q8_0: 8,
  Q6: 6,
  Q6_K: 6,
  Q5: 5,
  Q5_K: 5,
  Q5_K_M: 5,
  Q4: 4,
  Q4_0: 4,
  Q4_1: 4,
  Q4_K: 4,
  Q4_K_M: 4,
  Q4_K_S: 4,
  Q3: 3,
  Q3_K: 3,
  Q3_K_M: 3,
  Q3_K_S: 3,
  Q2: 2,
  Q2_K: 2
};

const UNKNOWN_FIT = {
  gpu: "unknown",
  systemRam: "unknown",
  overall: "unknown"
};

/**
 * Estimate local memory fit from parsed model facts and a user hardware profile.
 *
 * This is intentionally approximate. It estimates model weight memory from
 * parameter count and detected precision/quantisation, then adds conservative
 * runtime overhead. It does not claim exact VRAM requirements.
 *
 * @param {object} interpreted Parsed model facts from model-parser.js.
 * @param {object} hardwareProfile Local hardware profile.
 * @returns {{
 *   knownParameterCount: boolean,
 *   parameterCount: number | null,
 *   precision: string | null,
 *   quantisation: string | null,
 *   bitsPerParameter: number | null,
 *   estimatedWeightMemoryGb: number | null,
 *   estimatedRuntimeMemoryGb: { minimum: number | null, likely: number | null },
 *   fit: { gpu: string, systemRam: string, overall: string },
 *   explanation: string,
 *   assumptions: string[]
 * }}
 */
export function estimateHardwareFit(interpreted, hardwareProfile) {
  const parameterCount = getParameterCount(interpreted);
  const precision = choosePrecision(interpreted?.quantisations || []);
  const bitsPerParameter = precision ? getBitsPerParameter(precision.value) : null;
  const assumptions = buildBaseAssumptions(hardwareProfile);

  if (!Number.isFinite(parameterCount)) {
    return {
      knownParameterCount: false,
      parameterCount: null,
      precision: precision?.value || null,
      quantisation: precision?.value || null,
      bitsPerParameter,
      estimatedWeightMemoryGb: null,
      estimatedRuntimeMemoryGb: {
        minimum: null,
        likely: null
      },
      fit: UNKNOWN_FIT,
      explanation: "Cannot estimate hardware fit because a reliable parameter count was not found.",
      assumptions
    };
  }

  if (!Number.isFinite(bitsPerParameter)) {
    return {
      knownParameterCount: true,
      parameterCount,
      precision: null,
      quantisation: null,
      bitsPerParameter: null,
      estimatedWeightMemoryGb: null,
      estimatedRuntimeMemoryGb: {
        minimum: null,
        likely: null
      },
      fit: UNKNOWN_FIT,
      explanation: "Cannot estimate hardware fit because the model precision or quantisation was not detected.",
      assumptions
    };
  }

  const estimatedWeightMemoryGb = roundGb((parameterCount * bitsPerParameter) / 8 / 1_000_000_000);
  const overhead = chooseRuntimeOverhead(bitsPerParameter, interpreted);
  const minimumRuntimeGb = roundGb(Math.max(estimatedWeightMemoryGb * overhead.minimumMultiplier, estimatedWeightMemoryGb + overhead.minimumExtraGb));
  const likelyRuntimeGb = roundGb(Math.max(estimatedWeightMemoryGb * overhead.likelyMultiplier, estimatedWeightMemoryGb + overhead.likelyExtraGb));
  const fit = categorizeFit(minimumRuntimeGb, likelyRuntimeGb, hardwareProfile);

  return {
    knownParameterCount: true,
    parameterCount,
    precision: precision.value,
    quantisation: precision.value,
    bitsPerParameter,
    estimatedWeightMemoryGb,
    estimatedRuntimeMemoryGb: {
      minimum: minimumRuntimeGb,
      likely: likelyRuntimeGb
    },
    fit,
    explanation: buildExplanation({
      parameterCount,
      precision: precision.value,
      estimatedWeightMemoryGb,
      minimumRuntimeGb,
      likelyRuntimeGb,
      fit,
      hardwareProfile
    }),
    assumptions: [
      ...assumptions,
      `Detected ${precision.value} as the memory estimate precision from ${precision.source}.`,
      "Runtime memory is estimated above model weight memory to allow for context/KV cache, temporary buffers, backend overhead, and partial GPU offloading differences.",
      "This is not an exact VRAM requirement."
    ]
  };
}

function getParameterCount(interpreted) {
  const value = interpreted?.parameterCount?.value;
  return Number.isFinite(value) ? value : null;
}

function choosePrecision(quantisations) {
  const candidates = quantisations
    .map((item) => ({
      value: normalizePrecisionLabel(item.value),
      source: item.source,
      confidence: item.confidence
    }))
    .filter((item) => Number.isFinite(getBitsPerParameter(item.value)));

  if (candidates.length === 0) {
    return null;
  }

  const filenameCandidate = candidates.find((item) => item.source === "filename");

  if (filenameCandidate) {
    return filenameCandidate;
  }

  return candidates[0];
}

function normalizePrecisionLabel(label) {
  const upperLabel = String(label || "").toUpperCase();

  if (upperLabel === "4-BIT") {
    return "Q4";
  }

  if (upperLabel === "8-BIT") {
    return "Q8";
  }

  const broadMatch = upperLabel.match(/^Q([2-8])(?:_|$)/);

  if (broadMatch && !BITS_PER_PARAMETER[upperLabel]) {
    return `Q${broadMatch[1]}`;
  }

  const iqMatch = upperLabel.match(/^IQ([1-4])/);

  if (iqMatch) {
    return `Q${iqMatch[1]}`;
  }

  return upperLabel;
}

function getBitsPerParameter(label) {
  return BITS_PER_PARAMETER[normalizePrecisionLabel(label)] ?? null;
}

function chooseRuntimeOverhead(bitsPerParameter, interpreted) {
  const contextLength = interpreted?.contextLength?.value;
  const hasLongContext = Number.isFinite(contextLength) && contextLength > 8192;
  const quantized = bitsPerParameter <= 8;

  return {
    minimumMultiplier: quantized ? 1.6 : 1.35,
    likelyMultiplier: hasLongContext ? 2.8 : quantized ? 2.35 : 1.85,
    minimumExtraGb: quantized ? 0.35 : 0.6,
    likelyExtraGb: hasLongContext ? 1.5 : quantized ? 0.9 : 1.2
  };
}

function categorizeFit(minimumRuntimeGb, likelyRuntimeGb, hardwareProfile) {
  const gpuVramGb = Number(hardwareProfile?.gpuVramGb);
  const systemRamGb = Number(hardwareProfile?.systemRamGb);
  const gpu = categorizeGpuFit(minimumRuntimeGb, likelyRuntimeGb, gpuVramGb);
  const systemRam = categorizeSystemRamFit(likelyRuntimeGb, systemRamGb);

  return {
    gpu,
    systemRam,
    overall: chooseOverallFit(gpu, systemRam)
  };
}

function categorizeGpuFit(minimumRuntimeGb, likelyRuntimeGb, gpuVramGb) {
  if (!Number.isFinite(gpuVramGb) || gpuVramGb <= 0) {
    return "unknown";
  }

  if (likelyRuntimeGb <= gpuVramGb * 0.7) {
    return "comfortable";
  }

  if (likelyRuntimeGb <= gpuVramGb) {
    return "likely";
  }

  if (minimumRuntimeGb <= gpuVramGb) {
    return "slow-or-tight";
  }

  return "possible-with-offloading";
}

function categorizeSystemRamFit(likelyRuntimeGb, systemRamGb) {
  if (!Number.isFinite(systemRamGb) || systemRamGb <= 0) {
    return "unknown";
  }

  const practicalRamGb = systemRamGb * 0.65;

  if (likelyRuntimeGb <= practicalRamGb * 0.45) {
    return "comfortable";
  }

  if (likelyRuntimeGb <= practicalRamGb * 0.7) {
    return "likely";
  }

  if (likelyRuntimeGb <= practicalRamGb) {
    return "slow-or-tight";
  }

  return "unlikely";
}

function chooseOverallFit(gpu, systemRam) {
  if (gpu === "comfortable" && systemRam !== "unlikely") {
    return "comfortable";
  }

  if ((gpu === "comfortable" || gpu === "likely") && (systemRam === "comfortable" || systemRam === "likely")) {
    return "likely";
  }

  if (gpu === "possible-with-offloading" && (systemRam === "comfortable" || systemRam === "likely")) {
    return "possible-with-offloading";
  }

  if (gpu === "slow-or-tight" && (systemRam === "comfortable" || systemRam === "likely")) {
    return "possible-with-offloading";
  }

  if (gpu === "slow-or-tight" || systemRam === "slow-or-tight") {
    return "slow-or-tight";
  }

  if (gpu === "unknown" || systemRam === "unknown") {
    return "unknown";
  }

  return "unlikely";
}

function buildExplanation({ parameterCount, precision, estimatedWeightMemoryGb, minimumRuntimeGb, likelyRuntimeGb, fit, hardwareProfile }) {
  const profileText = formatHardwareProfile(hardwareProfile);

  return `Using ${formatParameterCount(parameterCount)} parameters at ${precision}, the model weights are estimated at about ${estimatedWeightMemoryGb} GB. Actual runtime memory is higher; a cautious range is about ${minimumRuntimeGb}-${likelyRuntimeGb} GB. Compared with ${profileText}, the overall fit is ${fit.overall}.`;
}

function buildBaseAssumptions(hardwareProfile) {
  const assumptions = [];

  if (hardwareProfile?.operatingSystem) {
    assumptions.push(`Hardware profile operating system: ${hardwareProfile.operatingSystem}.`);
  }

  if (Number.isFinite(Number(hardwareProfile?.gpuVramGb))) {
    assumptions.push(`GPU VRAM from local profile: ${hardwareProfile.gpuVramGb} GB.`);
  } else {
    assumptions.push("GPU VRAM is missing from the local hardware profile.");
  }

  if (Number.isFinite(Number(hardwareProfile?.systemRamGb))) {
    assumptions.push(`System RAM from local profile: ${hardwareProfile.systemRamGb} GB.`);
  } else {
    assumptions.push("System RAM is missing from the local hardware profile.");
  }

  return assumptions;
}

function formatHardwareProfile(hardwareProfile) {
  const gpuVramGb = Number(hardwareProfile?.gpuVramGb);
  const systemRamGb = Number(hardwareProfile?.systemRamGb);

  if (Number.isFinite(gpuVramGb) && Number.isFinite(systemRamGb)) {
    return `${gpuVramGb} GB GPU VRAM and ${systemRamGb} GB system RAM`;
  }

  if (Number.isFinite(systemRamGb)) {
    return `${systemRamGb} GB system RAM`;
  }

  return "the stored hardware profile";
}

function formatParameterCount(value) {
  if (value >= 1_000_000_000) {
    return `${trimDecimal(value / 1_000_000_000)}B`;
  }

  if (value >= 1_000_000) {
    return `${trimDecimal(value / 1_000_000)}M`;
  }

  return value.toLocaleString();
}

function roundGb(value) {
  return Math.round(value * 10) / 10;
}

function trimDecimal(value) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}
