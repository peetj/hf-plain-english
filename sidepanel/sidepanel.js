import { parseHuggingFaceModelUrl } from "../services/huggingface-url-parser.js";
import { fetchHuggingFaceModel } from "../services/huggingface-api.js";
import { parseModelFacts } from "../services/model-parser.js";
import { estimateHardwareFit } from "../services/hardware-estimator.js";
import { recommendModelTool } from "../services/recommendation-engine.js";
import { generateDeterministicExplanation } from "../services/explanation-service.js";

const activeUrlElement = document.querySelector("#active-url");
const modelOwnerElement = document.querySelector("#model-owner");
const themeButtons = Array.from(document.querySelectorAll(".theme-button"));
const statusCard = document.querySelector("#status-card");
const statusMessageElement = document.querySelector("#status-message");
const learnerAnswerSection = document.querySelector("#learner-answer-section");
const answerSummaryElement = document.querySelector("#answer-summary");
const answerList = document.querySelector("#answer-list");
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
const runSection = document.querySelector("#run-section");
const runSummaryElement = document.querySelector("#run-summary");
const runList = document.querySelector("#run-list");
const runWarningList = document.querySelector("#run-warning-list");
const filesSection = document.querySelector("#files-section");
const filesList = document.querySelector("#files-list");
const termsSection = document.querySelector("#terms-section");
const termsList = document.querySelector("#terms-list");
const sourceSection = document.querySelector("#source-section");
const sourceTextElement = document.querySelector("#source-text");
const tooltipLayerElement = document.querySelector("#tooltip-layer");
const tooltipTitleElement = document.querySelector("#tooltip-title");
const tooltipTextElement = document.querySelector("#tooltip-text");

let activeRefreshId = 0;
let tooltipDefinitions = [];
let activeTooltipTrigger = null;
const tooltipDefinitionsPromise = loadTooltips().then((definitions) => {
  tooltipDefinitions = definitions;
  return definitions;
});

function setStatus(label, message) {
  const labelElement = statusCard.querySelector(".status-label");
  labelElement.textContent = label;
  renderTooltipText(statusMessageElement, message);
}

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0] || null;
}

async function refreshActiveTabStatus() {
  const refreshId = activeRefreshId + 1;
  activeRefreshId = refreshId;

  setStatus("Loading", "Checking the active browser tab.");
  resetModelIdentity("Checking active tab...");
  resetFetchedDetails();

  try {
    const tab = await getActiveTab();

    if (!tab?.url) {
      resetModelIdentity("No active tab");
      setStatus("No active tab", "Open a public Hugging Face model page and try again.");
      renderLearnerState("Nothing to explain yet.", [
        ["What happened", "Chrome did not report an active page to inspect."],
        ["Next step", "Open a public Hugging Face model page, then refresh this panel."]
      ]);
      return;
    }

    activeUrlElement.textContent = tab.url;
    modelOwnerElement.hidden = true;
    const parsedUrl = parseHuggingFaceModelUrl(tab.url);

    if (parsedUrl.ok) {
      renderModelIdentity(parsedUrl.modelId);
      setStatus("Loading model facts", `Resolved model ID: ${parsedUrl.modelId}. Fetching public Hugging Face metadata.`);
      renderTooltipText(overviewTextElement, "This is a supported public Hugging Face model-page URL.");
      await loadModelFacts(parsedUrl.modelId, refreshId);
      return;
    }

    if (parsedUrl.isHuggingFace) {
      resetModelIdentity("Unsupported Hugging Face page");
      setStatus("Unsupported Hugging Face page", getUnsupportedMessage(parsedUrl.reason));
      renderLearnerState("This Hugging Face page is outside the current model-page guide.", [
        ["What happened", getUnsupportedMessage(parsedUrl.reason)],
        ["Next step", "Open a public model page with an owner/model address, such as huggingface.co/Qwen/Qwen3-0.6B."]
      ]);
      renderTooltipText(
        overviewTextElement,
        "V1 supports public model pages in the owner/model URL format, including model tree and blob subpages."
      );
      return;
    }

    resetModelIdentity("Unsupported page");
    setStatus("Unsupported page", "This is not a Hugging Face model page.");
    renderLearnerState("This page is not a Hugging Face model page.", [
      ["What happened", "The extension only explains public Hugging Face model pages."],
      ["Next step", "Open a model page on huggingface.co, then refresh this panel."]
    ]);
    renderTooltipText(
      overviewTextElement,
      "Open a public Hugging Face model page, then click the Hugging Face for Newbies extension icon again."
    );
  } catch (error) {
    resetModelIdentity("Unable to inspect active tab");
    setStatus("Error", "Chrome did not return active tab information.");
    renderLearnerState("The extension could not inspect the current tab.", [
      ["What happened", "Chrome did not provide the active tab URL."],
      ["Next step", "Refresh the panel. If it still fails, reload the browser tab and try again."]
    ]);
    console.warn("Hugging Face for Newbies side panel failed to inspect the active tab.", error);
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
    loadHardwareProfile(),
    tooltipDefinitionsPromise
  ]);
  const hardwareEstimate = estimateHardwareFit(interpreted, hardwareProfile);
  const recommendation = recommendModelTool(data, interpreted, hardwareEstimate, hardwareProfile);
  const explanation = generateDeterministicExplanation(data, interpreted, hardwareEstimate, recommendation);

  if (refreshId !== activeRefreshId) {
    return;
  }

  renderLearnerAnswer(data, interpreted, hardwareEstimate, recommendation, explanation, hardwareProfile);
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
  renderInterpretation(interpreted, result.warnings);
  renderHardwareEstimate(hardwareEstimate, hardwareProfile);
  renderRunRecommendation(recommendation, explanation);
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
    setStatus(
      getFitStatusLabel(hardwareEstimate.fit.overall, { includeHardware: true }),
      `Estimated against your saved hardware profile: ${formatHardwareProfile(hardwareProfile)}.`
    );
  }

  renderTooltipText(overviewTextElement, explanation.overview);
}

