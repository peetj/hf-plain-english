import { parseHuggingFaceModelUrl } from "../services/huggingface-url-parser.js";
import { fetchHuggingFaceModel } from "../services/huggingface-api.js";
import { parseModelFacts } from "../services/model-parser.js";
import { estimateHardwareFit } from "../services/hardware-estimator.js";
import { recommendModelTool } from "../services/recommendation-engine.js";
import { generateDeterministicExplanation } from "../services/explanation-service.js";
import { fetchModelCandidates } from "../services/model-candidate-search.js";
import { buildModelFitFinder, rankModelCandidates } from "../services/model-fit-finder.js";
import { answerLearnerQuestion } from "../services/question-answer-service.js";

const activeUrlElement = document.querySelector("#active-url");
const modelOwnerElement = document.querySelector("#model-owner");
const themeSelect = document.querySelector("#theme-select");
const statusCard = document.querySelector("#status-card");
const statusMessageElement = document.querySelector("#status-message");
const askHelperForm = document.querySelector("#ask-helper-form");
const askHelperInput = document.querySelector("#ask-helper-input");
const askHelperAnswerElement = document.querySelector("#ask-helper-answer");
const modelFinderForm = document.querySelector("#model-finder-form");
const modelFinderTargetElement = document.querySelector("#model-finder-target");
const modelFinderFormatElement = document.querySelector("#model-finder-format");
const modelFinderQuantisationElement = document.querySelector("#model-finder-quantisation");
const modelFinderRouteElement = document.querySelector("#model-finder-route");
const modelFinderPriorityElement = document.querySelector("#model-finder-priority");
const modelFinderRankElement = document.querySelector("#model-finder-rank");
const modelFinderKeywordElement = document.querySelector("#model-finder-keyword");
const modelFinderLocalOnlyElement = document.querySelector("#model-finder-local-only");
const modelFinderPermissiveOnlyElement = document.querySelector("#model-finder-permissive-only");
const modelFinderPriorityResetButton = document.querySelector("#model-finder-reset-order");
const modelFinderChecksElement = document.querySelector("#model-finder-checks");
const modelFinderPriorityFieldElements = Array.from(document.querySelectorAll("[data-priority-field]"));
const modelFinderSummaryElement = document.querySelector("#model-finder-summary");
const modelFinderRecommendationElement = document.querySelector("#model-finder-recommendation");
const modelFinderList = document.querySelector("#model-finder-list");
const modelFinderLinks = document.querySelector("#model-finder-links");
const hardwareProfileDisplayElement = document.querySelector("#hardware-profile-display");
const hardwareProfileEditButton = document.querySelector("#hardware-profile-edit-button");
const hardwareProfileForm = document.querySelector("#hardware-profile-form");
const hardwareProfileOsElement = document.querySelector("#hardware-profile-os");
const hardwareProfileVramElement = document.querySelector("#hardware-profile-vram");
const hardwareProfileRamElement = document.querySelector("#hardware-profile-ram");
const hardwareProfileExperienceElement = document.querySelector("#hardware-profile-experience");
const hardwareProfileToolElements = Array.from(document.querySelectorAll(".hardware-profile-tool"));
const hardwareProfileCancelButton = document.querySelector("#hardware-profile-cancel-button");
const learnerAnswerSection = document.querySelector("#learner-answer-section");
const learnerAnswerHeadingElement = document.querySelector("#learner-answer-heading");
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
let savedHardwareProfile = {};
let activeModelFinderRequestId = 0;
let modelFinderRenderTimeout = 0;
let refreshActiveTabStatusTimeout = 0;
let uiRevealTokenCounter = 0;
let currentLearnerContext = createLearnerContext();
let currentModelFinderRecommendation = null;
let currentModelFinderSearchLinks = [];
const HARDWARE_PROFILE_STORAGE_KEY = "hfNewbies.hardwareProfile";
const MODEL_FINDER_DEFAULT_FIELD_ORDER = ["rank", "target", "format", "quantisation", "route", "priority", "keyword"];
const EXAMPLE_MODEL_URL = "https://huggingface.co/Qwen/Qwen3-0.6B";
const hardwareProfilePromise = loadHardwareProfile().then((profile) => {
  savedHardwareProfile = profile;
  return profile;
});
const tooltipDefinitionsPromise = loadTooltips().then((definitions) => {
  tooltipDefinitions = definitions;
  return definitions;
});

function setStatus(label, message) {
  const labelElement = statusCard.querySelector(".status-label");
  labelElement.textContent = label;

  if (message instanceof Node) {
    statusMessageElement.replaceChildren(message);
  } else {
    renderTooltipText(statusMessageElement, message);
  }

  revealUpdatedElement(statusCard, { kind: "soft", show: false });
}

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0] || null;
}

