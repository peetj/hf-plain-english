# Hugging Face for Newbies Development Plan

## Status Key

- [✅] Done.
- [⚠️] Started, partial, or needs review.
- [❌] Not started.

## Product Goal

Build a Chrome extension that helps an AI Learner understand Hugging Face model pages in plain English.

The learner should be able to open a public Hugging Face model page and quickly answer:

- [⚠️] What is this model?
- [⚠️] What can it do?
- [✅] Is it meant for chat, coding, images, embeddings, or another task?
- [⚠️] How large is it?
- [⚠️] Can it likely run on my computer?
- [⚠️] Which files matter?
- [⚠️] Should I use LM Studio, Ollama, Python, or another route?
- [⚠️] What licence, access, and safety issues should I check before using it?

## Working Feedback

- [✅] Remove redundant "Chrome side panel" text from the extension header.
- [✅] Rename the extension away from "HF Plain English".
- [✅] Make the shown model identity less confusing than repeating `owner/model` as the main label.
- [✅] Add a custom, non-browser-default tooltip explaining Hugging Face `owner/model` names.
- [✅] Create a tooltip architecture/event-flow for the extension. Tooltips use a green dotted underline and structured `data/tooltips.json` definitions parsed into rendered explanation text.
- [✅] Review the new name after seeing it in the browser. Current name changed to "Hugging Face for Newbies".
- [✅] Fix tooltip clipping by rendering tooltips in a panel-level fixed overlay instead of inside individual text containers.
- [✅] Change extension icon to a distinct learner-face design with glasses and a subtle pencil/book motif.
- [👍] The tooltip system looks great.
- [✅] Remove "Hugging Face calls this an owner/model ID." as it makes no sense
- [✅] "Runs Comfortably" needs more context, eg. on what? on my machine? What is the important spec of my machine if so?
- [👍] Overview is ok
- [✅] In "Fetched Facts" - ALL detail should tooltips
- [✅] In "Plain English Read" section you have something like this: "Likely model type   chat (metadata, high confidence)". The bracket text doesn't make sense. Why say "metadata"? "high confidence" is ok though.
- [✅] Make sure you include ALL acronyms that aren't everyday parlance in the tooltips, eg. BF16
- [✅] Let's do a fun one. Make the color scheme of the theme of the extension a bit more interesting but in the website colors - maybe contrasting colors that make the extension stand out.
- [✅] The Technical Terms (glossary section) is really using the wrong UX paradigm. An expandable section is not good here. Rather a table with "Term" and "Explanation" would be way better
- [✅] Make all the major sections collapsible with a dropdown arrow
- [✅] Invert the theme colors. I think that will look better
- [✅] Add multiple switchable color themes
- [✅] Replace the first theme colors with well-known palettes and make the header the darkest part of the extension.
- [👍] The table of tech terms is very good
- [✅] Start the extension with all sections closed except for Quick Answer/First Read
- [✅] Icon still not great at small dimension. Make it look more like hugging face with glasses but have eyes as well. Change color to slightly darker
- [✅] "Best next step" should be intelligent, ie. it won't necessarily be the same for me as for somebody else. Can we do this?
- [✅] "How to Read this Model" section:
          - Put badges inline with same row but right aligned
          - What is the point of the "Hugging Face Data" badge? I don't see any value in it??
          - Pointless having a badge of "Unknown" for a value of "Unknown"
          - Saying "No GGUF file was detected in this repository." in this section seems misplaced
