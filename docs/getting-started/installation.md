# Installation Guide

This guide covers the installation of Retune on your LG Smart TV.

> [!NOTE]
> Currently, Retune requires "Developer Mode" installation. We are working on publishing to the official LG Content Store.

## Prerequisites

- **PC or Mac** with internet access
- **LG Smart TV** (2021+ / webOS 6.0+) connected to the same network
- **LG Developer Account** (Free, create at [webostv.developer.lge.com](https://webostv.developer.lge.com))

## Step 1: Install Developer Mode App on TV

1. Turn on your LG TV.
2. Open the **LG Content Store**.
3. Search for **"Developer Mode"**.
4. Install the application.

## Step 2: Enable Developer Mode

1. Open the **Developer Mode** app on your TV.
2. Log in with your LG Developer Account credentials.
3. Toggle **Dev Mode Status** to **ON**.
4. Your TV will restart.

## Step 3: Install Retune via PC

We recommend using the webOS TV CLI tools, but for easier installation, you can use the **webOS Dev Manager** desktop app.

### Option A: webOS Dev Manager (Recommended)

1. Download [webOS Dev Manager](https://github.com/webosbrew/webos-homebrew-channel/releases) for your OS.
2. Open the application.
3. Click **Add Device** and follow the prompts:
   - Enter the **Passphrase** shown in the TV's Developer Mode app.
   - Enter the **IP Address** shown in the TV's Developer Mode app.
4. Once connected, drag and drop the `com.retune.app_x.x.x_all.ipk` file (downloaded from Retune Releases) into the window.
5. Click **Install**.

### Option B: Command Line Interface (Advanced)

If you are a developer and have the webOS SDK installed:

```bash
# 1. Register your TV
ares-setup-device

# 2. Complete the interactive setup with your TV's IP
# (Select 'add', enter name, ip, etc.)

# 3. Install the application
ares-install --device my-tv com.retune.app_1.0.0_all.ipk
```

## Step 4: First Launch

1. Press the **Home** button on your remote.
2. Scroll to the end of your app list to find **Retune**.
3. Launch the app.

> [!TIP]
> **Developer Mode Expiration**: Developer Mode sessions last for 50 hours. To extend this, simply open the Developer Mode app on your TV and click "Extend Session" before it expires.

## Next Steps

Now that Retune is installed, let's get it set up!

👉 **[Proceed to Quick Start](quick-start.md)**
