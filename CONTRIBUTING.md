# Contributing to @rezzed.ai/poll-hooks

Thank you for your interest in contributing to poll-hooks! We welcome contributions that improve the polling engine, lifecycle management, and documentation.

## Getting Started

### Prerequisites

- Node.js 18.x or higher
- npm 8.x or higher

### Setup

1. Clone the repository:
```bash
git clone https://github.com/rezzedai/poll-hooks.git
cd poll-hooks
```

2. Install dependencies:
```bash
npm install
```

3. Run tests to verify your setup:
```bash
npm test
```

4. Build the project:
```bash
npm run build
```

## Development Workflow

### Branch Naming

Use conventional branch prefixes:
- `feat/` - New features
- `fix/` - Bug fixes
- `docs/` - Documentation updates
- `chore/` - Maintenance tasks

Example: `feat/custom-backoff` or `fix/claim-race-condition`

### Commit Style

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add custom backoff strategies
fix: prevent race condition in claim semantics
docs: update lifecycle hook examples
chore: upgrade TypeScript to 5.x
```

### Testing

Run the test suite before submitting your changes:

```bash
npm test
```

The project uses Node's built-in test runner (`node --test`). Add tests for new features and ensure all tests pass.

### Building

The project uses a dual ESM+CJS build system with TypeScript:

```bash
npm run build
```

This generates:
- `dist/esm/` - ES modules
- `dist/cjs/` - CommonJS modules
- Type definitions for both

## Pull Request Process

1. Create a feature branch from `master`
2. Make your changes with clear, conventional commits
3. Ensure all tests pass (`npm test`)
4. Run the build to verify no type errors (`npm run build`)
5. Push your branch and open a pull request
6. One approval is required before merging
7. Address any review feedback promptly

### PR Checklist

- [ ] Tests pass
- [ ] Code follows TypeScript best practices
- [ ] New features include tests
- [ ] Documentation is updated if needed
- [ ] Commits follow conventional format
- [ ] Lifecycle phase transitions are correct

## Code Style

- TypeScript with strict mode enabled
- ESM-first, CJS-compatible
- Zero runtime dependencies
- Prefer async/await over callbacks
- Use meaningful variable names
- Keep lifecycle hooks simple and focused

## Testing Considerations

When testing polling behavior:

- Use small intervals for faster tests
- Test both sync and async hook implementations
- Verify proper backoff behavior
- Test error handling in all lifecycle phases
- Ensure claim semantics prevent double-processing
- Validate ACK protocol for messages

## Questions?

Open an issue for discussion before starting work on major changes.

---

Built by [Rezzed.ai](https://rezzed.ai)