async function refreshActiveTabStatus() {
  const refreshId = activeRefreshId + 1;
  activeRefreshId = refreshId;
  currentLearnerContext = createLearnerContext({ pageState: "loading" });

  setStatus("Loading", "Checking the active browser tab.");
  resetModelIdentity("Checking active tab...");
  resetFetchedDetails();

  try {
    const tab = await getActiveTab();

    if (!tab?.url) {
      currentLearnerContext = createLearnerContext({
        pageState: "no-active-tab",
        currentUrl: ""
      });
      resetModelIdentity("No active tab");
      setStatus("No active tab", "Open a public Hugging Face model page and try again.");
      renderLearnerState("Nothing to explain yet.", [
        ["What happened", "Chrome did not report an active page to inspect."],
        ["Next step", "Open a public Hugging Face model page, then use Recheck if this panel does not update automatically."]
      ]);
      return;
    }

    activeUrlElement.textContent = tab.url;
    modelOwnerElement.hidden = true;
    const parsedUrl = parseHuggingFaceModelUrl(tab.url);

    if (parsedUrl.ok) {
      currentLearnerContext = createLearnerContext({
        pageState: "model-loading",
        currentUrl: tab.url,
        parsedUrl,
        modelId: parsedUrl.modelId
      });
      renderModelIdentity(parsedUrl.modelId);
      setStatus("Loading model facts", `Resolved model ID: ${parsedUrl.modelId}. Fetching public Hugging Face metadata.`);
      renderTooltipText(overviewTextElement, "This is a supported public Hugging Face model-page URL.");
      await loadModelFacts(parsedUrl.modelId, refreshId);
      return;
    }

    if (parsedUrl.isHuggingFace) {
      currentLearnerContext = createLearnerContext({
        pageState: "unsupported-hugging-face-page",
        currentUrl: tab.url,
        parsedUrl
      });
      resetModelIdentity("");
      setStatus("Open a specific model", createUnsupportedStatusMessage(parsedUrl.reason));
      renderUnsupportedHuggingFaceState(parsedUrl.reason);
      renderTooltipText(
        overviewTextElement,
        getUnsupportedOverview(parsedUrl.reason)
      );
      return;
    }

    currentLearnerContext = createLearnerContext({
      pageState: "unsupported-page",
      currentUrl: tab.url,
      parsedUrl
    });
    resetModelIdentity("No model page selected");
    setStatus("Open a Hugging Face model", "Open a public model page on Hugging Face and this guide will explain it in plain English.");
    renderLearnerState("Open a Hugging Face model page to begin.", [
      ["What happened", "This browser tab is not a public Hugging Face model page."],
      ["Next step", "Open a model page on huggingface.co, then use Recheck if this panel does not update automatically."]
    ]);
    renderTooltipText(
      overviewTextElement,
      "Open a public Hugging Face model page, then use Recheck if this panel does not update automatically."
    );
  } catch (error) {
    currentLearnerContext = createLearnerContext({
      pageState: "tab-error",
      currentUrl: ""
    });
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
    currentLearnerContext = createLearnerContext({
      pageState: result.status,
      modelId,
      currentUrl: `https://huggingface.co/${modelId}`
    });
    showFetchError(result);
    return;
  }

  const data = result.data;
  const interpreted = parseModelFacts(data);
  const [glossary] = await Promise.all([
    loadGlossary(),
    tooltipDefinitionsPromise
  ]);
  const hardwareProfile = getCurrentHardwareProfile();
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
  currentLearnerContext = createLearnerContext({
    pageState: "model-ready",
    currentUrl: `https://huggingface.co/${data.modelId}`,
    modelId: data.modelId,
    model: data,
    interpreted,
    hardwareEstimate,
    recommendation,
    hardwareProfile,
    glossary
  });
  renderModelFinderLinks(currentModelFinderSearchLinks);

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
  learnerAnswerHeadingElement.textContent = "Model at a glance";
  renderTooltipText(answerSummaryElement, explanation.summary);
  renderDefinitionList(answerList, [
    ["What it is", buildWhatItIsAnswer(model, interpreted)],
    ["Good for", buildGoodForAnswer(interpreted)],
    ["Local fit", buildLocalFitAnswer(hardwareEstimate)],
    ["Start with", buildNextStepAnswer(recommendation, hardwareEstimate, hardwareProfile, interpreted)],
    ["Check before downloading", buildDownloadCautionAnswer(model, recommendation, hardwareEstimate)],
    ["Confidence", buildOverallConfidenceAnswer(interpreted, recommendation, hardwareEstimate)]
  ]);
  revealUpdatedElement(learnerAnswerSection);
}

function renderLearnerState(summary, rows) {
  learnerAnswerHeadingElement.textContent = "Current page";
  renderTooltipText(answerSummaryElement, summary);
  renderDefinitionList(answerList, rows);
  revealUpdatedElement(learnerAnswerSection);
}

function renderUnsupportedHuggingFaceState(reason) {
  renderLearnerState("Open an individual model page to get a plain-English read.", [
    ["What happened", getUnsupportedMessage(reason)],
    ["Where to go", createUnsupportedNavigation(reason)],
    ["What to look for", createExampleModelUrlGuidance()]
  ]);
}

function createUnsupportedStatusMessage(reason) {
  if (reason === "not-a-model-page" || reason === "invalid-model-id" || reason === "unsupported-hugging-face-section") {
    return createTextWithLink([
      "Open a specific model page like ",
      { href: EXAMPLE_MODEL_URL, text: EXAMPLE_MODEL_URL },
      ", where Qwen is the publisher and Qwen3-0.6B is the model."
    ]);
  }

  return document.createTextNode(getUnsupportedMessage(reason));
}

