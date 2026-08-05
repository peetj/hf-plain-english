import { parseHuggingFaceModelUrl } from "../services/huggingface-url-parser.js";
import { fetchHuggingFaceModel } from "../services/huggingface-api.js";
import { parseModelFacts } from "../services/model-parser.js";
import { estimateHardwareFit } from "../services/hardware-estimator.js";

const activeUrlElement = document.querySelector("#active-url");
const statusCard = document.querySelector("#status-card");
const statusMessageElement = document.querySelector("#status-message");
const overviewTextElement = document.querySelector("#overview-text");
const refreshButton = document.querySelector("#refresh-button");
const factsSection = document.querySelector("#facts-section");
const factsList = document.querySelector("#facts-list");
const interpretationSection = document.querySelector("#interpretation-section");
const interpretationList = document.querySelector("#interpretation-list");
const warningList = document.querySelector("#warning-list");
const hardwareSection = document.querySelector("#hardware-section");
const hardwareSummaryElement = document.querySelector("#hardware-summary");
const hardwareList = document.querySelector("#hardware-list");
const assumptionsList = document.querySelector("#assumptions-list");
const filesSection = document.querySelector("#files-section");
const filesList = document.querySelector("#files-list");
const termsSection = document.querySelector("#terms-section");
const termsList = document.querySelector("#terms-list");
const sourceSection = document.querySelector("#source-section");
const sourceTextElement = document.querySelector("#source-text");

let activeRefreshId = 0;

function setStatus(label, message) {
  const labelElement = statusCard.querySelector(".status-label");
  labelElement.textContent = label;
  statusMessageElement.textContent = message;
}

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0] || null;
}

async function refreshActiveTabStatus() {
  const refreshId = activeRefreshId + 1;
  activeRefreshId = refreshId;

  setStatus("Loading", "Checking the active browser tab.");
  activeUrlElement.textContent = "Checking active tab...";
  resetFetchedDetails();

  try {
    const tab = await getActiveTab();

    if (!tab?.url) {
      activeUrlElement.textContent = "No active tab";
      setStatus("No active tab", "Open a public Hugging Face model page and try again.");
      return;
    }

    activeUrlElement.textContent = tab.url;
    const parsedUrl = parseHuggingFaceModelUrl(tab.url);

    if (parsedUrl.ok) {
      activeUrlElement.textContent = parsedUrl.modelId;
      setStatus("Loading model facts", `Resolved model ID: ${parsedUrl.modelId}. Fetching public Hugging Face metadata.`);
      overviewTextElement.textContent =
        "This is a supported public Hugging Face model-page URL.";
      await loadModelFacts(parsedUrl.modelId, refreshId);
      return;
    }

    if (parsedUrl.isHuggingFace) {
      setStatus("Unsupported Hugging Face page", getUnsupportedMessage(parsedUrl.reason));
      overviewTextElement.textContent =
        "V1 supports public model pages in the owner/model URL format, including model tree and blob subpages.";
      return;
    }

    setStatus("Unsupported page", "This is not a Hugging Face model page.");
    overviewTextElement.textContent = "Open a public Hugging Face model page, then click the HF Plain English extension icon again.";
  } catch (error) {
    activeUrlElement.textContent = "Unable to inspect active tab";
    setStatus("Error", "Chrome did not return active tab information.");
    console.warn("HF Plain English side panel failed to inspect the active tab.", error);
  }
}