function renderLearnerAnswer(model, interpreted, hardwareEstimate, recommendation, explanation, hardwareProfile) {
  renderTooltipText(answerSummaryElement, explanation.summary);
  renderDefinitionList(answerList, [
    ["What it is", buildWhatItIsAnswer(model, interpreted)],
    ["Best next step", buildNextStepAnswer(recommendation, hardwareEstimate, hardwareProfile, interpreted)],
    ["Local fit", buildLocalFitAnswer(hardwareEstimate)],
    ["Confidence", buildOverallConfidenceAnswer(interpreted, recommendation, hardwareEstimate)]
  ]);
  learnerAnswerSection.hidden = false;
}

function renderLearnerState(summary, rows) {
  renderTooltipText(answerSummaryElement, summary);
  renderDefinitionList(answerList, rows);
  learnerAnswerSection.hidden = false;
}

function buildWhatItIsAnswer(model, interpreted) {
  const modelKind = interpreted?.modelKind?.value;
  const task = interpreted?.primaryTask?.value || model?.pipelineTag;

  if (modelKind && task) {
    return `${modelKind} model for ${task}`;
  }

  if (modelKind) {
    return `${modelKind} model`;
  }

  if (task) {
    return `model for ${task}`;
  }

  return "Model type is not clear yet";
}