function createExampleModelUrlGuidance() {
  return createTextWithLink([
    "Choose a specific model page. For example, ",
    { href: EXAMPLE_MODEL_URL, text: EXAMPLE_MODEL_URL },
    " works because Qwen is the publisher and Qwen3-0.6B is the model."
  ]);
}

function createTextWithLink(parts) {
  const container = document.createElement("span");

  for (const part of parts) {
    if (typeof part === "string") {
      container.append(document.createTextNode(part));
      continue;
    }

    const anchor = document.createElement("a");
    anchor.href = part.href;
    anchor.target = "_blank";
    anchor.rel = "noreferrer";
    anchor.textContent = part.text || part.href;
    container.append(anchor);
  }

  return container;
}

function createUnsupportedNavigation(reason) {
  const container = document.createElement("div");
  container.className = "nav-link-list";

  for (const link of getUnsupportedNavigationLinks(reason)) {
    const anchor = document.createElement("a");
    anchor.href = link.url;
    anchor.target = "_blank";
    anchor.rel = "noreferrer";
    anchor.textContent = link.label;
    container.append(anchor);
  }

  return container;
}

async function initModelFinder() {
  const [hardwareProfile] = await Promise.all([
    hardwareProfilePromise,
    tooltipDefinitionsPromise
  ]);

  initStaticTooltipText();
  renderModelMatchTerms();
  renderSavedHardwareProfile(hardwareProfile);
  populateHardwareProfileForm(hardwareProfile);
  restoreModelFinderChoices();
  renderModelFinder(hardwareProfile);
  initHardwareProfileEditor();
  modelFinderForm.addEventListener("submit", (event) => {
    event.preventDefault();
  });
  modelFinderForm.addEventListener("input", handleModelFinderChange);
  modelFinderForm.addEventListener("change", handleModelFinderChange);
  modelFinderForm.addEventListener("click", handleModelFinderPriorityClick);
  modelFinderPriorityResetButton.addEventListener("click", () => {
    renderModelFinderFieldOrder(MODEL_FINDER_DEFAULT_FIELD_ORDER);
    handleModelFinderChange();
  });
}

function handleModelFinderChange() {
  saveModelFinderChoices();
  scheduleModelFinderRender();
}

function handleModelFinderPriorityClick(event) {
  const button = event.target.closest("[data-priority-action]");

  if (!button || !modelFinderForm.contains(button)) {
    return;
  }

  event.preventDefault();

  const fieldElement = button.closest("[data-priority-field]");
  const action = button.dataset.priorityAction;

  if (!fieldElement || !["up", "down"].includes(action)) {
    return;
  }

  const order = getModelFinderFieldOrder();
  const currentIndex = order.indexOf(fieldElement.dataset.priorityField);
  const targetIndex = action === "up" ? currentIndex - 1 : currentIndex + 1;

  if (currentIndex < 0 || targetIndex < 0 || targetIndex >= order.length) {
    return;
  }

  [order[currentIndex], order[targetIndex]] = [order[targetIndex], order[currentIndex]];
  renderModelFinderFieldOrder(order);
  handleModelFinderChange();
}

function initHardwareProfileEditor() {
  hardwareProfileEditButton.addEventListener("click", () => {
    populateHardwareProfileForm(getCurrentHardwareProfile());
    hardwareProfileForm.hidden = false;
    hardwareProfileEditButton.hidden = true;
  });

  hardwareProfileCancelButton.addEventListener("click", () => {
    populateHardwareProfileForm(getCurrentHardwareProfile());
    hardwareProfileForm.hidden = true;
    hardwareProfileEditButton.hidden = false;
  });

  hardwareProfileForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    savedHardwareProfile = normalizeHardwareProfile(readHardwareProfileForm(), getCurrentHardwareProfile());
    await saveHardwareProfile(savedHardwareProfile);
    renderSavedHardwareProfile(savedHardwareProfile);
    hardwareProfileForm.hidden = true;
    hardwareProfileEditButton.hidden = false;
    renderModelFinder(savedHardwareProfile);
    refreshActiveTabStatus();
  });
}

function renderSavedHardwareProfile(profile) {
  renderTooltipText(hardwareProfileDisplayElement, formatHardwareProfile(profile));
}

function populateHardwareProfileForm(profile) {
  const preferredTools = Array.isArray(profile?.preferredTools) ? profile.preferredTools : [];

  hardwareProfileOsElement.value = profile?.operatingSystem || "";
  hardwareProfileVramElement.value = profile?.gpuVramGb !== null && profile?.gpuVramGb !== undefined && Number.isFinite(Number(profile.gpuVramGb)) ? String(profile.gpuVramGb) : "";
  hardwareProfileRamElement.value = profile?.systemRamGb !== null && profile?.systemRamGb !== undefined && Number.isFinite(Number(profile.systemRamGb)) ? String(profile.systemRamGb) : "";
  setSelectValue(hardwareProfileExperienceElement, profile?.experienceLevel || "Beginner");

  for (const toolElement of hardwareProfileToolElements) {
    toolElement.checked = preferredTools.includes(toolElement.value);
  }
}

function readHardwareProfileForm() {
  return {
    operatingSystem: hardwareProfileOsElement.value.trim(),
    gpuVramGb: numberOrNull(hardwareProfileVramElement.value),
    systemRamGb: numberOrNull(hardwareProfileRamElement.value),
    experienceLevel: hardwareProfileExperienceElement.value,
    preferredTools: hardwareProfileToolElements
      .filter((toolElement) => toolElement.checked)
      .map((toolElement) => toolElement.value)
  };
}

