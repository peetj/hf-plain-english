import { parseHuggingFaceModelUrl } from "../services/huggingface-url-parser.js";
import { fetchHuggingFaceModel } from "../services/huggingface-api.js";

const activeUrlElement = document.querySelector("#active-url");
const statusCard = document.querySelector("#status-card");
const statusMessageElement = document.querySelector("#status-message");
const overviewTextElement = document.querySelector("#overview-text");
const refreshButton = document.querySelector("#refresh-button");
const factsSection = document.querySelector("#facts-section");
const factsList = document.querySelector("#facts-list");
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

  const warningText = result.warnings.length > 0
    ? ` Partial information: ${result.warnings.map((warning) => warning.message).join(" ")}`
    : "";

  if (data.gated || data.private) {
    setStatus("Gated or private model", "Metadata was found, but access may require signing in or accepting terms.");
  } else if (result.status === "partial") {
    setStatus("Partial information", warningText.trim() || "Some Hugging Face information could not be fetched.");
  } else {
    setStatus("Model facts fetched", "Public Hugging Face metadata and the README model card were retrieved.");
  }

  overviewTextElement.textContent =
    `Known facts only: ${data.modelId} reports task "${data.pipelineTag || "unknown"}"` +
    ` and library "${data.libraryName || "unknown"}". Interpretation will be added in the next stage.`;
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

function resetFetchedDetails() {
  factsList.replaceChildren();
  factsSection.hidden = true;
  sourceTextElement.textContent = "";
  sourceSection.hidden = true;
}

function formatFactValue(value) {
  if (value === null || value === undefined || value === "") {
    return "Unknown";
  }

  return value;
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