function buildNextStepAnswer(recommendation, hardwareEstimate, hardwareProfile, interpreted) {
  const tool = recommendation?.primaryTool || "insufficient information";
  const fit = hardwareEstimate?.fit?.overall || "unknown";
  const preferredTools = Array.isArray(hardwareProfile?.preferredTools) ? hardwareProfile.preferredTools : [];
  const experienceLevel = String(hardwareProfile?.experienceLevel || "").toLowerCase();
  const beginner = experienceLevel.includes("beginner");
  const hasGguf = interpreted?.formats?.some((format) => format.id === "gguf");

  if (tool === "insufficient information") {
    return "Do not download yet; inspect the files, licence, and model card first.";
  }

  if (fit === "unlikely") {
    return "Do not start by downloading this for local use; look for a smaller or more quantised version first.";
  }

  if (fit === "unknown") {
    return "Check the model files and your hardware profile before choosing a local tool.";
  }

  if (tool === "not suitable for ordinary chatbot use") {
    return "Do not treat this as a normal chatbot model; check the specialist task first.";
  }

  if (tool === "LM Studio" && preferredTools.includes("LM Studio")) {
    return beginner
      ? "Start with LM Studio because your profile says you prefer it and it is the beginner-friendly route for this model."
      : "Start with LM Studio because your saved tool preference matches this model's detected files.";
  }

  if (tool === "Python Transformers" && beginner) {
    return hasGguf
      ? "Use LM Studio first if you want the easiest local test; use Python Transformers only if you are comfortable with Python."
      : "Use Python Transformers, but expect a more technical setup than a desktop app.";
  }

  if (tool === "llama.cpp" && beginner) {
    return "Use LM Studio first if possible; llama.cpp is the more technical route for the detected local model files.";
  }

  return `Start with ${tool}`;
}

function buildLocalFitAnswer(hardwareEstimate) {
  const fitLabel = getFitStatusLabel(hardwareEstimate?.fit?.overall, { includeHardware: true });
  const runtimeRange = formatRuntimeRange(hardwareEstimate?.estimatedRuntimeMemoryGb);

  if (runtimeRange === "Unknown") {
    return fitLabel;
  }

  return `${fitLabel}; estimated runtime memory ${runtimeRange}`;
}

function buildOverallConfidenceAnswer(interpreted, recommendation, hardwareEstimate) {
  const confidenceValues = [
    interpreted?.modelKind?.confidence,
    interpreted?.primaryTask?.confidence,
    interpreted?.parameterCount?.confidence,
    interpreted?.contextLength?.confidence,
    recommendation?.confidence,
    hardwareEstimate?.fit?.overall === "unknown" ? "low" : "medium"
  ].filter(Boolean);
  const score = confidenceValues.reduce((total, confidence) => total + confidenceScore(confidence), 0);
  const average = confidenceValues.length ? score / confidenceValues.length : 0;

  if (average >= 2.45) {
    return "High confidence for the headline read";
  }

  if (average >= 1.65) {
    return "Medium confidence; check the details below";
  }

  return "Low confidence; important information is missing";
}

function confidenceScore(confidence) {
  switch (confidence) {
    case "high":
      return 3;
    case "medium":
      return 2;
    case "low":
      return 1;
    default:
      return 0;
  }
}

function showFetchError(result) {
  factsSection.hidden = true;

  switch (result.status) {
    case "not-found":
      setStatus("Model not found", result.error.message);
      renderLearnerState("Hugging Face could not find public data for this model.", [
        ["What happened", "The model ID may be wrong, deleted, renamed, or not public."],
        ["Next step", "Check the page address and try opening the main model page again."]
      ]);
      renderTooltipText(overviewTextElement, "Hugging Face did not return public metadata for this model ID.");
      break;
    case "rate-limited":
      setStatus("Rate limited", result.error.message);
      renderLearnerState("Hugging Face is temporarily limiting requests.", [
        ["What happened", "The public API returned a rate-limit response."],
        ["Next step", result.error.retryAfter ? `Wait until ${result.error.retryAfter}, then refresh this panel.` : "Wait a few minutes, then refresh this panel."]
      ]);
      renderTooltipText(
        overviewTextElement,
        result.error.retryAfter
          ? `Try again after ${result.error.retryAfter}.`
          : "Try again later. The extension did not make any further requests."
      );
      break;
    case "gated-or-private":
      setStatus("Gated or private model", result.error.message);
      renderLearnerState("This model may require access before it can be explained fully.", [
        ["What happened", "The model appears gated, private, or unavailable through public access."],
        ["Next step", "Open the original model page, sign in if needed, and check whether you must accept access terms."]
      ]);
      renderTooltipText(overviewTextElement, "The model may require a Hugging Face account or accepted access terms.");
      break;
    case "invalid-response":
      setStatus("Unexpected API response", result.error.message);
      renderLearnerState("Hugging Face returned data the extension could not safely read.", [
        ["What happened", "The API response was missing or not in the expected format."],
        ["Next step", "Refresh this panel. If it keeps happening, use the original model page directly."]
      ]);
      renderTooltipText(overviewTextElement, "The extension could not safely read the Hugging Face API response.");
      break;
    default:
      setStatus("Network error", result.error.message);
      renderLearnerState("The extension could not reach Hugging Face.", [
        ["What happened", "The network request failed before public model data could be loaded."],
        ["Next step", "Check your connection, then refresh this panel."]
      ]);
      renderTooltipText(overviewTextElement, "Check the network connection and refresh the side panel.");
  }
}