function getCurrentHardwareProfile() {
  return savedHardwareProfile && typeof savedHardwareProfile === "object" ? savedHardwareProfile : {};
}

function scheduleModelFinderRender() {
  globalThis.clearTimeout(modelFinderRenderTimeout);
  modelFinderRenderTimeout = globalThis.setTimeout(() => {
    renderModelFinder(savedHardwareProfile);
  }, 250);
}

async function renderModelFinder(hardwareProfile) {
  const requestId = activeModelFinderRequestId + 1;
  activeModelFinderRequestId = requestId;
  const choices = getModelFinderChoices();
  const finder = buildModelFitFinder(hardwareProfile, choices);
  currentModelFinderSearchLinks = finder.searchLinks;
  renderModelFinderSummary(finder);
  renderDefinitionList(modelFinderList, finder.rows);
  renderModelFinderLinks(finder.searchLinks);
  renderModelFinderLoading();

  const result = await fetchModelCandidates(finder.candidateRequest);

  if (requestId !== activeModelFinderRequestId) {
    return;
  }

  if (!result.ok) {
    renderModelFinderRecommendation({
      status: "error",
      model: null,
      justification: `${result.error} Use the filtered search links below and scan for the target range manually.`
    });
    return;
  }

  renderModelFinderRecommendation(rankModelCandidates(result.candidates, finder, choices));
}

function renderModelFinderSummary(finder) {
  modelFinderSummaryElement.replaceChildren();

  const profile = document.createElement("strong");
  renderTooltipText(profile, finder.summaryProfile || "Saved hardware profile");

  modelFinderSummaryElement.append(profile, document.createTextNode(": "));

  const guidance = document.createElement("span");
  renderTooltipText(guidance, finder.summaryGuidance || "");
  modelFinderSummaryElement.append(guidance);
}

function renderModelFinderLinks(links) {
  modelFinderLinks.replaceChildren();
  const returnNote = createCurrentModelReturnNote();

  if (returnNote) {
    modelFinderLinks.append(returnNote);
  }

  for (const link of links) {
    const anchor = document.createElement("a");
    anchor.className = "finder-link";
    anchor.href = link.url;
    anchor.target = "_blank";
    anchor.rel = "noreferrer";
    anchor.textContent = link.label;

    if (link.tooltipId) {
      anchor.classList.add("tooltip-term");
      anchor.dataset.tooltipId = link.tooltipId;
      anchor.setAttribute("aria-describedby", "tooltip-layer");
    }

    modelFinderLinks.append(anchor);
  }
}

function createCurrentModelReturnNote() {
  const modelId = currentLearnerContext?.modelId;

  if (!modelId) {
    const note = document.createElement("p");
    note.className = "finder-navigation-note";
    note.textContent = "Search opens in a new tab, so this guide stays where it is.";
    return note;
  }

  const note = document.createElement("p");
  const anchor = document.createElement("a");
  note.className = "finder-navigation-note";
  anchor.href = `https://huggingface.co/${modelId}`;
  anchor.target = "_blank";
  anchor.rel = "noreferrer";
  anchor.textContent = String(modelId).split("/").pop() || modelId;
  note.append("Search opens in a new tab. Current model: ", anchor);
  return note;
}

function getModelFinderChoices() {
  return {
    goal: modelFinderForm.elements["model-goal"].value,
    targetSize: modelFinderTargetElement.value,
    fileFormat: modelFinderFormatElement.value,
    quantisation: modelFinderQuantisationElement.value,
    route: modelFinderRouteElement.value,
    priority: modelFinderPriorityElement.value,
    rankBy: modelFinderRankElement.value,
    keyword: modelFinderKeywordElement.value.trim(),
    localOnly: modelFinderLocalOnlyElement.checked,
    permissiveOnly: modelFinderPermissiveOnlyElement.checked,
    fieldOrder: getModelFinderFieldOrder()
  };
}

function restoreModelFinderChoices() {
  const storedChoices = readStoredModelFinderChoices();
  const goalInput = modelFinderForm.querySelector(`input[name="model-goal"][value="${storedChoices.goal}"]`);

  if (goalInput) {
    goalInput.checked = true;
  }

  setSelectValue(modelFinderTargetElement, storedChoices.targetSize);
  setSelectValue(modelFinderFormatElement, storedChoices.fileFormat);
  setSelectValue(modelFinderQuantisationElement, storedChoices.quantisation);
  setSelectValue(modelFinderRouteElement, storedChoices.route);
  setSelectValue(modelFinderPriorityElement, storedChoices.priority);
  setSelectValue(modelFinderRankElement, storedChoices.rankBy);
  modelFinderKeywordElement.value = storedChoices.keyword;
  modelFinderLocalOnlyElement.checked = storedChoices.localOnly;
  modelFinderPermissiveOnlyElement.checked = storedChoices.permissiveOnly;
  renderModelFinderFieldOrder(storedChoices.fieldOrder);
}

function saveModelFinderChoices() {
  localStorage.setItem("hfNewbies.modelFinder", JSON.stringify(getModelFinderChoices()));
}