- [✅] Add a feature that helps the user find the ideal model to fit on their machine. Make this a primary feature as what is the point of using the site otherwise. May involve recommending models based on some quick questions and their h/w profile?
- [✅] Improve model finder search links by removing weak terms like instruct, lm studio, and raw size-number searches.
- [✅] Add a reusable reveal animation hook for important UI updates, with reduced-motion support.
- [✅] Keep the manual page check as "Recheck" for retrying the active tab when Chrome or Hugging Face data does not update automatically.
- [✅] Replace theme buttons with a compact dropdown and add Catppuccin, Everforest, and Tokyo Night palettes.
- [✅] Replace blunt unsupported-page headings with friendlier, action-oriented guidance.
- [✅] Remove the duplicate product-name header inside the side panel and use a more welcoming guide title instead.
- [✅] Expand side-panel privacy text so it clearly explains Hugging Face API use, local Ask a Question behavior, Chrome storage, and no analytics.
- [✅] Add a dark branded footer with the NexGen logo and 2026 copyright.
- [✅] Refine the header layout: remove the side-panel document title text, rename the in-panel title to "Hugging Face Guide for You", place the theme dropdown under it, make Recheck a compact accented top-right action, and update the footer company name to Nexgen STEM School.
- [✅] Tune the header controls: make Recheck lighter-weight with a brighter orange accent and darker border, reduce dropdown vertical padding, and remove the unsupported-page "Choose a model" header placeholder.
- [✅] Make the header theme dropdown less prominent with a shorter height, smaller text, and minimal vertical padding.
- [✅] Add explicit Ask a Question copy saying the local helper is not an AI response.
- [✅] Add a "My preferred runtime is:" label above the saved hardware runtime checkboxes.
- [✅] Rename Model Match search links to "Filtered Search" and "Browse Small Local Models", add custom tooltips, and show a current-model return cue so search links feel safe to open.
- [✅] Lock in the Phase 2 completion order: 2.5 safe model-card parsing first, then richer suggested-candidate data, focused model type detection, missing glossary concepts, and multi-candidate comparison.
- [❌] Ignore.

## Current Foundation

- [✅] Chrome Extension Manifest V3 structure.
- [✅] Side panel extension shell.
- [✅] Hugging Face model URL detection.
- [✅] Public Hugging Face Hub API fetcher.
- [✅] Model metadata and file parser.
- [✅] Hardware fit estimator.
- [✅] Tool recommendation engine.
- [✅] Deterministic plain-English explanation service.
- [✅] Local glossary and hardware profile data.

The development plan below focuses on turning that foundation into a trustworthy learner-facing product.

## Principles

- [✅] Explain before recommending. The user should understand the reasoning, not just receive a verdict.
- [✅] Separate facts from estimates. Metadata, inferred labels, and hardware estimates must be visibly different.
- [✅] Prefer conservative recommendations. If the extension is uncertain, it should say so clearly.
- [✅] Keep beginners safe. Avoid pretending that every Hugging Face model is easy to run locally.
- [✅] Preserve source traceability. Important claims should point back to Hugging Face metadata, file names, or the model card.
- [✅] No analytics in V1 unless explicitly added later.

## Phase 1: Learner Experience

### ✅ 1.1 Rewrite Side Panel Around Learner Questions

- [✅] Remove developer-oriented header text.
- [✅] Rename the extension to clearer learner-facing language.
- [✅] Show the model name as the primary identity and the owner separately.
- [✅] Add a custom tooltip explaining Hugging Face `owner/model` naming.
- [✅] Replace remaining developer-oriented labels like "Fetched facts" with learner-facing sections.
- [✅] Add a top-level answer card with what it is, best next action, local run likelihood, and confidence.
- [✅] Make the side panel easy to scan in under 30 seconds.
- [✅] Keep detailed facts available below the plain-English answer.

Acceptance criteria:

- [✅] A non-technical learner can identify the model type, likely use, and next step without reading raw metadata.
- [✅] Technical facts remain visible for verification.

### ✅ 1.2 Add Confidence and Source Badges

- [✅] Show whether claims came from Hugging Face metadata.
- [✅] Show whether claims came from repository file names.
- [✅] Show whether claims came from model card text.
- [✅] Show whether claims came from local inference by the extension.
- [✅] Use clear visible badges such as "Known", "Likely", and "Unknown".
- [✅] Avoid making low-confidence estimates look definitive.

Acceptance criteria:

- [✅] Every major recommendation has visible reasoning.
- [✅] Inferred claims are clearly marked as inferred.

### ✅ 1.3 Improve Empty, Unsupported, and Error States

- [✅] Add specific messages for non-Hugging Face pages.
- [✅] Add specific messages for Hugging Face pages that are not model pages.
- [✅] Add specific messages for gated or private models.
- [✅] Add specific messages for missing model cards.
- [✅] Add specific messages for missing files.
- [✅] Add specific messages for rate limits.
- [✅] Add specific messages for network failure.
- [✅] Provide learner-friendly next steps for each state.

Acceptance criteria:

- [✅] The user is never left with a generic failure message.
- [✅] Each error state explains whether the problem is page type, access, metadata, or connectivity.

## Phase 2: Model Understanding

### ✅ 2.1 Expand Model Type Detection