function renderModelIdentity(modelId) {
  const [owner, modelName] = String(modelId).split("/");

  activeUrlElement.textContent = modelName || modelId;
  renderTooltipText(
    modelOwnerElement,
    owner ? `by ${owner} on Hugging Face` : "Hugging Face model page."
  );
  modelOwnerElement.hidden = false;
}

function resetModelIdentity(label) {
  activeUrlElement.textContent = label;
  modelOwnerElement.replaceChildren();
  modelOwnerElement.hidden = true;
}

function renderFacts(rows) {
  factsList.replaceChildren();

  for (const [label, value] of rows) {
    const term = document.createElement("dt");
    const description = document.createElement("dd");
    renderTooltipText(term, label);
    renderTooltipText(description, formatFactValue(value));
    factsList.append(term, description);
  }

  factsSection.hidden = false;
}

function renderInterpretation(interpreted, apiWarnings = []) {
  renderDefinitionList(interpretationList, [
    ["Likely model type", createFactDisplay(interpreted.modelKind)],
    ["Primary task", createFactDisplay(interpreted.primaryTask)],
    ["Parameter count", createFactDisplay(interpreted.parameterCount, formatParameterCount)],
    ["Size category", createFactDisplay(interpreted.sizeCategory)],
    ["Architecture", createFactDisplay(interpreted.architecture)],
    ["Context length", createFactDisplay(interpreted.contextLength, (value) => `${value.toLocaleString()} tokens`)],
    ["Detected formats", interpreted.formats.length ? interpreted.formats.map((format) => format.label).join(", ") : "Unknown"],
    ["Detected quantisation", interpreted.quantisations.length ? interpreted.quantisations.map((item) => item.value).join(", ") : "None detected"]
  ]);

  warningList.replaceChildren();

  for (const warning of [
    ...apiWarnings.map(formatApiWarning),
    ...interpreted.warnings
      .filter((warning) => !isRunRouteWarning(warning))
      .map((warning) => ({ message: warning }))
  ]) {
    const item = document.createElement("p");
    item.className = "warning-item";
    renderTooltipText(item, warning.message);
    warningList.append(item);
  }

  interpretationSection.hidden = false;
}

function isRunRouteWarning(warning) {
  return /No GGUF file was detected/i.test(warning);
}

function formatApiWarning(warning) {
  switch (warning?.type) {
    case "missing-model-card":
      return {
        message: "The model card was not found. Next step: use the original Hugging Face page to check whether the author documented intended use, limits, or licence details somewhere else."
      };
    case "restricted-model-card":
      return {
        message: "The model card could not be fetched without access. Next step: open the original page and check whether you need to sign in or accept terms."
      };
    case "model-card-rate-limited":
      return {
        message: "The model card request was rate-limited. Next step: wait a few minutes and refresh this panel."
      };
    case "model-card-network-error":
      return {
        message: "The model card could not be fetched because of a network problem. Next step: check your connection and refresh this panel."
      };
    default:
      return {
        message: warning?.message || "Some Hugging Face information could not be loaded. Next step: check the original model page before relying on this summary."
      };
  }
}

