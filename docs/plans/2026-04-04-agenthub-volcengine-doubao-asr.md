# AgentHub Volcengine Doubao ASR Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the existing desktop audio transcription path work correctly with Volcengine Doubao ASR instead of only looking configurable in `hub.json`.

**Architecture:** Keep the current `transcribe_audio_clip` command entrypoint and provider resolution flow in `src-tauri/src/commands/cli.rs`. Add a provider-specific audio upload format decision so Volcengine can require raw PCM while other OpenAI-compatible providers keep the existing MP3/WAV fallback path.

**Tech Stack:** Rust Tauri commands, `reqwest` multipart upload, `ffmpeg` audio transcoding, Rust unit tests, AgentHub `hub.json` provider/media config

### Task 1: Lock the current failure and desired Doubao behavior in tests

**Files:**
- Modify: `src-tauri/src/commands/cli.rs`
- Test: `src-tauri/src/commands/cli.rs`

**Step 1: Write the failing tests**

Add tests that expect:
- provider-level audio config is resolved through `resolve_transcription_target_from_hub_config`
- Volcengine uses a dedicated PCM upload format instead of the generic MP3 fallback
- non-Volcengine providers keep the existing MP3/WAV-friendly upload behavior

**Step 2: Run tests to verify they fail**

Run:

```bash
~/.cargo/bin/cargo test cli --manifest-path src-tauri/Cargo.toml
```

Expected: FAIL because the test module still references the removed helper and the command has no provider-specific upload format logic yet.

**Step 3: Write minimal implementation**

Implement:
- a small transcription upload format helper keyed by provider id
- Volcengine PCM content-type / extension selection
- a provider-aware audio preparation step used by `transcribe_audio_clip`

**Step 4: Run tests to verify they pass**

Run the same command.

Expected: PASS

**Step 5: Commit**

```bash
git add docs/plans/2026-04-04-agenthub-volcengine-doubao-asr.md src-tauri/src/commands/cli.rs
git commit -m "feat: support doubao pcm transcription uploads"
```