- [✅] Improve detection for chat models.
- [✅] Improve detection for instruct models.
- [✅] Improve detection for base models.
- [✅] Improve detection for code models.
- [✅] Improve detection for embedding models.
- [✅] Improve detection for image generation models.
- [✅] Improve detection for audio models.
- [✅] Improve detection for multimodal models.
- [✅] Improve detection for rerankers and classifiers.
- [✅] Use Hugging Face `pipeline_tag`, tags, library name, config, model card clues, and file structure.

Acceptance criteria:

- [✅] Common model families are classified correctly in test fixtures.
- [✅] Ambiguous pages return "unknown" or "unclear" instead of a false confident answer.

### ⚠️ 2.2 Explain Common Hugging Face Concepts

- [✅] Explain model card.
- [✅] Explain dataset.
- [✅] Explain Space.
- [✅] Explain collection.
- [✅] Explain GGUF.
- [✅] Explain safetensors.
- [✅] Explain quantisation.
- [✅] Explain tokenizer.
- [❌] Explain chat template.
- [✅] Explain context length.
- [✅] Explain parameters.
- [✅] Explain `3B`, `7B`, and similar billion-parameter size labels.
- [✅] Explain gated model.
- [✅] Explain licence.
- [✅] Explain commercial use.
- [❌] Explain evaluation benchmark.
- [✅] Explain fine-tuning.
- [⚠️] Show only relevant terms for the current model page.
- [✅] Add a prominent local Ask a Question helper for beginner questions about terms, model names, files, licence, tools, popularity, and hardware fit.

Acceptance criteria:

- [⚠️] Glossary entries are short, accurate, and beginner readable.
- [⚠️] The UI avoids overwhelming the learner with unrelated terms.

### ✅ 2.3 Teach Navigation From Non-Model Hugging Face Pages

- [✅] Explain why Hugging Face directory, dataset, Space, collection, docs, or settings pages are not model pages.
- [✅] Tell the learner that the extension needs an individual `owner/model` repository.
- [✅] Provide direct links to Hugging Face Models, text-generation models, and GGUF local models.
- [✅] Explain what a supported model URL looks like.
- [✅] Make the supported model example URL full and clickable in the top unsupported-page guidance.

Acceptance criteria:

- [✅] Unsupported Hugging Face pages do not stop at a generic error.
- [✅] The learner gets a clear next navigation step.

### ⚠️ 2.4 Improve Model Match Search Interface

- [✅] Convert model match guidance into form controls for goal, target size, file format, quantisation, route, priority, search phrase, local-only preference, and licence preference.
- [✅] Add tooltip-capable labels for search controls where terms need explanation.
- [✅] Recommend a live Hugging Face starting candidate from the selected filters.
- [✅] Justify the candidate using current search filters, format clues, quantisation clues, licence tags, and saved hardware guidance.
- [✅] Add ranking controls for downloads, likes, and balanced popularity.
- [✅] Keep a compact glossary table visible for Model Match terms before a model page is loaded.
- [✅] Make the top current-page/model summary more practical and collapse the generic plain-English read by default.
- [✅] Make active-tab checking automatic and keep a manual "Recheck" action for retrying the current browser tab.
- [✅] Add an inline saved hardware profile editor for Model Match.
- [✅] Bold only the saved hardware profile in the Model Match summary, not the whole recommendation sentence.
- [✅] Fix Model Match ranking so Downloads and Likes select the top eligible live search result for that metric, and select changes trigger a fresh search.
- [✅] Add movable Model Match fields so higher fields take priority when ranking candidate models.
- [✅] Show the full clickable Hugging Face URL for the suggested starting candidate.
- [✅] Replace ranking-process candidate prose with a plain-English summary plus a compact "why suggested" note.
- [✅] Format the starting-candidate summary as scannable points inside a styled scroll area.
- [⚠️] Keep model recommendations conservative and label them as starting candidates, not guaranteed best models.
- [❌] Add richer comparison between multiple candidate models.
- [✅] Fetch the suggested candidate's full Hugging Face metadata and model card for a richer page-aware summary.
- [✅] Persist editable hardware settings in Chrome storage.

### ✅ 2.5 Parse Model Card Content Safely

- [✅] Extract intended use from README/model card markdown.
- [✅] Extract limitations from README/model card markdown.
- [✅] Extract licence notes from README/model card markdown.
- [✅] Extract hardware or inference examples from README/model card markdown.
- [✅] Extract training data notes from README/model card markdown.
- [✅] Extract safety warnings from README/model card markdown.
- [✅] Keep extraction conservative and source-aware.
- [✅] Avoid hallucinating missing details.