function renderHardwareEstimate(estimate, hardwareProfile) {
  renderTooltipText(hardwareSummaryElement, estimate.explanation);
  renderDefinitionList(hardwareList, [
    ["Fit", getFitStatusLabel(estimate.fit.overall, { includeHardware: true })],
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
    renderTooltipText(item, assumption);
    assumptionsList.append(item);
  }

  hardwareSection.hidden = false;
}

function renderRunRecommendation(recommendation, explanation) {
  renderTooltipText(runSummaryElement, explanation.run);
  renderDefinitionList(runList, [
    ["Recommended tool", recommendation.primaryTool],
    ["Confidence", createRecommendationConfidenceDisplay(recommendation)],
    ["Why this route", recommendation.reasons.length ? recommendation.reasons.join(" ") : "The available metadata does not give a clear reason."],
    ["Other options", recommendation.alternatives.length ? recommendation.alternatives.join(" ") : "No safer alternative detected from this page."],
    ["Commands", recommendation.commands.length ? recommendation.commands.join(" ") : "No command shown because no verified command is known."]
  ]);

  runWarningList.replaceChildren();

  for (const warning of Array.from(new Set([...recommendation.warnings, ...explanation.limitations]))) {
    const item = document.createElement("p");
    item.className = "warning-item";
    renderTooltipText(item, warning);
    runWarningList.append(item);
  }

  runSection.hidden = false;
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
    renderTooltipText(explanation, file.explanation);

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

  const table = document.createElement("table");
  const thead = document.createElement("thead");
  const tbody = document.createElement("tbody");
  const headerRow = document.createElement("tr");
  const termHeader = document.createElement("th");
  const explanationHeader = document.createElement("th");

  table.className = "terms-table";
  termHeader.scope = "col";
  explanationHeader.scope = "col";
  termHeader.textContent = "Term";
  explanationHeader.textContent = "Explanation";
  headerRow.append(termHeader, explanationHeader);
  thead.append(headerRow);

  for (const entry of entries) {
    const row = document.createElement("tr");
    const termCell = document.createElement("th");
    const explanationCell = document.createElement("td");
    const short = document.createElement("p");
    const detail = document.createElement("p");

    termCell.scope = "row";
    termCell.textContent = entry.term;
    short.className = "term-short";
    renderTooltipText(short, entry.short);
    renderTooltipText(detail, entry.detail);

    explanationCell.append(short, detail);
    row.append(termCell, explanationCell);
    tbody.append(row);
  }

  table.append(thead, tbody);
  termsList.append(table);
  termsSection.hidden = false;
}

function renderDefinitionList(listElement, rows) {
  listElement.replaceChildren();

  for (const [label, value] of rows) {
    const term = document.createElement("dt");
    const description = document.createElement("dd");
    renderTooltipText(term, label);

    if (value instanceof Node) {
      description.append(value);
    } else {
      renderTooltipText(description, formatFactValue(value));
    }

    listElement.append(term, description);
  }
}

function resetFetchedDetails() {
  hideTooltip();
  answerSummaryElement.replaceChildren();
  answerList.replaceChildren();
  learnerAnswerSection.hidden = true;
  factsList.replaceChildren();
  factsSection.hidden = true;
  interpretationList.replaceChildren();
  warningList.replaceChildren();
  interpretationSection.hidden = true;
  hardwareSummaryElement.textContent = "";
  hardwareList.replaceChildren();
  assumptionsList.replaceChildren();
  hardwareSection.hidden = true;
  runSummaryElement.textContent = "";
  runList.replaceChildren();
  runWarningList.replaceChildren();
  runSection.hidden = true;
  filesList.replaceChildren();
  filesSection.hidden = true;
  termsList.replaceChildren();
  termsSection.hidden = true;
  sourceTextElement.textContent = "";
  sourceSection.hidden = true;
}

function initCollapsibleSections() {
  for (const section of document.querySelectorAll(".panel-section")) {
    const heading = section.querySelector("h2");

    if (!heading || heading.querySelector(".section-toggle")) {
      continue;
    }

    const body = document.createElement("div");
    body.className = "section-body";

    while (heading.nextSibling) {
      body.append(heading.nextSibling);
    }

    const button = document.createElement("button");
    const arrow = document.createElement("span");
    const label = document.createElement("span");

    button.type = "button";
    button.className = "section-toggle";
    const expanded = isSectionInitiallyExpanded(section);

    button.setAttribute("aria-expanded", String(expanded));
    arrow.className = "section-arrow";
    arrow.setAttribute("aria-hidden", "true");
    arrow.textContent = "▾";
    label.textContent = heading.textContent;
    button.append(arrow, label);
    heading.replaceChildren(button);
    section.append(body);
    section.classList.toggle("is-collapsed", !expanded);
    body.hidden = !expanded;

    button.addEventListener("click", () => {
      const expanded = button.getAttribute("aria-expanded") === "true";
      button.setAttribute("aria-expanded", String(!expanded));
      section.classList.toggle("is-collapsed", expanded);
      body.hidden = expanded;
    });
  }
}

function isSectionInitiallyExpanded(section) {
  return section.id === "learner-answer-section" || section.id === "first-read-section";
}

function initThemeControls() {
  const storedTheme = localStorage.getItem("hfNewbies.theme");
  const initialTheme = isKnownTheme(storedTheme) ? storedTheme : "nord";
  applyTheme(initialTheme);

  for (const button of themeButtons) {
    button.addEventListener("click", () => {
      const theme = button.dataset.themeValue;

      if (!isKnownTheme(theme)) {
        return;
      }

      localStorage.setItem("hfNewbies.theme", theme);
      applyTheme(theme);
    });
  }
}

function applyTheme(theme) {
  document.body.dataset.theme = theme;

  for (const button of themeButtons) {
    button.setAttribute("aria-pressed", String(button.dataset.themeValue === theme));
  }
}

function isKnownTheme(theme) {
  return ["nord", "solarized", "gruvbox"].includes(theme);
}

function formatFactValue(value) {
  if (value === null || value === undefined || value === "") {
    return "Unknown";
  }

  return value;
}

function renderTooltipText(element, value) {
  const text = String(formatFactValue(value));
  element.replaceChildren();

  if (tooltipDefinitions.length === 0 || text.trim() === "") {
    element.textContent = text;
    return;
  }

  for (const part of createTooltipParts(text)) {
    if (part.type === "text") {
      element.append(document.createTextNode(part.text));
      continue;
    }

    element.append(createTooltipTrigger(part.text, part.definition));
  }
}

function createTooltipParts(text) {
  const parts = [];
  let index = 0;

  while (index < text.length) {
    const match = findTooltipMatchAt(text, index);

    if (!match) {
      const nextMatchIndex = findNextTooltipMatchIndex(text, index + 1);
      const textEnd = nextMatchIndex === -1 ? text.length : nextMatchIndex;
      parts.push({
        type: "text",
        text: text.slice(index, textEnd)
      });
      index = textEnd;
      continue;
    }

    parts.push({
      type: "tooltip",
      text: text.slice(index, index + match.term.length),
      definition: match.definition
    });
    index += match.term.length;
  }

  return parts;
}

function findNextTooltipMatchIndex(text, startIndex) {
  for (let index = startIndex; index < text.length; index += 1) {
    if (findTooltipMatchAt(text, index)) {
      return index;
    }
  }

  return -1;
}

function findTooltipMatchAt(text, index) {
  const lowerText = text.toLowerCase();
  let bestMatch = null;

  for (const definition of tooltipDefinitions) {
    for (const term of definition.terms) {
      if (
        lowerText.startsWith(term.lower, index) &&
        hasTooltipBoundaries(text, index, index + term.value.length, term.value)
      ) {
        if (!bestMatch || term.value.length > bestMatch.term.length) {
          bestMatch = {
            definition,
            term: term.value
          };
        }
      }
    }
  }

  return bestMatch;
}

function hasTooltipBoundaries(text, start, end, term) {
  const firstTermCharacter = term.charAt(0);
  const lastTermCharacter = term.charAt(term.length - 1);
  const before = start > 0 ? text.charAt(start - 1) : "";
  const after = end < text.length ? text.charAt(end) : "";

  if (isAlphaNumeric(firstTermCharacter) && isAlphaNumeric(before)) {
    return false;
  }

  if (isAlphaNumeric(lastTermCharacter) && isAlphaNumeric(after)) {
    return false;
  }

  return true;
}

function isAlphaNumeric(character) {
  return /^[a-z0-9]$/i.test(character);
}

function createTooltipTrigger(text, definition) {
  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "tooltip-term";
  trigger.dataset.tooltipId = definition.id;
  trigger.setAttribute("aria-describedby", "tooltip-layer");
  trigger.setAttribute("aria-label", `Explain ${text}`);
  trigger.textContent = text;
  return trigger;
}

function initTooltipEvents() {
  document.addEventListener("pointerover", (event) => {
    const trigger = event.target.closest?.(".tooltip-term");

    if (trigger) {
      showTooltip(trigger);
    }
  });

  document.addEventListener("pointerout", (event) => {
    const trigger = event.target.closest?.(".tooltip-term");

    if (trigger && trigger === activeTooltipTrigger && !trigger.matches(":focus")) {
      hideTooltip();
    }
  });

  document.addEventListener("focusin", (event) => {
    const trigger = event.target.closest?.(".tooltip-term");

    if (trigger) {
      showTooltip(trigger);
    }
  });

  document.addEventListener("focusout", (event) => {
    const trigger = event.target.closest?.(".tooltip-term");

    if (trigger && trigger === activeTooltipTrigger) {
      globalThis.setTimeout(() => {
        if (document.activeElement !== trigger) {
          hideTooltip();
        }
      }, 0);
    }
  });

  document.addEventListener("click", (event) => {
    const trigger = event.target.closest?.(".tooltip-term");

    if (trigger) {
      showTooltip(trigger);
      return;
    }

    hideTooltip();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      hideTooltip();
    }
  });

  window.addEventListener("resize", () => {
    if (activeTooltipTrigger) {
      positionTooltip(activeTooltipTrigger);
    }
  });

  document.addEventListener("scroll", () => {
    if (activeTooltipTrigger) {
      positionTooltip(activeTooltipTrigger);
    }
  }, true);
}

