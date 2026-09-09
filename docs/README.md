# Git-Mind Documentation

Start at the [project README](../README.md) for the overview and quickstart.
Everything below is reference material that used to live inside that README.

## Reference

| Doc | Covers |
| --- | ------ |
| [architecture.md](architecture.md) | System overview, the 9-agent pipeline, storage & auth, Rust native acceleration |
| [configuration.md](configuration.md) | All 30 environment variables |
| [api-reference.md](api-reference.md) | All 25 HTTP and WebSocket endpoints |
| [rag-pipeline.md](rag-pipeline.md) | Retrieval stages, chunking, LLM output reliability |
| [operations.md](operations.md) | Persistence, rate limiting, security, telemetry |
| [development.md](development.md) | CI/CD, running the test suites, deployment |
| [PHASE-0-DISTRIBUTED-PRIMITIVES.md](PHASE-0-DISTRIBUTED-PRIMITIVES.md) | Running more than one backend worker |

## Guides

- [github-oauth/](github-oauth/) — tutorial, how-to, reference and explanation for
  the "Sign in with GitHub" flow.

## Decisions and history

- [adr/](adr/) — architecture decision records.
- [specs/](specs/) — design specs and their work tickets.
- [retro/](retro/) — session retrospectives.
- [superpowers/](superpowers/) — historical plans and specs. Kept as record; not
  maintained.

## Conventions

- [agents/](agents/) — how agents working in this repo handle issues, triage
  labels, and domain vocabulary. The glossary itself is
  [`CONTEXT.md`](../CONTEXT.md) at the repo root, where the domain-modeling
  convention expects to find it.

## Not documentation

- [screenshots/](screenshots/) — local UI captures, deliberately untracked.