Acceptance criteria:

- [✅] Model card statements are summarized only when present.
- [✅] Missing sections are reported as missing, not guessed.

## Phase 3: Running Guidance

### ⚠️ 3.1 Improve File Relevance Ranking

- [⚠️] Group model weights.
- [⚠️] Group quantised local files.
- [⚠️] Group tokenizer files.
- [⚠️] Group config files.
- [❌] Group adapter files.
- [❌] Group example or metadata files.
- [⚠️] Highlight the files a beginner most likely needs.
- [❌] Hide noise by default while allowing expansion.

Acceptance criteria:

- [⚠️] A learner can identify whether a repository has a runnable file and which file likely matters.
- [⚠️] GGUF, safetensors, PyTorch, ONNX, and MLX files are explained distinctly.
- [❌] LoRA and adapter files are explained distinctly.

### ⚠️ 3.2 Strengthen Tool Recommendations

- [⚠️] Recommend LM Studio for beginner-friendly GGUF chat/instruct models.
- [⚠️] Recommend Ollama only when a reliable Ollama route is known or can be explained safely.
- [⚠️] Recommend Python Transformers for Transformers-compatible repositories.
- [⚠️] Recommend MLX for Apple MLX repositories.
- [⚠️] Recommend ONNX Runtime for ONNX models.
- [⚠️] Recommend specialist workflows for embeddings, classifiers, image, audio, or multimodal models.
- [⚠️] Explain why a tool is not recommended when appropriate.

Acceptance criteria:

- [⚠️] Recommendations never imply that every Hugging Face page can be run in LM Studio or Ollama.
- [⚠️] Recommendations include caveats for base, gated, specialist, and oversized models.

### ❌ 3.3 Add Safe Copyable Commands

- [❌] Add commands only when the extension has enough verified information.
- [❌] Add Python Transformers command examples.
- [❌] Add llama.cpp command examples.
- [❌] Add Ollama Modelfile examples, if supported later.
- [❌] Label commands as examples, not guaranteed universal instructions.

Acceptance criteria:

- [❌] Commands are not shown for unsupported or ambiguous models.
- [❌] Commands do not require secrets or tokens in the UI.

## Phase 4: Hardware Fit

### ⚠️ 4.1 Make Hardware Profile Editable

- [✅] Add operating system setting.
- [✅] Add system RAM setting.
- [❌] Add GPU name setting.
- [✅] Add GPU VRAM setting.
- [✅] Add preferred tools setting.
- [✅] Add beginner comfort level setting.
- [✅] Store settings in Chrome storage instead of only the static JSON file.
- [✅] Provide sensible defaults when hardware is unknown.

Acceptance criteria:

- [✅] A learner can adjust hardware without editing project files.
- [✅] Estimates update after profile changes.

### ⚠️ 4.2 Improve Memory Estimation

- [✅] Estimate memory from parameter count.
- [✅] Estimate memory from detected precision or quantisation.
- [❌] Estimate memory from file size when available.
- [⚠️] Estimate memory from context length.
- [⚠️] Include likely runtime overhead.
- [✅] Explain the limits of the estimate.
- [✅] Show "unknown" when required inputs are unavailable.

Acceptance criteria:

- [⚠️] Estimates remain cautious and explain assumptions.
- [❌] File-size-based estimates are used when parameter count is missing but model files have useful size metadata.

### ❌ 4.3 Add Hardware Fit Test Cases

- [❌] Test CPU-only laptop.
- [❌] Test 8 GB VRAM GPU.
- [❌] Test 12 GB VRAM GPU.
- [❌] Test 16 GB VRAM GPU.
- [❌] Test 24 GB VRAM GPU.
- [❌] Test Apple silicon shared-memory machine.
- [❌] Test small embedding model.
- [❌] Test 7B Q4 GGUF chat model.
- [❌] Test 13B Q4 GGUF model.
- [❌] Test 70B quantised model.
- [❌] Test FP16 safetensors model.

Acceptance criteria:

- [❌] Fit labels are consistent and conservative across fixtures.
- [❌] Edge cases do not produce impossible memory claims.

## Phase 5: Safety, Licence, and Trust

### ⚠️ 5.1 Improve Licence Explanation

- [✅] Show detected licence identifier.
- [❌] Link or refer the user to the original model page for actual terms.
- [⚠️] Explain when licence metadata is missing.
- [⚠️] Warn that commercial use depends on the actual licence text.

