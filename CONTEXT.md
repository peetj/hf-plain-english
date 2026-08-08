# Project Context

## Product

This project is a Chrome extension called **Hugging Face for Newbies**.

The goal is to help an AI Learner understand Hugging Face model pages in plain English. Assume the learner is new to AI, Hugging Face, model formats, quantisation, local hardware limits, and common tools.

Use concrete examples. Do not rely on terms like `owner/model`, `GGUF`, `Q4_K_M`, `VRAM`, or `pipeline_tag` without explaining them somewhere nearby or through the tooltip system.

## Default Workflow

Before doing project work:

- Read this file.
- Read `PLAN.md`.
- Check the current branch and working tree with `git status -sb`.

When work is complete:

- Run relevant checks.
- Commit the change.
- Push the branch.
- Report the branch, commit hash, and verification.

## Branch Rules

- Use `feedback` for general feedback items from `PLAN.md` or user comments.
- Use a dedicated branch for phase work, named after the phase, such as `phase2`, `phase3`, or `phase4`.
- Do not do phase work directly on `feedback`.
- Do not do feature work directly on `master`.

Before starting a new phase branch:

- Commit and push the current branch.
- Switch to `master`.
- Pull/update `master`.
- Merge the current completed branch into `master`.
- Push `master`.
- Create the new phase branch from updated `master`.

## PLAN.md Rules

`PLAN.md` is the shared working plan and feedback channel.

Use these statuses:

- `[✅]` Done.
- `[⚠️]` Started, partial, or needs review.
- `[❌]` Not started.
- `[👍]` User comment only; do not treat as a work item unless the user says so.

When completing a feedback item or phase item, update its status in `PLAN.md`.

If the user adds feedback, read `PLAN.md` before coding.

If the user (developer, that is Pete) asks you a direct question without putting it in feedback - and you implement it - make sure you update PLAN.md in the relavant phase branch with what you have done to make sure we capture everything.

## Commit Rhythm

- Commit and push after each meaningful unit of work.
- For phase work, commit and push each phase or subphase.
- Keep commit messages short and descriptive.

## Product Writing Rules

Write for beginners.

- Prefer plain language over technical shorthand.
- Include examples when explaining navigation or Hugging Face naming.
- Avoid nerd-only phrasing such as "owner/model identifier" unless also explained in plain English.
- Say "starting candidate" instead of "best model" unless the app has enough evidence to justify a stronger claim.
- Be conservative about local hardware fit and tool recommendations.

## UI Rules

- Make primary learner tasks visible near the top.
- Use controls for user choices instead of static text when the learner is configuring something.
- Add tooltips for terms that may be unfamiliar.
- Keep unsupported-page states helpful: explain what happened, where to go next, and show an example URL.

## Verification

Use the checks that fit the change. Common checks:

- `node --check sidepanel\sidepanel.js`
- `node --check background.js`
- `node --check content.js`
- `node --check services\<changed-service>.js`
- JSON parse checks for `manifest.json` and files in `data/`
- Live Hugging Face checks only when search/API behavior is changed.

If a check cannot be run, say so in the final response.
