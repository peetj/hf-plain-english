const MESSAGE_TYPE_PAGE_SEEN = "HF_PLAIN_ENGLISH_PAGE_SEEN";

let lastReportedUrl = "";
let parserModulePromise = null;

function loadParserModule() {
  if (!parserModulePromise) {
    parserModulePromise = import(chrome.runtime.getURL("services/huggingface-url-parser.js"));
  }

  return parserModulePromise;
}

async function reportCurrentPage() {
  const currentUrl = window.location.href;

  if (currentUrl === lastReportedUrl) {
    return;
  }

  lastReportedUrl = currentUrl;
  let parsedUrl = null;

  try {
    const { parseHuggingFaceModelUrl } = await loadParserModule();
    parsedUrl = parseHuggingFaceModelUrl(currentUrl);
  } catch (error) {
    console.warn("Model Mentor could not parse the current Hugging Face URL.", error);
  }

  chrome.runtime.sendMessage(
    {
      type: MESSAGE_TYPE_PAGE_SEEN,
      url: currentUrl,
      parsedUrl
    },
    () => {
      void chrome.runtime.lastError;
    }
  );
}

function wrapHistoryMethod(methodName) {
  const originalMethod = window.history[methodName];

  window.history[methodName] = function wrappedHistoryMethod(...args) {
    const result = originalMethod.apply(this, args);
    window.setTimeout(reportCurrentPage, 0);
    return result;
  };
}

wrapHistoryMethod("pushState");
wrapHistoryMethod("replaceState");
window.addEventListener("popstate", reportCurrentPage);
window.addEventListener("hashchange", reportCurrentPage);

reportCurrentPage();
