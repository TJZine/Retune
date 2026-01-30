# Development Workflow

Quick reference for common development tasks. For the full multi-agent workflow, see [`docs/AGENTIC_DEV_WORKFLOW.md`](docs/AGENTIC_DEV_WORKFLOW.md).

---

## Quick Start

```bash
# Install dependencies
npm install

# Run development server (browser)
npm run dev

# Run all verification checks
npm run verify

# Build for webOS
npm run package:webos
```

## Verification Commands

| Command | Purpose |
|---------|---------|
| `npm run typecheck` | TypeScript type checking |
| `npm run lint` | ESLint code quality |
| `npm test` | Jest unit tests |
| `npm run build` | Production build |
| `npm run verify` | All checks combined |

> [!TIP]
> See [Development Setup](docs/development/setup.md) for environment configuration and [Testing Guide](docs/development/testing.md) for testing strategies.

## Deploying to TV

```bash
# 1. Build the application
npm run build

# 2. Package for webOS
ares-package dist/

# 3. Install to your TV
ares-install --device my-tv com.retune.app_1.0.0_all.ipk

# 4. Launch
ares-launch --device my-tv com.retune.app
```

> [!NOTE]
> Replace `my-tv` with your device name from `ares-setup-device`.

## Remote Debugging

```bash
# Open Chrome DevTools for your TV
ares-inspect --device my-tv --app com.retune.app --open
```

See [Debugging Guide](docs/development/debugging.md) for troubleshooting tips.
