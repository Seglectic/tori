# Phase 5: Codes And General Item Model

Phase 5 turns Tori from a label-OCR matcher into a general-purpose inventory
system. Items gain categories, typed attributes, photos, locations, and
machine-readable codes, and `POST /api/scan` resolves 1D/2D codes before
falling back to OCR.

## Progress Checklist

### Item Model

- [ ] Add category, location, unit, manufacturer, notes, and timestamps to local items.
- [ ] Add a typed attribute store driven by per-category templates.
- [ ] Ship starter templates for endmills, drills, fasteners, passives, and ICs/MCUs.
- [ ] Normalize dimensional and electrical values to canonical units for matching.
- [ ] Add an `item_codes` table with unique code values and code kinds.
- [ ] Attach one or more photos to an item.
- [ ] Migrate existing local items without data loss.
- [ ] Map the extended model onto Airtable fields, or document which fields stay local-only.

### Code Scanning

- [ ] Decode QR, Data Matrix, Code 128, and EAN/UPC on the server.
- [ ] Try code decoding before OCR in `POST /api/scan`.
- [ ] Return an exact code hit as an accepted match without OCR.
- [ ] Fall back to OCR and fuzzy matching when no known code is found.
- [ ] Record decoded codes, symbology, and decode timing in scan-job diagnostics.
- [ ] Measure OV3660 decode reliability against code size and distance.

### Tori Labels

- [x] Define the Tori label payload format.
- [ ] Generate printable QR, Data Matrix, and Code 128 labels for an item.
- [ ] Serve an item page at the label URL so a phone camera can open it.
- [ ] Print labels in batches from the inventory console.

### Exit Criteria

- [ ] A printed Tori label scans to its item from the handheld in a single snap.
- [ ] A vendor barcode bound to an item resolves to that item.
- [ ] Unlabeled scans still fall back to the existing OCR matching behavior.
- [ ] Endmill, drill, fastener, and passive items can be stored and browsed by attribute.
- [ ] The Phase 1 scan and quantity API remains compatible with current firmware.

## Goals

- Support two inventories in one system: home electronics parts and shop
  cutting tools.
- Make codes the fast, exact identification path and OCR the fallback.
- Keep the device unaware of categories and attributes; the service owns them.

## Item Model

Items stay quantity-tracked stock records (one record per SKU or size), not
individually serialized assets. A drawer of twelve identical 1/4" 4-flute
carbide endmills is one item with quantity 12.

Core fields: `id`, `name`, `category`, `quantity`, `unit`, `location`,
`manufacturer`, `part_number`, `aliases`, `notes`, `codes`, `photos`,
`attributes`, `created_at`, `updated_at`.

Categories are hierarchical paths such as `Cutting Tools/Endmills` or
`Electronics/Passives/Resistors`. Each category template declares typed
attributes, units, and which attributes form the item's identity for duplicate
detection.

Starter templates:

| Category | Identity attributes | Other attributes |
| --- | --- | --- |
| Endmills | diameter, flutes, end type, corner radius, material | length of cut, overall length, shank diameter, coating, helix, center cutting, vendor EDP |
| Drills | diameter, type, material | point angle, length class, coating, vendor EDP |
| Fasteners | thread, length, head, drive, material | finish, standard (ISO/DIN/ASME) |
| Passives | kind, value, package | tolerance, voltage, power, dielectric |
| ICs / MCUs | part number | manufacturer, package, family |

Value normalization matters for matching and duplicate detection:

- Drill sizes accept fractional (`17/64`), number (`#7`), letter (`F`), and
  metric (`6.8mm`) forms, all stored as canonical millimetres with the original
  designation kept for display.
- Endmill and shank diameters accept inch fractions, decimals, and metric.
- Threads accept metric (`M3x0.5`) and unified (`#4-40`, `1/4-20 UNC`) forms.
- Passive values accept SI and code forms (`10k`, `4k7`, `103`, `100nF`).

The SQLite backend owns the extended model. Airtable remains a read-only Phase 1
source. Fields with no Airtable mapping are local-only.

## Code Scanning

Decoding runs on the server so symbologies and tuning can change without
reflashing firmware. The `zxing-cpp` Python binding runs inside the existing
warmed ONNX worker environment, so no new service process is added.

Scan order:

1. Decode every symbol in the frame.
2. Look up each decoded value in `item_codes`, then in `part_number`.
3. On an exact hit, return that item as the accepted match with
   `match.method = "code"` and skip OCR.
4. Otherwise run the existing OCR and fuzzy-matching path. Unknown decoded
   values are still returned so ingest can bind them to an item.

Response changes are additive only. Current firmware ignores the new fields.

Code kinds: `tori` (Tori-issued label), `vendor` (vendor EDP or SKU barcode),
`upc` (retail packaging), `mpn` (manufacturer part number, for example from a
Digi-Key bag Data Matrix).

The OV3660 module is fixed-focus. Small codes held close may blur. Measure
decode reliability before deciding between refocusing the existing lens and
moving to an autofocus sensor such as the OV5640 AF in Phase 7.

## Tori Labels

Every label encodes the same permanent Tori item ID. The symbology is a
per-label choice:

| Symbology | Payload | Use |
| --- | --- | --- |
| QR | Item URL, e.g. `HTTP://TORI.LOCAL/I/7K3QX` | Default. Any phone camera app opens the item page. |
| Data Matrix | Bare ID, e.g. `7K3QX` | Small labels: tool holders, reel edges, small bins. |
| Code 128 | Bare ID | Long narrow labels: bin edges, shelf strips, USB scanner guns. |

ID and payload rules:

- IDs use Crockford base32: uppercase, no ambiguous `I/L/O/U`, and safe in all
  three symbologies.
- QR URLs are written in uppercase so they encode in QR alphanumeric mode,
  which gives smaller codes. The item route must therefore match
  case-insensitively.
- The URL base is a service setting, not part of the ID. Android phones do not
  reliably resolve `.local` names, so a LAN hostname or proxy may be needed.
  Labels printed with one base must keep resolving if the base changes.
- Scanners accept either a bare ID or any URL ending in `/I/<ID>`.
- The item page shows what the item is and where it belongs: name, category,
  key attributes, location, and photo.

On-device decoding (Phase 7) covers QR first, using the quirc library, then
Code 128. No ESP32 Data Matrix decoder was found, so Data Matrix labels are
decoded server-side from a snap unless libdmtx is ported later.

## Acceptance Criteria

- Code hits return without running OCR and are visibly faster than OCR scans.
- Duplicate detection uses category identity attributes, not names alone.
- Existing local inventory migrates forward and remains matchable.
- The firmware-facing API stays backward compatible.
