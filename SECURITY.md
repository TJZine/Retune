# Security Policy

## Supported Versions

| Version | Supported          |
|---------|--------------------|
| 1.x.x   | ✅ Yes             |
| < 1.0.0 | ❌ No (pre-release) |

---

## Reporting a Vulnerability

**Please do not open public issues for security vulnerabilities.**

We take security seriously. If you discover a vulnerability, please report it responsibly.

### How to Report

1. **GitHub Security Advisories** (Preferred)
   - Go to the [Security tab](https://github.com/TJZine/Retune/security/advisories) of this repository
   - Click "Report a vulnerability"
   - Fill out the form with details

2. **Direct Contact** (If GitHub Advisories unavailable)
   - Open a private discussion or DM the maintainer [@TJZine](https://github.com/TJZine)
   - Expected response time: Within 48 hours

### What to Include

| Field | Description |
|-------|-------------|
| **Summary** | Brief description of the vulnerability |
| **Severity** | Your assessment (Critical/High/Medium/Low) |
| **Steps to Reproduce** | How to trigger the vulnerability |
| **Impact** | What could an attacker do? |
| **Affected Versions** | Which versions are impacted |
| **Suggested Fix** | Optional—if you have a proposed solution |

### What to Expect

| Timeline | Action |
|----------|--------|
| 48 hours | Acknowledgment of your report |
| 7 days | Initial assessment and status update |
| 30 days | Target resolution for confirmed issues |
| Release | Credit in release notes (unless you prefer anonymity) |

---

## Scope

### In Scope

The following are considered security issues for Retune:

- 🔐 **Authentication issues** — Token leakage, bypass, or improper validation
- 🔑 **Authorization issues** — Unauthorized access to data or functions
- 💉 **Injection vulnerabilities** — XSS, command injection, etc.
- 📡 **Data exposure** — Sensitive data in logs, storage, or transit
- 🌐 **Network security** — Insecure connections, MITM vulnerabilities

### Out of Scope

Please report these to the appropriate parties:

| Issue | Report To |
|-------|-----------|
| Plex Media Server vulnerabilities | [Plex Security](https://www.plex.tv/about/privacy-legal/) |
| webOS platform vulnerabilities | [LG Security](https://www.lg.com/global/support/security) |
| Dependencies with known CVEs | Open a regular issue (we'll triage) |

---

## Security Best Practices for Users

### Protect Your Plex Token

- ⚠️ **Never share** your Plex token publicly
- 🔄 **Rotate tokens** periodically via Plex account settings
- 📱 **Review authorized devices** at [plex.tv/devices](https://plex.tv/devices)

### Network Security

- 🔒 Use **HTTPS** connections when possible
- 🏠 Keep Plex server on a **trusted network**
- 🛡️ Consider using Plex's **relay** for remote access instead of port forwarding

### Keep Updated

- 📦 Update Retune when new versions are released
- 🖥️ Keep your LG TV firmware updated
- 🎬 Keep Plex Media Server updated

---

## Security Features in Retune

| Feature | Description |
|---------|-------------|
| **OAuth PIN Flow** | No password entry on TV—authenticate via separate device |
| **Token Storage** | Tokens stored locally on TV only (localStorage) |
| **No External Telemetry** | App does not phone home or collect usage data |
| **Server-Side Auth** | All media requests authenticated with Plex server |

---

## Hall of Fame

We appreciate security researchers who help keep Retune safe. Contributors will be acknowledged here (with permission).

*No reports yet—be the first!*
