# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is the **pi monorepo** - a collection of packages for building AI agents and managing LLM deployments. The flagship product is `pi`, an interactive coding agent CLI with read, bash, edit, and write tools.

## Packages

| Package | Description |
|---------|-------------|
| `packages/ai` | Unified multi-provider LLM API (OpenAI, Anthropic, Google, AWS Bedrock, etc.) |
| `packages/agent` | Agent runtime with tool calling and state management |
| `packages/coding-agent` | Interactive coding agent CLI (the main product) |
| `packages/tui` | Terminal UI library with differential rendering |
| `packages/web-ui` | Web components for AI chat interfaces |
| `packages/mom` | Slack bot delegating messages to the coding agent |
| `packages/pods` | CLI for managing vLLM deployments on GPU pods |

## Common Commands

```bash
npm install          # Install all dependencies
npm run build        # Build all packages (order: tui → ai → agent → coding-agent → mom → web-ui → pods)
npm run check        # Lint (Biome), type check (tsgo), browser smoke test, web-ui check
./test.sh            # Run tests without API keys (skips LLM-dependent tests)
./pi-test.sh         # Run pi coding agent from sources
```

### Running Single Tests

```bash
# From the package root directory
npx tsx ../../node_modules/vitest/dist/cli.js --run test/specific.test.ts

# Example: run a specific AI package test
cd packages/ai && npx tsx ../../node_modules/vitest/dist/cli.js --run test/stream.test.ts
```

### Building Individual Packages

```bash
cd packages/<package> && npm run build
```

## Architecture

### Dependency Chain
```
coding-agent → agent → ai → tui
                   ↓
                  mom
web-ui → ai
pods (standalone)
```

### Key Source Locations

- **LLM API layer**: `packages/ai/src/` - Provider implementations in `providers/`, core streaming in `stream.ts`
- **Agent runtime**: `packages/agent/src/` - Agent loop, tool calling, state management
- **Coding agent**: `packages/coding-agent/src/` - CLI entry, interactive mode, tools
- **TUI library**: `packages/tui/` - Differential rendering terminal UI components

### Provider System (packages/ai)

Providers are registered in `packages/ai/src/providers/register-builtins.ts` via lazy loaders. Each provider has:
- Streaming implementation (`stream<Provider>()`)
- Simple stream variant (`streamSimple<Provider>()`)
- Message/tool conversion functions
- Response parsing for standardized events (`text`, `tool_call`, `thinking`, `usage`, `stop`)

## Tooling

- **Package manager**: pnpm (workspace)
- **TypeScript build**: `tsgo` (tsx-based)
- **Linting/Formatting**: Biome (`biome.json` at root)
- **Testing**: Vitest with 30s timeout per test
- **Git hooks**: Husky (runs `npm run check` on commit)

## Versioning

**Lockstep versioning** - all packages share the same version. Releases use `npm run release:patch` or `npm run release:minor` from the root.

## Key Files

- `AGENTS.md` - Development rules for both humans and agents
- `CONTRIBUTING.md` - Contribution guidelines and quality bar
- `packages/ai/src/models.generated.ts` - Auto-generated model list

## Coding Rules (from AGENTS.md)

- No `any` types unless absolutely necessary
- No inline imports - always use standard top-level imports
- Never remove functionality without explicit user approval
- All keybindings must be configurable (no hardcoded shortcuts)
- Run `npm run check` after code changes (not documentation)
- Never run `npm run dev`, `npm run build`, or `npm test` directly