async function loadModelFacts(modelId, refreshId) {
  const result = await fetchHuggingFaceModel(modelId);

  if (refreshId !== activeRefreshId) {
    return;
  }

  sourceSection.hidden = false;
  sourceTextElement.textContent = [
    result.sources.metadataApi,
    result.sources.modelCard
  ].filter(Boolean).join(" ");

  if (!result.ok) {
    showFetchError(result);
    return;
  }

  const data = result.data;
  const interpreted = parseModelFacts(data);
  const [glossary, hardwareProfile] = await Promise.all([
    loadGlossary(),
    loadHardwareProfile()
  ]);
  const hardwareEstimate = estimateHardwareFit(interpreted, hardwareProfile);

  if (refreshId !== activeRefreshId) {
    return;
  }

  renderFacts([
    ["Author", data.author],
    ["Model name", data.modelName],
    ["Task", data.pipelineTag],
    ["Library", data.libraryName],
    ["Licence", data.license],
    ["Gated", data.gated ? "Yes" : "No"],
    ["Private", data.private ? "Yes" : "No"],
    ["Files", String(data.files.length)],
    ["Model card", data.modelCardMarkdown ? "Found" : "Missing"],
    ["Last modified", data.lastModified]
  ]);
  renderInterpretation(interpreted);
  renderHardwareEstimate(hardwareEstimate, hardwareProfile);
  renderRelevantFiles(interpreted.relevantFiles);
  renderTechnicalTerms(glossary, interpreted.glossaryTermIds);

  const warningText = result.warnings.length > 0
    ? ` Partial information: ${result.warnings.map((warning) => warning.message).join(" ")}`
    : "";

  if (data.gated || data.private) {
    setStatus("Gated or private model", "Metadata was found, but access may require signing in or accepting terms.");
  } else if (result.status === "partial") {
    setStatus("Partial information", warningText.trim() || "Some Hugging Face information could not be fetched.");
  } else {
    setStatus(getFitStatusLabel(hardwareEstimate.fit.overall), "Model facts and a cautious hardware estimate are available.");
  }

  overviewTextElement.textContent =
    buildOverviewText(data, interpreted);
}

function showFetchError(result) {
  factsSection.hidden = true;

  switch (result.status) {
    case "not-found":
      setStatus("Model not found", result.error.message);
      overviewTextElement.textContent = "Hugging Face did not return public metadata for this model ID.";
      break;
    case "rate-limited":
      setStatus("Rate limited", result.error.message);
      overviewTextElement.textContent = result.error.retryAfter
        ? `Try again after ${result.error.retryAfter}.`
        : "Try again later. The extension did not make any further requests.";
      break;
    case "gated-or-private":
      setStatus("Gated or private model", result.error.message);
      overviewTextElement.textContent = "The model may require a Hugging Face account or accepted access terms.";
      break;
    case "invalid-response":
      setStatus("Unexpected API response", result.error.message);
      overviewTextElement.textContent = "The extension could not safely read the Hugging Face API response.";
      break;
    default:
      setStatus("Network error", result.error.message);
      overviewTextElement.textContent = "Check the network connection and refresh the side panel.";
  }
}

function renderFacts(rows) {
  factsList.replaceChildren();

  for (const [label, value] of rows) {
    const term = document.createElement("dt");
    const description = document.createElement("dd");
    term.textContent = label;
    description.textContent = formatFactValue(value);
    factsList.append(term, description);
  }

  factsSection.hidden = false;
}

function renderInterpretation(interpreted) {
  renderDefinitionList(interpretationList, [
    ["Likely model type", describeFact(interpreted.modelKind)],
    ["Primary task", describeFact(interpreted.primaryTask)],
    ["Parameter count", formatParameterFact(interpreted.parameterCount)],
    ["Size category", describeFact(interpreted.sizeCategory)],
    ["Architecture", describeFact(interpreted.architecture)],
    ["Context length", formatContextFact(interpreted.contextLength)],
    ["Detected formats", interpreted.formats.length ? interpreted.formats.map((format) => format.label).join(", ") : "Unknown"],
    ["Detected quantisation", interpreted.quantisations.length ? interpreted.quantisations.map((item) => item.value).join(", ") : "None detected"]
  ]);

  warningList.replaceChildren();

  for (const warning of interpreted.warnings) {
    const item = document.createElement("p");
    item.className = "warning-item";
    item.textContent = warning;
    warningList.append(item);
  }

  interpretationSection.hidden = false;
}