function readStoredModelFinderChoices() {
  try {
    const parsed = JSON.parse(localStorage.getItem("hfNewbies.modelFinder") || "{}");
    return {
      goal: isAllowedChoice(parsed.goal, ["chat", "code", "embedding", "image"]) ? parsed.goal : "chat",
      targetSize: isAllowedChoice(parsed.targetSize, ["auto", "small", "comfort", "stretch", "tiny", "compact", "sevenB", "thirteenB"]) ? parsed.targetSize : "auto",
      fileFormat: isAllowedChoice(parsed.fileFormat, ["auto", "gguf", "safetensors", "diffusers"]) ? parsed.fileFormat : "auto",
      quantisation: isAllowedChoice(parsed.quantisation, ["auto", "q4", "q5", "fp16"]) ? parsed.quantisation : "auto",
      route: isAllowedChoice(parsed.route, ["beginner", "ollama", "python", "unsure"]) ? parsed.route : "beginner",
      priority: isAllowedChoice(parsed.priority, ["balanced", "speed", "quality"]) ? parsed.priority : "balanced",
      rankBy: isAllowedChoice(parsed.rankBy, ["popular", "downloads", "likes"]) ? parsed.rankBy : "popular",
      keyword: typeof parsed.keyword === "string" ? parsed.keyword.slice(0, 40) : "",
      localOnly: parsed.localOnly !== false,
      permissiveOnly: parsed.permissiveOnly === true,
      fieldOrder: normalizeModelFinderFieldOrder(parsed.fieldOrder)
    };
  } catch {
    return {
      goal: "chat",
      targetSize: "auto",
      fileFormat: "auto",
      quantisation: "auto",
      route: "beginner",
      priority: "balanced",
      rankBy: "popular",
      keyword: "",
      localOnly: true,
      permissiveOnly: false,
      fieldOrder: MODEL_FINDER_DEFAULT_FIELD_ORDER
    };
  }
}

function getModelFinderFieldOrder() {
  return normalizeModelFinderFieldOrder(
    Array.from(modelFinderForm.querySelectorAll("[data-priority-field]"))
      .map((fieldElement) => fieldElement.dataset.priorityField)
  );
}

function normalizeModelFinderFieldOrder(order) {
  const uniqueOrder = Array.isArray(order)
    ? order.filter((key, index) => MODEL_FINDER_DEFAULT_FIELD_ORDER.includes(key) && order.indexOf(key) === index)
    : [];

  return [
    ...uniqueOrder,
    ...MODEL_FINDER_DEFAULT_FIELD_ORDER.filter((key) => !uniqueOrder.includes(key))
  ];
}

function renderModelFinderFieldOrder(order) {
  const normalizedOrder = normalizeModelFinderFieldOrder(order);
  const fieldsByKey = new Map(modelFinderPriorityFieldElements.map((fieldElement) => [fieldElement.dataset.priorityField, fieldElement]));

  for (const key of normalizedOrder) {
    const fieldElement = fieldsByKey.get(key);

    if (fieldElement) {
      modelFinderForm.insertBefore(fieldElement, modelFinderChecksElement);
    }
  }

  normalizedOrder.forEach((key, index) => {
    const fieldElement = fieldsByKey.get(key);
    const rankElement = fieldElement?.querySelector(".finder-priority-rank");
    const upButton = fieldElement?.querySelector('[data-priority-action="up"]');
    const downButton = fieldElement?.querySelector('[data-priority-action="down"]');

    if (rankElement) {
      rankElement.textContent = String(index + 1);
      rankElement.setAttribute("aria-label", `Priority ${index + 1}`);
    }

    if (upButton) {
      upButton.disabled = index === 0;
    }

    if (downButton) {
      downButton.disabled = index === normalizedOrder.length - 1;
    }
  });
}

function isAllowedChoice(value, allowedValues) {
  return allowedValues.includes(value);
}

function setSelectValue(selectElement, value) {
  if ([...selectElement.options].some((option) => option.value === value)) {
    selectElement.value = value;
  }
}

function initStaticTooltipText() {
  for (const element of document.querySelectorAll("[data-tooltip-copy]")) {
    renderTooltipText(element, element.textContent);
  }
}

function renderModelFinderLoading() {
  modelFinderRecommendationElement.className = "finder-recommendation finder-recommendation-loading";
  renderTooltipText(modelFinderRecommendationElement, "Looking for a starting candidate on Hugging Face...");
  revealUpdatedElement(modelFinderRecommendationElement, { kind: "soft", show: false });
}

