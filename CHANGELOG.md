# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-02-20

### Added
- Initial release of @rezzed.ai/poll-hooks
- Priority-based task triage system with 5 priority levels (interrupt → sprint → parallel → queue → backlog)
- Claim semantics to prevent duplicate task processing across workers
- Full lifecycle hook system:
  - `onBoot` - Pre-flight checks and initialization
  - `onWork` - Process tasks and messages
  - `onIdle` - Handle idle state with automatic backoff
  - `onShutdown` - Graceful shutdown and cleanup
  - `onTaskStart` - Individual task execution
  - `onTaskComplete` - Task completion handling
  - `onError` - Error handling across all phases
- Exponential backoff for reduced polling frequency when idle
- Automatic message acknowledgement (ACK) protocol
- Pluggable task source interface for custom storage backends
- Zero runtime dependencies for lightweight deployment
- Full TypeScript support with complete type definitions
- Dual ESM and CommonJS module support
- `Poller` class with:
  - `start()` - Begin polling loop
  - `stop()` - Graceful shutdown
  - `poll()` - Single poll cycle
  - `triage()` - Priority-based task sorting
- Comprehensive test suite using Node.js built-in test runner

---

Built by [Rezzed.ai](https://rezzed.ai)
