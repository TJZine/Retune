# Contributing to Retune

Thank you for your interest in contributing to Retune! 🎉

Whether you're fixing bugs, adding features, improving documentation, or just asking questions, your contributions make this project better for everyone.

---

## Table of Contents

- [Ways to Contribute](#ways-to-contribute)
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Code Style](#code-style)
- [Submitting Changes](#submitting-changes)
- [Issue Guidelines](#issue-guidelines)
- [Code of Conduct](#code-of-conduct)

---

## Ways to Contribute

| Type | Description |
|------|-------------|
| 🐛 **Bug Reports** | Found something broken? [Open an issue](../../issues/new?template=bug_report.md) |
| 💡 **Feature Requests** | Have an idea? [Suggest a feature](../../issues/new?template=feature_request.md) |
| 📝 **Documentation** | Improve guides, fix typos, add examples |
| 🛠️ **Code** | Fix bugs, implement features, refactor |
| 🧪 **Testing** | Add test coverage, report edge cases |
| 🌍 **Translations** | Help localize the app (future) |

---

## Getting Started

### Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| Node.js | 18+ | JavaScript runtime |
| npm | 9+ | Package manager |
| webOS TV SDK | Latest | TV emulator & deployment tools |
| Git | 2.x | Version control |

### Setup

```bash
# 1. Fork the repository on GitHub

# 2. Clone your fork
git clone https://github.com/YOUR_USERNAME/Retune.git
cd Retune

# 3. Add upstream remote
git remote add upstream https://github.com/TJZine/Retune.git

# 4. Install dependencies
npm install

# 5. Verify everything works
npm run build
npm test
npm run lint
```

> [!TIP]
> See [dev-workflow.md](dev-workflow.md) for detailed setup instructions, including webOS SDK installation.

---

## Development Workflow

### Branch Naming

Use descriptive branch names with prefixes:

| Prefix | Use Case | Example |
|--------|----------|---------|
| `feat/` | New features | `feat/channel-import` |
| `fix/` | Bug fixes | `fix/epg-scroll-crash` |
| `docs/` | Documentation | `docs/installation-guide` |
| `refactor/` | Code refactoring | `refactor/player-module` |
| `test/` | Test additions | `test/scheduler-edge-cases` |
| `chore/` | Maintenance | `chore/update-dependencies` |

### Making Changes

```bash
# 1. Create a feature branch
git checkout -b feat/my-feature

# 2. Make your changes
# ... edit files ...

# 3. Run checks
npm run build      # TypeScript compilation
npm run lint       # ESLint
npm test           # Jest tests

# 4. Commit with conventional commits
git commit -m "feat: add channel import functionality"

# 5. Push to your fork
git push origin feat/my-feature

# 6. Open a Pull Request
```

### Commit Message Format

We use [Conventional Commits](https://www.conventionalcommits.org/):

```text
<type>(<scope>): <description>

[optional body]

[optional footer]
```

**Types**:

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style (formatting, semicolons, etc.)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

**Examples**:

```text
feat(epg): add 24-hour time format option
fix(player): resolve audio desync after pause
docs: update installation instructions for webOS 7
refactor(scheduler): extract time calculation logic
```

---

## Code Style

### TypeScript Guidelines

- ✅ Use TypeScript strict mode
- ✅ Prefer explicit types over `any`
- ✅ Use interfaces for object shapes
- ✅ Document public APIs with JSDoc comments
- ❌ Avoid `@ts-ignore` unless absolutely necessary (document why)

### ESLint

We use ESLint 9 with a flat config. Run before committing:

```bash
# Check for issues
npm run lint

# Auto-fix issues
npm run lint:fix
```

### Testing

- Write tests for new functionality
- Maintain or improve code coverage
- Use descriptive test names

```typescript
// ✅ Good
describe('ChannelScheduler', () => {
  it('should calculate correct program position for mid-stream tune-in', () => {
    // ...
  });
});

// ❌ Avoid
describe('ChannelScheduler', () => {
  it('works', () => {
    // ...
  });
});
```

### Project Structure

```text
src/
├── modules/           # Feature modules
│   ├── lifecycle/     # App lifecycle management
│   ├── navigation/    # D-pad and remote handling
│   ├── player/        # Video playback
│   ├── plex/          # Plex API integration
│   ├── scheduler/     # Channel scheduling
│   └── ui/            # User interface components
├── utils/             # Shared utilities
├── App.ts             # Application shell
├── Orchestrator.ts    # Central state coordinator
└── index.ts           # Entry point

docs/                  # Documentation
spec-pack/             # Module specifications
```

---

## Submitting Changes

### Pull Request Process

1. **Ensure all checks pass**

   ```bash
   npm run build && npm run lint && npm test
   ```

2. **Update documentation** if you changed any APIs or user-facing behavior

3. **Fill out the PR template** completely

4. **Request review** from maintainers

5. **Address feedback** promptly

### PR Checklist

Before submitting, verify:

- [ ] Code compiles without errors (`npm run build`)
- [ ] All tests pass (`npm test`)
- [ ] Linting passes (`npm run lint`)
- [ ] New code has tests (where applicable)
- [ ] Documentation updated (where applicable)
- [ ] Commit messages follow conventional format
- [ ] PR description explains the change

### Review Process

- PRs require at least one approving review
- CI checks must pass
- Maintainers may request changes
- Once approved, maintainers will merge

> [!IMPORTANT]
> Please be patient during review. Maintainers are volunteers and may take a few days to respond.

---

## Issue Guidelines

### Bug Reports

A good bug report includes:

| Field | Description |
|-------|-------------|
| **Environment** | webOS version, TV model, app version |
| **Steps to Reproduce** | Numbered list of actions |
| **Expected Behavior** | What should happen |
| **Actual Behavior** | What actually happens |
| **Logs/Screenshots** | Console output, error messages |

<details>
<summary>Bug Report Template</summary>

```markdown
**Environment**
- webOS Version: 6.x
- TV Model: LG C1
- App Version: 1.0.0

**Steps to Reproduce**
1. Open the EPG
2. Navigate to channel 5
3. Press OK to tune
4. Wait 30 seconds

**Expected Behavior**
Playback should start within 3 seconds.

**Actual Behavior**
App freezes for 10 seconds, then shows black screen.

**Console Logs**
```text
[Player] Error: MEDIA_NOT_SUPPORTED
```

</details>

### Feature Requests

A good feature request includes:

- **Problem**: What pain point are you addressing?
- **Solution**: Your proposed solution
- **Alternatives**: Other approaches you considered
- **Context**: Any additional information or mockups

---

## Code of Conduct

Please read and follow our [Code of Conduct](CODE_OF_CONDUCT.md).

**TL;DR**: Be respectful, be inclusive, focus on the project.

---

## Questions?

> [!TIP]
> For general questions and discussions, **GitHub Discussions is the best place to start**. Save issues for confirmed bugs and well-defined feature requests.

- 💬 [GitHub Discussions](../../discussions) for questions and ideas
- 🐛 [Issue Tracker](../../issues) for bugs and features
- 📧 For sensitive matters, contact maintainers directly

---

Thank you for contributing to Retune! 🙏