function renderHardwareEstimate(estimate, hardwareProfile) {
  hardwareSummaryElement.textContent = estimate.explanation;
  renderDefinitionList(hardwareList, [
    ["Fit", getFitStatusLabel(estimate.fit.overall)],
    ["GPU fit", formatFitCategory(estimate.fit.gpu)],
    ["System RAM fit", formatFitCategory(estimate.fit.systemRam)],
    ["Hardware profile", formatHardwareProfile(hardwareProfile)],
    ["Parameter count", estimate.knownParameterCount ? formatParameterCount(estimate.parameterCount) : "Unknown"],
    ["Precision", estimate.precision || "Unknown"],
    ["Bits per parameter", Number.isFinite(estimate.bitsPerParameter) ? String(estimate.bitsPerParameter) : "Unknown"],
    ["Weight memory", Number.isFinite(estimate.estimatedWeightMemoryGb) ? `${estimate.estimatedWeightMemoryGb} GB` : "Unknown"],
    ["Runtime range", formatRuntimeRange(estimate.estimatedRuntimeMemoryGb)]
  ]);

  assumptionsList.replaceChildren();

  for (const assumption of estimate.assumptions) {
    const item = document.createElement("p");
    item.className = "warning-item";
    item.textContent = assumption;
    assumptionsList.append(item);
  }

  hardwareSection.hidden = false;
}

function renderRelevantFiles(files) {
  filesList.replaceChildren();

  const visibleFiles = files.filter((file) => !file.formats.includes("configuration files")).slice(0, 12);

  if (visibleFiles.length === 0) {
    filesSection.hidden = true;
    return;
  }

  for (const file of visibleFiles) {
    const item = document.createElement("article");
    const name = document.createElement("div");
    const meta = document.createElement("div");
    const explanation = document.createElement("p");

    item.className = "file-item";
    name.className = "file-name";
    meta.className = "file-meta";
    name.textContent = file.path;
    meta.textContent = [
      file.formats.join(", "),
      file.quantisations.length ? `Quantisation: ${file.quantisations.join(", ")}` : ""
    ].filter(Boolean).join(" | ");
    explanation.textContent = file.explanation;

    item.append(name, meta, explanation);
    filesList.append(item);
  }

  filesSection.hidden = false;
}

function renderTechnicalTerms(glossary, termIds) {
  termsList.replaceChildren();

  const glossaryById = new Map(glossary.map((entry) => [entry.id, entry]));
  const entries = termIds
    .map((termId) => glossaryById.get(termId))
    .filter(Boolean);

  if (entries.length === 0) {
    termsSection.hidden = true;
    return;
  }

  for (const entry of entries) {
    const details = document.createElement("details");
    const summary = document.createElement("summary");
    const short = document.createElement("p");
    const detail = document.createElement("p");

    details.className = "term-details";
    summary.textContent = entry.term;
    short.className = "term-short";
    short.textContent = entry.short;
    detail.textContent = entry.detail;

    details.append(summary, short, detail);
    termsList.append(details);
  }

  termsSection.hidden = false;
}

function renderDefinitionList(listElement, rows) {
  listElement.replaceChildren();

  for (const [label, value] of rows) {
    const term = document.createElement("dt");
    const description = document.createElement("dd");
    term.textContent = label;
    description.textContent = formatFactValue(value);
    listElement.append(term, description);
  }
}

function resetFetchedDetails() {
  factsList.replaceChildren();
  factsSection.hidden = true;
  interpretationList.replaceChildren();
  warningList.replaceChildren();
  interpretationSection.hidden = true;
  hardwareSummaryElement.textContent = "";
  hardwareList.replaceChildren();
  assumptionsList.replaceChildren();
  hardwareSection.hidden = true;
  filesList.replaceChildren();
  filesSection.hidden = true;
  termsList.replaceChildren();
  termsSection.hidden = true;
  sourceTextElement.textContent = "";
  sourceSection.hidden = true;
}

function formatFactValue(value) {
  if (value === null || value === undefined || value === "") {
    return "Unknown";
  }

  return value;
}

async function loadGlossary() {
  try {
    const response = await fetch(chrome.runtime.getURL("data/glossary.json"), {
      cache: "no-store"
    });

    if (!response.ok) {
      return [];
    }

    const glossary = await response.json();
    return Array.isArray(glossary) ? glossary : [];
  } catch (error) {
    console.warn("HF Plain English could not load the local glossary.", error);
    return [];
  }
}

