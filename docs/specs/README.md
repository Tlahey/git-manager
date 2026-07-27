# Specs

Living specifications: behaviour that is **subtle, invariant-shaped and easy to break by
accident** — the kind of thing where a reasonable-looking change silently reintroduces an old bug.
They document the code as it is, and are updated with it.

They are not a catalogue of features (see [ROADMAP](../ROADMAP.md) for that) and not a substitute
for [CLAUDE.md](../../CLAUDE.md), which remains the authoritative description of the architecture.

| Spec                                            | Covers                                                                   |
| ----------------------------------------------- | ------------------------------------------------------------------------ |
| [Graph column layout](./graph-column-layout.md) | Which lane each commit row is drawn on, and which segments render dashed |

> [!WARNING]
> [`archive/`](./archive/README.md) is a different thing entirely: the original 2026-07-03 design
> documents, written before the features existed and never updated. Do not read them as
> documentation of the current code.