function showTooltip(trigger) {
  const definition = getTooltipDefinition(trigger.dataset.tooltipId);

  if (!definition) {
    return;
  }

  if (activeTooltipTrigger && activeTooltipTrigger !== trigger) {
    activeTooltipTrigger.removeAttribute("data-tooltip-open");
  }

  activeTooltipTrigger = trigger;
  activeTooltipTrigger.dataset.tooltipOpen = "true";
  tooltipTitleElement.textContent = definition.title;
  tooltipTextElement.textContent = definition.text;
  tooltipLayerElement.hidden = false;
  positionTooltip(trigger);
}

function hideTooltip() {
  if (activeTooltipTrigger) {
    activeTooltipTrigger.removeAttribute("data-tooltip-open");
  }

  activeTooltipTrigger = null;
  tooltipLayerElement.hidden = true;
}

function positionTooltip(trigger) {
  const triggerRect = trigger.getBoundingClientRect();
  const tooltipRect = tooltipLayerElement.getBoundingClientRect();
  const margin = 10;
  const preferredTop = triggerRect.bottom + 8;
  const fallbackTop = triggerRect.top - tooltipRect.height - 8;
  const top = preferredTop + tooltipRect.height <= window.innerHeight - margin
    ? preferredTop
    : Math.max(margin, fallbackTop);
  const centeredLeft = triggerRect.left + (triggerRect.width / 2) - (tooltipRect.width / 2);
  const maxLeft = Math.max(margin, window.innerWidth - tooltipRect.width - margin);
  const left = Math.min(Math.max(margin, centeredLeft), maxLeft);

  tooltipLayerElement.style.top = `${top}px`;
  tooltipLayerElement.style.left = `${left}px`;
}