function renderModelFinderRecommendation(recommendation) {
  currentModelFinderRecommendation = recommendation;
  modelFinderRecommendationElement.replaceChildren();
  modelFinderRecommendationElement.className = `finder-recommendation finder-recommendation-${recommendation.status}`;

  const title = document.createElement("p");
  title.className = "finder-recommendation-title";

  if (recommendation.status !== "found" || !recommendation.model) {
    title.textContent = recommendation.status === "empty" ? "No starting candidate found" : "Candidate search unavailable";
    const detail = document.createElement("p");
    renderTooltipText(detail, recommendation.justification);
    modelFinderRecommendationElement.append(title, detail);
    revealUpdatedElement(modelFinderRecommendationElement, { kind: "soft", show: false });
    return;
  }

  title.textContent = "Starting candidate";

  const modelLink = document.createElement("a");
  const modelUrl = `https://huggingface.co/${recommendation.model.modelId}`;
  modelLink.className = "finder-model-link";
  modelLink.href = modelUrl;
  modelLink.target = "_blank";
  modelLink.rel = "noreferrer";
  modelLink.textContent = modelUrl;

  const stats = document.createElement("p");
  stats.className = "finder-model-stats";
  stats.textContent = [
    recommendation.model.downloads ? `${recommendation.model.downloads.toLocaleString()} downloads` : "",
    recommendation.model.likes ? `${recommendation.model.likes.toLocaleString()} likes` : "",
    recommendation.model.libraryName || "",
    recommendation.model.pipelineTag || ""
  ].filter(Boolean).join(" | ");

  const summary = createCandidateSummary(recommendation);

  const detail = document.createElement("p");
  detail.className = "finder-candidate-reason";
  renderTooltipText(detail, recommendation.justification);

  modelFinderRecommendationElement.append(title, modelLink, stats, summary, detail);
  revealUpdatedElement(modelFinderRecommendationElement, { show: false });
}

function createCandidateSummary(recommendation) {
  const summary = document.createElement("div");
  summary.className = "finder-candidate-summary";

  if (!Array.isArray(recommendation.summaryPoints) || recommendation.summaryPoints.length === 0) {
    const paragraph = document.createElement("p");
    renderTooltipText(paragraph, recommendation.summary || recommendation.justification);
    summary.append(paragraph);
    return summary;
  }

  const list = document.createElement("ul");
  list.className = "finder-candidate-summary-list";

  for (const point of recommendation.summaryPoints) {
    const item = document.createElement("li");
    renderTooltipText(item, point);
    list.append(item);
  }

  summary.append(list);
  return summary;
}

function initAskHelper() {
  askHelperForm.addEventListener("submit", (event) => {
    event.preventDefault();
    renderAskHelperAnswer(askHelperInput.value);
  });

  for (const button of document.querySelectorAll("[data-ask-suggestion]")) {
    button.addEventListener("click", () => {
      askHelperInput.value = button.dataset.askSuggestion || "";
      renderAskHelperAnswer(askHelperInput.value);
      askHelperInput.focus();
    });
  }
}

function renderAskHelperAnswer(question) {
  const answer = answerLearnerQuestion(question, {
    ...currentLearnerContext,
    modelFinderRecommendation: currentModelFinderRecommendation,
    tooltips: tooltipDefinitions
  });

  askHelperAnswerElement.replaceChildren();
  askHelperAnswerElement.className = `ask-helper-answer ask-helper-answer-${answer.status}`;

  const title = document.createElement("p");
  const detail = document.createElement("p");
  const source = document.createElement("p");

  title.className = "ask-answer-title";
  detail.className = "ask-answer-text";
  source.className = "ask-answer-source";
  title.textContent = answer.title;
  renderTooltipText(detail, answer.answer);
  source.textContent = `Source: ${answer.sourceLabel}`;
  askHelperAnswerElement.append(title, detail, source);

  if (Array.isArray(answer.followUps) && answer.followUps.length > 0) {
    const followUps = document.createElement("div");
    followUps.className = "ask-answer-followups";

    for (const followUp of answer.followUps.slice(0, 4)) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = followUp;
      button.addEventListener("click", () => {
        askHelperInput.value = followUp;
        renderAskHelperAnswer(followUp);
        askHelperInput.focus();
      });
      followUps.append(button);
    }

    askHelperAnswerElement.append(followUps);
  }

  revealUpdatedElement(askHelperAnswerElement, { kind: "emphasis" });
}

function createLearnerContext(overrides = {}) {
  return {
    pageState: "starting",
    currentUrl: "",
    parsedUrl: null,
    modelId: "",
    model: null,
    interpreted: null,
    hardwareEstimate: null,
    recommendation: null,
    hardwareProfile: savedHardwareProfile,
    glossary: [],
    ...overrides
  };
}

