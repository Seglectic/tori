# Tori Phases

The roadmap is split into one file per phase so implementation guidance stays focused instead of accreting into a single long document.

Detailed progress is tracked in each phase plan. [status.md](./status.md)
summarizes current work, measurements, and the immediate queue.

## Tracking Convention

- `[x]` means the behavior or artifact has been implemented and demonstrated.
- `[ ]` means the work remains pending or has not yet been validated.
- A phase is complete only when every item in its Exit Criteria is checked.

## Phase Index

- [x] [Phase 0: Project Scaffolding](./phases/phase-0.md)
- [x] [Phase 1: MVP Scan And Identify Flow](./phases/phase-1.md)
- [x] [Phase 2: Scan Accuracy And Matching](./phases/phase-2.md)
- [x] [Phase 3: Containerized Network Service](./phases/phase-3.md)
- [x] [Phase 4: Local Inventory Backend](./phases/phase-4.md)
- [ ] [Phase 5: Codes And General Item Model](./phases/phase-5.md)
- [ ] [Phase 6: Fast Item Ingest](./phases/phase-6.md)
- [ ] [Phase 7: Handheld v1](./phases/phase-7.md)
- [ ] [Phase 8: Field Readiness](./phases/phase-8.md)

## Summary

- Phase 0 defines scaffolding, repository shape, and conventions.
- Phase 1 builds the smallest useful read-only scan-and-identify system on host-run service infrastructure.
- Phase 2 improves OCR quality, match confidence behavior, and diagnostics.
- Phase 3 makes Docker a first-class deployment target for repeatable LAN service packaging.
- Phase 4 adds a local inventory backend behind the same firmware-facing API.
- Phase 5 adds categories, typed attributes, 1D/2D code scanning, and Tori labels.
- Phase 6 adds a local-model photo ingest workflow with a review queue.
- Phase 7 designs the Handheld v1 hardware and on-device UX, including provisioning.
- Phase 8 validates the physical device for repeated field use.

## Roadmap Changes

- 2026-11-06: The original Phase 5 (Device UX And Provisioning) and Phase 6
  (Hardware And Field Readiness) were restructured. Their device UX and
  provisioning items moved into Phase 7 and their validation items into
  Phase 8. Codes and ingest were inserted first because the general-purpose
  inventory goal depends on them and they need no new hardware.
