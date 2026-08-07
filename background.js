import { parseHuggingFaceModelUrl } from "./services/huggingface-url-parser.js";

const SIDE_PANEL_PATH = "sidepanel/sidepanel.html";

async function setSidePanelForTab(tabId, url) {
  if (typeof tabId !== "number") {
    return;
  }

  const parsedUrl = parseHuggingFaceModelUrl(url || "");

  await chrome.sidePanel.setOptions({
    tabId,
    path: SIDE_PANEL_PATH,
    enabled: true
  });

  await chrome.action.setTitle({
    tabId,
    title: parsedUrl.ok
      ? "Open Hugging Face for Newbies"
      : "Hugging Face for Newbies works on public Hugging Face model pages"
  });
}

async function configureSidePanelBehavior() {
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
}

async function openSidePanel(tab) {
  if (!tab || typeof tab.id !== "number") {
    return;
  }

  await setSidePanelForTab(tab.id, tab.url);

  try {
    await chrome.sidePanel.open({ tabId: tab.id });
  } catch {
    if (typeof tab.windowId === "number") {
      await chrome.sidePanel.open({ windowId: tab.windowId });
    }
  }
}

chrome.runtime.onInstalled.addListener(() => {
  configureSidePanelBehavior().catch((error) => {
    console.warn("Unable to configure Hugging Face for Newbies side panel action behavior.", error);
  });
});

chrome.runtime.onStartup.addListener(() => {
  configureSidePanelBehavior().catch((error) => {
    console.warn("Unable to configure Hugging Face for Newbies side panel action behavior on startup.", error);
  });
});

configureSidePanelBehavior().catch((error) => {
  console.warn("Unable to configure Hugging Face for Newbies side panel action behavior on worker start.", error);
});

chrome.action.onClicked.addListener((tab) => {
  openSidePanel(tab).catch((error) => {
    console.warn("Unable to open Hugging Face for Newbies side panel.", error);
  });
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (!changeInfo.url && changeInfo.status !== "complete") {
    return;
  }

  setSidePanelForTab(tabId, tab.url || changeInfo.url).catch((error) => {
    console.warn("Unable to update Hugging Face for Newbies side panel state.", error);
  });
});

chrome.tabs.onActivated.addListener(({ tabId }) => {
  chrome.tabs.get(tabId, (tab) => {
    if (chrome.runtime.lastError) {
      return;
    }

    setSidePanelForTab(tabId, tab.url).catch((error) => {
      console.warn("Unable to update active tab side panel state.", error);
    });
  });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "HF_PLAIN_ENGLISH_PAGE_SEEN") {
    return false;
  }

  const tabId = sender.tab?.id;

  if (typeof tabId !== "number") {
    sendResponse({ ok: false, reason: "missing-tab" });
    return false;
  }

  const payload = {
    tabId,
    url: message.url || sender.tab?.url || "",
    parsedUrl: parseHuggingFaceModelUrl(message.url || sender.tab?.url || ""),
    seenAt: new Date().toISOString()
  };

  chrome.storage.session
    .set({ [`hfPlainEnglish.tab.${tabId}`]: payload })
    .then(() => sendResponse({ ok: true }))
    .catch((error) => {
      console.warn("Unable to store Hugging Face for Newbies tab state.", error);
      sendResponse({ ok: false, reason: "storage-error" });
    });

  return true;
});