function getTooltipDefinition(id) {
  return tooltipDefinitions.find((definition) => definition.id === id) || null;
}

async function loadTooltips() {
  try {
    const response = await fetch(chrome.runtime.getURL("data/tooltips.json"), {
      cache: "no-store"
    });

    if (!response.ok) {
      return [];
    }

    const tooltips = await response.json();
    return normalizeTooltips(tooltips);
  } catch (error) {
    console.warn("Hugging Face for Newbies could not load the local tooltip definitions.", error);
    return [];
  }
}

function normalizeTooltips(tooltips) {
  if (!Array.isArray(tooltips)) {
    return [];
  }

  return tooltips
    .filter((entry) => (
      entry &&
      typeof entry.id === "string" &&
      typeof entry.title === "string" &&
      typeof entry.text === "string" &&
      Array.isArray(entry.terms)
    ))
    .map((entry) => ({
      id: entry.id,
      title: entry.title,
      text: entry.text,
      category: typeof entry.category === "string" ? entry.category : "general",
      terms: entry.terms
        .filter((term) => typeof term === "string" && term.trim() !== "")
        .map((term) => ({
          value: term,
          lower: term.toLowerCase()
        }))
        .sort((a, b) => b.value.length - a.value.length)
    }))
    .filter((entry) => entry.terms.length > 0)
    .sort((a, b) => {
      const longestA = a.terms[0]?.value.length || 0;
      const longestB = b.terms[0]?.value.length || 0;
      return longestB - longestA;
    });
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
    console.warn("Hugging Face for Newbies could not load the local glossary.", error);
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
    console.warn("Hugging Face for Newbies could not load the local hardware profile.", error);
    return {};
  }
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

