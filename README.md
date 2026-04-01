# AgentHub

AgentHub is a local-first desktop console for managing and working with multiple AI agents.

It combines:

- a `Work` surface for chat, task threads, and agent handoff
- a `Config` surface for models, memory, skills, MCP, secrets, CLI runtimes, and agent instances
- a Tauri backend that bridges local runtimes such as OpenClaw, Claude-based agents, Codex, and other CLI tools

This repository is currently in active product iteration. The chat, memory, runtime abstraction, and first-pass generative UI path are already usable; some surrounding modules are still being filled in.

## Current Highlights

- Multi-agent chat threads with a `primary agent` per thread
- Runtime abstraction layer for different agent backends
- Streaming chat support on the Claude-based `dolphin` runtime
- Automatic conversation archival to a Memos-compatible memory backend
- CodePilot-style generative UI via `show-widget`
- Config pages for models, MCP servers, skills, secrets, memory, remote hosts, and CLI market
- Local desktop app built with `React + Vite + Tauri`

## Tech Stack

- Frontend: `React 18`, `TypeScript`, `Vite`, `Tailwind`
- Desktop shell: `Tauri v2`
- Backend: `Rust`
- State: `Zustand`
- Claude runtime integration: `@anthropic-ai/claude-agent-sdk`

## Repository Structure

```text
src/                     React app
  components/            UI building blocks
  lib/                   runtime, chat parsing, shared types
  pages/                 Work and Config screens
  stores/                Zustand stores

src-tauri/               Tauri backend
  src/commands/          Rust command handlers
  scripts/               runtime bridge scripts
```

## Run Locally

### Prerequisites

- Node.js 20+
- Rust toolchain
- Tauri prerequisites for macOS

### Install

```bash
npm install
```

### Start desktop dev mode

```bash
npm run tauri dev
```

### Type-check the frontend

```bash
npx tsc --noEmit
```

### Check the Tauri backend

```bash
cd src-tauri
cargo check
```

## Product Model

### Work

The `Work` side is the main operating surface:

- `Chat`: thread-based conversation with a selected agent
- `Tasks`: thread task board view

The current thread has a `primary agent`. Switching the active agent in chat also updates the thread owner.

### Config

The `Config` side manages the environment around those agents:

- dashboard
- models
- CLI market
- MCP servers
- skills
- secrets
- memory
- collaboration
- remote hosts
- agent instance settings

## Memory

AgentHub currently treats memory as an external middleware concern.

- Every chat turn is automatically written to the configured Memos-compatible provider.
- AgentHub itself does not try to be the long-term memory intelligence layer.
- The `Memory` page is used to connect and inspect the provider.

## Generative UI

The current generative UI path is modeled after CodePilot:

- the model decides whether UI is useful
- it can emit fenced `show-widget` blocks
- the frontend parses those blocks and renders them inside a sandboxed iframe

At the moment, this path is only fully enabled on the `dolphin` runtime.

## Current Limitations

These areas are still incomplete:

- `Work > Messages` is still a placeholder
- `Work > Cron` is still a placeholder
- `Remote Hosts` is closer to discovery/scanning than full remote control
- `CLI Market` is still a curated built-in registry, not a full community marketplace
- Generative UI is not yet rolled out across all runtimes

## Notes

- This project is local-first.
- Some configuration and runtime state is stored under `~/.agenthub/`.
- The current development branch includes active experiments around runtime adapters, memory orchestration, and Claude-driven UI rendering.