function revealUpdatedElement(element, options = {}) {
  if (!element) {
    return;
  }

  if (options.show !== false) {
    element.hidden = false;
  }

  const kind = options.kind === "emphasis" || options.kind === "soft" ? options.kind : "standard";
  element.classList.remove("ui-reveal-update", "ui-reveal-soft", "ui-reveal-emphasis");

  // Restart the animation when the same element is updated repeatedly.
  void element.offsetWidth;

  element.classList.add("ui-reveal-update", `ui-reveal-${kind}`);
  const revealToken = String(uiRevealTokenCounter + 1);
  uiRevealTokenCounter += 1;
  element.dataset.revealToken = revealToken;

  globalThis.setTimeout(() => {
    if (element.dataset.revealToken !== revealToken) {
      return;
    }

    element.classList.remove("ui-reveal-update", "ui-reveal-soft", "ui-reveal-emphasis");
    delete element.dataset.revealToken;
  }, kind === "emphasis" ? 1000 : 900);
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

function buildGoodForAnswer(interpreted) {
  const kind = interpreted?.modelKind?.value;
  const task = interpreted?.primaryTask?.value;

  if (kind === "chat" || kind === "instruct") {
    return "Prompts, instructions, and conversation if the files and licence fit your use.";
  }

  if (kind === "embedding" || task === "feature-extraction") {
    return "Search, matching, retrieval, clustering, or recommendation workflows; not ordinary chat.";
  }

  if (kind === "image" || task === "text-to-image") {
    return "Generating or editing images with specialist image tools.";
  }

  if (kind === "code") {
    return "Coding help, code completion, or programming chat if it is instruction tuned.";
  }

  return task ? `Likely related to ${task}, but check the model card before assuming.` : "Unclear from the available page data.";
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

function buildDownloadCautionAnswer(model, recommendation, hardwareEstimate) {
  const cautions = [];

  if (!model?.license) {
    cautions.push("licence");
  }

  if (model?.gated || model?.private) {
    cautions.push("access terms");
  }

  if (hardwareEstimate?.fit?.overall === "unlikely" || hardwareEstimate?.fit?.overall === "unknown") {
    cautions.push("hardware fit");
  }

  if (recommendation?.warnings?.length) {
    cautions.push("warnings");
  }

  if (cautions.length === 0) {
    return "Model card, licence, and the exact file you plan to download.";
  }

  return `Check ${Array.from(new Set(cautions)).join(", ")} before downloading.`;
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
        ["Next step", result.error.retryAfter ? `Wait until ${result.error.retryAfter}, then use Recheck.` : "Wait a few minutes, then use Recheck."]
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
        ["Next step", "Use Recheck. If it keeps happening, use the original model page directly."]
      ]);
      renderTooltipText(overviewTextElement, "The extension could not safely read the Hugging Face API response.");
      break;
    default:
      setStatus("Network error", result.error.message);
      renderLearnerState("The extension could not reach Hugging Face.", [
        ["What happened", "The network request failed before public model data could be loaded."],
        ["Next step", "Check your connection, then use Recheck."]
      ]);
      renderTooltipText(overviewTextElement, "Check the network connection and use Recheck.");
  }
}

function renderModelIdentity(modelId) {
  const [owner, modelName] = String(modelId).split("/");

  activeUrlElement.hidden = false;
  activeUrlElement.textContent = modelName || modelId;
  renderTooltipText(
    modelOwnerElement,
    owner ? `by ${owner} on Hugging Face` : "Hugging Face model page."
  );
  modelOwnerElement.hidden = false;
}

function resetModelIdentity(label) {
  activeUrlElement.hidden = !label;
  activeUrlElement.textContent = label || "";
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
        message: "The model card request was rate-limited. Next step: wait a few minutes and use Recheck."
      };
    case "model-card-network-error":
      return {
        message: "The model card could not be fetched because of a network problem. Next step: check your connection and use Recheck."
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
  const glossaryById = new Map(glossary.map((entry) => [entry.id, entry]));
  const entries = termIds
    .map((termId) => glossaryById.get(termId))
    .filter(Boolean);

  if (entries.length === 0) {
    renderModelMatchTerms();
    return;
  }

  renderTermsTable(entries);
}

function renderModelMatchTerms() {
  renderTermsTable([
    {
      term: "3B or 3B-4B",
      short: "Model size shorthand",
      detail: "3B means about 3 billion parameters. More parameters usually need more memory, but bigger is not automatically better."
    },
    {
      term: "Parameters",
      short: "The learned numbers in a model",
      detail: "A model with billions of parameters stores a lot of learned patterns. Parameter count is one clue for size and memory use."
    },
    {
      term: "GGUF",
      short: "A local-friendly model file format",
      detail: "GGUF is commonly used by beginner local tools such as LM Studio and llama.cpp-based apps."
    },
    {
      term: "Q4_K_M",
      short: "A compressed model variant",
      detail: "Q4_K_M usually uses much less memory than full-precision weights, which can make local testing more realistic."
    },
    {
      term: "Downloads and likes",
      short: "Popularity signals, not quality guarantees",
      detail: "Many downloads and likes can help find active models, but you still need to check the model card, files, licence, and fit."
    }
  ]);
}

function renderTermsTable(entries) {
  termsList.replaceChildren();

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
  renderModelMatchTerms();
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
  return section.id === "model-finder-section" || section.id === "learner-answer-section" || section.id === "terms-section";
}

function initThemeControls() {
  const storedTheme = localStorage.getItem("hfNewbies.theme");
  const initialTheme = isKnownTheme(storedTheme) ? storedTheme : "nord";
  applyTheme(initialTheme);

  themeSelect.addEventListener("change", () => {
    const theme = themeSelect.value;

    if (!isKnownTheme(theme)) {
      return;
    }

    localStorage.setItem("hfNewbies.theme", theme);
    applyTheme(theme);
  });
}

function applyTheme(theme) {
  document.body.dataset.theme = theme;

  if (themeSelect && themeSelect.value !== theme) {
    themeSelect.value = theme;
  }
}

function isKnownTheme(theme) {
  return ["nord", "solarized", "gruvbox", "catppuccin", "everforest", "tokyo"].includes(theme);
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
  const defaultProfile = await loadDefaultHardwareProfile();
  const storedProfile = await loadStoredHardwareProfile();
  return normalizeHardwareProfile(storedProfile || {}, defaultProfile);
}

async function loadDefaultHardwareProfile() {
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
    console.warn("Hugging Face for Newbies could not load the default hardware profile.", error);
    return {};
  }
}

