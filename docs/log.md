# Tori Log

Dated, newest-first notes on what changed and why. Keep entries short;
detailed checklists live in the phase files and measurements in
[status.md](./status.md).

## 2026-11-06

- Settled the Tori label format: one permanent base32 ID, printed as a QR
  item URL (phone-compatible), a bare-ID Data Matrix, or a bare-ID Code 128.
  On-device decoding targets QR first, then Code 128.
- Renamed the project from Segtori to Tori across firmware, service, docs,
  and utilities. mDNS type is now `_tori._tcp`; the service also advertises
  `_segtori-ocr._tcp` and `_tori-ocr._tcp` until every handheld is reflashed.
  `TORI_*` env vars are canonical, with `SEGTORI_*` read as a fallback.
- Verified: service tests pass (27), both firmware environments build, and
  avahi resolves the new and legacy mDNS types on the LAN.
- Restructured the roadmap. Phase 5 is now codes and the general item model,
  Phase 6 fast item ingest, Phase 7 Handheld v1 (absorbing the original
  device UX and provisioning work), and Phase 8 field readiness.
- Set direction: general-purpose inventory for home electronics parts and
  shop cutting tools, and local models only.
- Fixed stale `service/node_modules` (`ws` missing), which had failed two
  test files.