function createFactDisplay(fact, formatValue = (value) => value) {
  const container = document.createElement("div");
  const valueElement = document.createElement("div");
  const badgeRow = document.createElement("div");
  const hasKnownValue = fact?.value !== null && fact?.value !== undefined && fact?.value !== "";

  container.className = "fact-display";
  valueElement.className = "fact-display-value";
  badgeRow.className = "badge-row";

  renderTooltipText(valueElement, hasKnownValue ? formatValue(fact.value) : "Unknown");

  if (hasKnownValue) {
    badgeRow.append(createFactBadge(getKnowledgeBadgeLabel(fact), getKnowledgeBadgeKind(fact)));
  }

  if (hasKnownValue && fact?.confidence) {
    badgeRow.append(createFactBadge(`${fact.confidence} confidence`, "confidence"));
  }

  container.append(valueElement, badgeRow);
  return container;
}

function createRecommendationConfidenceDisplay(recommendation) {
  const container = document.createElement("div");
  const valueElement = document.createElement("div");
  const badgeRow = document.createElement("div");
  const confidence = recommendation?.confidence || "low";

  container.className = "fact-display";
  valueElement.className = "fact-display-value";
  badgeRow.className = "badge-row";
  renderTooltipText(valueElement, `${confidence} confidence`);
  badgeRow.append(createFactBadge(getConfidenceKnowledgeLabel(confidence), getConfidenceKnowledgeKind(confidence)));
  container.append(valueElement, badgeRow);
  return container;
}

function createFactBadge(label, kind) {
  const badge = document.createElement("span");
  badge.className = `fact-badge fact-badge-${kind}`;
  badge.textContent = label;
  return badge;
}

function getKnowledgeBadgeLabel(fact) {
  if (!fact?.value) {
    return "Unknown";
  }

  return getConfidenceKnowledgeLabel(fact.confidence);
}

function getKnowledgeBadgeKind(fact) {
  if (!fact?.value) {
    return "unknown";
  }

  return getConfidenceKnowledgeKind(fact.confidence);
}

function getConfidenceKnowledgeLabel(confidence) {
  if (confidence === "high") {
    return "Known";
  }

  if (confidence === "medium") {
    return "Likely";
  }

  return "Unclear";
}

function getConfidenceKnowledgeKind(confidence) {
  if (confidence === "high") {
    return "known";
  }

  if (confidence === "medium") {
    return "likely";
  }

  return "unknown";
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

function getFitStatusLabel(category, options = {}) {
  const suffix = options.includeHardware ? " on your saved hardware profile" : "";

  switch (category) {
    case "comfortable":
      return `Runs comfortably${suffix}`;
    case "likely":
      return `Likely to run${suffix}`;
    case "possible-with-offloading":
      return `May run with RAM offloading${suffix}`;
    case "slow-or-tight":
      return `May be slow or tight${suffix}`;
    case "unlikely":
      return `Unlikely to fit${suffix}`;
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

initThemeControls();
initTooltipEvents();
initCollapsibleSections();
refreshActiveTabStatus();