async function loadStoredHardwareProfile() {
  if (globalThis.chrome?.storage?.local) {
    try {
      const result = await chrome.storage.local.get(HARDWARE_PROFILE_STORAGE_KEY);
      const profile = result?.[HARDWARE_PROFILE_STORAGE_KEY];
      return profile && typeof profile === "object" ? profile : null;
    } catch (error) {
      console.warn("Hugging Face for Newbies could not load the saved hardware profile.", error);
    }
  }

  try {
    const profile = JSON.parse(localStorage.getItem(HARDWARE_PROFILE_STORAGE_KEY) || "null");
    return profile && typeof profile === "object" ? profile : null;
  } catch {
    return null;
  }
}

async function saveHardwareProfile(profile) {
  if (globalThis.chrome?.storage?.local) {
    await chrome.storage.local.set({
      [HARDWARE_PROFILE_STORAGE_KEY]: profile
    });
    return;
  }

  localStorage.setItem(HARDWARE_PROFILE_STORAGE_KEY, JSON.stringify(profile));
}

function normalizeHardwareProfile(profile, fallback = {}) {
  const source = profile && typeof profile === "object" ? profile : {};
  const fallbackSource = fallback && typeof fallback === "object" ? fallback : {};
  const gpuVramGb = numberOrNull(source.gpuVramGb);
  const systemRamGb = numberOrNull(source.systemRamGb);
  const preferredTools = Array.isArray(source.preferredTools)
    ? source.preferredTools.filter((tool) => typeof tool === "string" && tool.trim() !== "")
    : Array.isArray(fallbackSource.preferredTools) ? fallbackSource.preferredTools : [];

  return {
    operatingSystem: stringOrFallback(source.operatingSystem, fallbackSource.operatingSystem, "Unknown OS"),
    gpuVramGb: gpuVramGb ?? numberOrNull(fallbackSource.gpuVramGb),
    systemRamGb: systemRamGb ?? numberOrNull(fallbackSource.systemRamGb),
    preferredTools,
    experienceLevel: stringOrFallback(source.experienceLevel, fallbackSource.experienceLevel, "Beginner")
  };
}

function numberOrNull(value) {
  if (value === null || value === undefined || (typeof value === "string" && value.trim() === "")) {
    return null;
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function stringOrFallback(value, fallback, defaultValue) {
  if (typeof value === "string" && value.trim() !== "") {
    return value.trim();
  }

  if (typeof fallback === "string" && fallback.trim() !== "") {
    return fallback.trim();
  }

  return defaultValue;
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

  if (profile?.gpuVramGb !== null && profile?.gpuVramGb !== undefined && Number.isFinite(Number(profile.gpuVramGb))) {
    parts.push(`${profile.gpuVramGb} GB VRAM`);
  }

  if (profile?.systemRamGb !== null && profile?.systemRamGb !== undefined && Number.isFinite(Number(profile.systemRamGb))) {
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
      return "This looks like a Hugging Face section, such as Models, Datasets, Spaces, docs, or settings. Open one individual model result so the guide can explain it.";
    case "not-a-model-page":
      return `This page is not an individual model repository. Open a page like ${EXAMPLE_MODEL_URL}, where Qwen is the publisher and Qwen3-0.6B is the model.`;
    case "invalid-model-id":
      return `This address does not look like a model page. A valid example is ${EXAMPLE_MODEL_URL}.`;
    case "malformed-url":
      return "Chrome returned a malformed URL for the active tab.";
    default:
      return "This page is outside the current guide.";
  }
}

function getUnsupportedOverview(reason) {
  if (reason === "unsupported-hugging-face-section") {
    return `Open a result from the Hugging Face Models directory. A supported model page has an owner/model address, for example ${EXAMPLE_MODEL_URL}.`;
  }

  return "Navigate to the Hugging Face Models directory, open a specific public model repository, then use Recheck if this panel does not update automatically.";
}

function getUnsupportedNavigationLinks(reason) {
  const links = [
    {
      label: "Browse Hugging Face Models",
      url: "https://huggingface.co/models"
    },
    {
      label: "Open text-generation models",
      url: "https://huggingface.co/models?pipeline_tag=text-generation&sort=trending"
    },
    {
      label: "Open GGUF local models",
      url: "https://huggingface.co/models?library=gguf&sort=trending"
    }
  ];

  if (reason === "unsupported-hugging-face-section") {
    links.push({
      label: "Learn from the current section, then choose a model repository",
      url: "https://huggingface.co/models"
    });
  }

  return links;
}

refreshButton.addEventListener("click", () => {
  refreshActiveTabStatus();
});

function scheduleActiveTabRefresh() {
  globalThis.clearTimeout(refreshActiveTabStatusTimeout);
  refreshActiveTabStatusTimeout = globalThis.setTimeout(() => {
    refreshActiveTabStatus();
  }, 200);
}

if (globalThis.chrome?.tabs?.onActivated) {
  chrome.tabs.onActivated.addListener(() => {
    scheduleActiveTabRefresh();
  });
}

if (globalThis.chrome?.tabs?.onUpdated) {
  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (tab.active && (changeInfo.url || changeInfo.status === "complete")) {
      scheduleActiveTabRefresh();
    }
  });
}

initThemeControls();
initTooltipEvents();
initCollapsibleSections();
initAskHelper();
initModelFinder();
refreshActiveTabStatus();