Acceptance criteria:

- [⚠️] The extension does not provide legal advice.
- [❌] The learner is prompted to verify licence terms before serious use.

### ❌ 5.2 Add Safety and Suitability Signals

- [❌] Highlight model card safety notes when present.
- [❌] Detect likely medical model risk.
- [❌] Detect likely legal model risk.
- [❌] Detect likely financial model risk.
- [❌] Detect likely code execution risk.
- [❌] Detect likely security model risk.
- [❌] Detect likely NSFW or adult content risk.
- [❌] Use cautious, non-alarmist wording.

Acceptance criteria:

- [❌] Safety notes are source-grounded.
- [❌] Missing safety information is clearly distinguished from "safe".

### ⚠️ 5.3 Add Privacy Notes

- [⚠️] Document what the extension sends over the network.
- [⚠️] Confirm that V1 does not include analytics.
- [❌] Explain optional local Ollama usage if implemented.

Acceptance criteria:

- [⚠️] README and side panel privacy text match actual behavior.
- [⚠️] No hidden network destinations are introduced.

## Phase 6: Quality and Testing

### ❌ 6.1 Add Automated Unit Tests

- [❌] Test URL parsing.
- [❌] Test Hugging Face API normalization.
- [❌] Test model fact parsing.
- [❌] Test quantisation detection.
- [❌] Test hardware estimation.
- [❌] Test tool recommendation.
- [❌] Test explanation text generation.
- [❌] Use static fixtures for known Hugging Face API responses.

Acceptance criteria:

- [❌] Tests can run locally with one command.
- [❌] Parser and recommendation regressions are caught before manual extension testing.

### ❌ 6.2 Add Manual Browser Test Checklist

- [❌] Document installing unpacked extension.
- [❌] Test supported model pages.
- [❌] Test unsupported Hugging Face pages.
- [❌] Test non-Hugging Face pages.
- [❌] Test refresh button behavior.
- [❌] Test side panel behavior after tab changes.
- [❌] Test gated/private model behavior.

Acceptance criteria:

- [❌] A contributor can manually verify V1 without guessing expected behavior.

### ❌ 6.3 Add Fixture Model List

- [❌] Add GGUF chat model.
- [❌] Add Transformers text model.
- [❌] Add embedding model.
- [❌] Add image model.
- [❌] Add gated model.
- [❌] Add missing or sparse metadata model.
- [❌] Add large model that should not fit local defaults.

Acceptance criteria:

- [❌] The project has stable examples for validating learner-facing output.

## Phase 7: Documentation

### ⚠️ 7.1 Expand README

- [❌] Add installation instructions for Chrome unpacked extension.
- [❌] Add supported page types.
- [❌] Add current limitations.
- [⚠️] Add privacy behavior.
- [❌] Add development commands.
- [❌] Add testing instructions.

Acceptance criteria:

- [❌] A new user can install and try the extension from the README alone.
- [❌] A developer can run tests and understand the project layout.

### ❌ 7.2 Add Contributor Notes

- [❌] Document content script.
- [❌] Document background service worker.
- [❌] Document side panel.
- [❌] Document Hugging Face API service.
- [❌] Document parser.
- [❌] Document hardware estimator.
- [❌] Document recommendation engine.
- [❌] Document explanation service.
- [❌] Document the rule that learner-facing text must separate facts, estimates, and unknowns.

Acceptance criteria:

- [❌] Future changes can follow the same trust model.

## Phase 8: V1 Release Checklist

- [⚠️] The side panel works on public Hugging Face model pages.
- [⚠️] Unsupported pages explain what to do next.
- [✅] The extension fetches public metadata and model cards only.
- [❌] The learner sees a plain-English answer before raw facts.
- [⚠️] Model type, size, runnable files, hardware fit, recommended route, licence, and warnings are shown.
- [⚠️] Low-confidence claims are marked.
- [⚠️] Missing information is not guessed.
- [❌] Manual browser testing has been completed.
- [❌] Automated parser and recommendation tests pass.
- [❌] README documents installation, usage, privacy, and limitations.

## Later Ideas

- [❌] Optional local Ollama explanation service for richer summaries.
- [❌] Optional model comparison between two Hugging Face pages.
- [❌] Optional "find a better beginner version" flow for GGUF alternatives.
- [❌] Optional export/share summary.
- [❌] Optional support for Hugging Face datasets and Spaces.
- [❌] Optional browser action badge showing supported or unsupported page state.