async function loadHardwareProfile() {
  try {
    const response = await fetch(chrome.runtime.getURL("data/hardware-profile.json"), {
      cache: "no-store"
    });

    if (!response.ok) {
      return {};
    }

    const profile = await response.json();
    return profile && typeof profile === "object" ? profile : {};
  } catch (error) {
    console.warn("HF Plain English could not load the local hardware profile.", error);
    return {};
  }
}

function buildOverviewText(data, interpreted) {
  const task = interpreted.primaryTask.value || data.pipelineTag || "an unknown task";
  const modelKind = interpreted.modelKind.value;
  const formatText = interpreted.formats.length
    ? ` Detected file formats include ${interpreted.formats.map((format) => format.label).join(", ")}.`
    : " No common runnable model format was detected from the file list yet.";

  if (modelKind === "embedding") {
    return `Plain-English read: this appears to be an embedding model for ${task}. It is more likely for search, matching, or retrieval than normal chatbot conversation.${formatText}`;
  }

  if (modelKind === "image") {
    return `Plain-English read: this appears to be an image-related model for ${task}. Local desktop chatbot tools may not be the right fit.${formatText}`;
  }

  if (modelKind === "base") {
    return `Plain-English read: this appears to be a base model for ${task}. It may not behave like a polished assistant unless it has the right prompt format or extra tuning.${formatText}`;
  }

  if (modelKind === "chat" || modelKind === "instruct") {
    return `Plain-English read: this appears to be a ${modelKind} model for ${task}, so it is more likely to be usable for prompts or conversation.${formatText}`;
  }

  return `Plain-English read: Hugging Face reports this model's task as ${task}. The exact user-facing model type is not clear from the available metadata.${formatText}`;
}

function describeFact(fact) {
  if (!fact?.value) {
    return "Unknown";
  }

  return `${fact.value} (${fact.source}, ${fact.confidence} confidence)`;
}

function formatParameterFact(fact) {
  if (!Number.isFinite(fact?.value)) {
    return "Unknown";
  }

  return `${formatParameterCount(fact.value)} (${fact.source}, ${fact.confidence} confidence)`;
}

function formatContextFact(fact) {
  if (!Number.isFinite(fact?.value)) {
    return "Unknown";
  }

  return `${fact.value.toLocaleString()} tokens (${fact.source}, ${fact.confidence} confidence)`;
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

function formatRuntimeRange(range) {
  if (!Number.isFinite(range?.minimum) || !Number.isFinite(range?.likely)) {
    return "Unknown";
  }

  return `${range.minimum}-${range.likely} GB`;
}

function formatFitCategory(category) {
  return getFitStatusLabel(category);
}

function getFitStatusLabel(category) {
  switch (category) {
    case "comfortable":
      return "Runs comfortably";
    case "likely":
      return "Likely to run";
    case "possible-with-offloading":
      return "May run with RAM offloading";
    case "slow-or-tight":
      return "May be slow or tight";
    case "unlikely":
      return "Unlikely to fit";
    default:
      return "Cannot estimate";
  }
}

function formatHardwareProfile(profile) {
  const parts = [];

  if (profile?.operatingSystem) {
    parts.push(profile.operatingSystem);
  }

  if (Number.isFinite(Number(profile?.gpuVramGb))) {
    parts.push(`${profile.gpuVramGb} GB VRAM`);
  }

  if (Number.isFinite(Number(profile?.systemRamGb))) {
    parts.push(`${profile.systemRamGb} GB RAM`);
  }

  return parts.length ? parts.join(", ") : "Unknown";
}

function trimDecimal(value) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function getUnsupportedMessage(reason) {
  switch (reason) {
    case "unsupported-hugging-face-section":
      return "This Hugging Face section is outside V1 model-page support.";
    case "not-a-model-page":
      return "This Hugging Face URL does not include both an owner and a model name.";
    case "invalid-model-id":
      return "This URL does not contain a valid owner/model identifier.";
    case "malformed-url":
      return "Chrome returned a malformed URL for the active tab.";
    default:
      return "This page is outside V1 support.";
  }
}

refreshButton.addEventListener("click", () => {
  refreshActiveTabStatus();
});

refreshActiveTabStatus();
