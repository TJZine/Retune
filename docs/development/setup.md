# Development Environment Setup

This project requires a specific setup to develop for LG webOS.

> [!TIP]
> This is a summary. For the comprehensive guide, please see **[dev-workflow.md](../../dev-workflow.md)**.

## Prerequisites

- **Node.js**: v18+
- **Package Manager**: npm v9+
- **LG webOS TV SDK**: Latest version (CLI tools)
- **VirtualBox 6.x**: Required for the Emulator

## Quick Setup

```bash
# 1. Clone the repository
git clone https://github.com/TJZine/Retune.git

# 2. Install dependencies
npm install

# 3. Verify build
npm run build
```

## Running Locally (Browser)

Most logic can be tested in a standard browser.

```bash
npm run dev
```

Navigate to `http://localhost:5173`. Use **Arrow Keys** to simulate the remote.

## Running on Emulator

1. Start the webOS Emulator.
2. Build and install:

   ```bash
   npm run build
   ares-package dist/
   ares-install --device emulator com.retune.app_1.0.0_all.ipk
   ares-launch --device emulator com.retune.app
   ```
