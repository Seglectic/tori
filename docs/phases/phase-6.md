# Phase 6: Fast Item Ingest

Phase 6 makes adding new items nearly as fast as scanning existing ones. The
operator captures photos, local models draft an item record, and the operator
approves or corrects the draft in a review queue. All recognition runs on local
hardware. No cloud models are used.

## Progress Checklist

### Capture

- [ ] Add an ingest capture mode distinct from identify scans.
- [ ] Group one or more photos into a draft item per capture burst.
- [ ] Accept ingest photos from the handheld and from a phone or browser upload.
- [ ] Return to capture immediately; drafting runs asynchronously.
- [ ] Support sticky lot presets that pre-fill category and shared attributes.

### Drafting

- [ ] Decode codes and run OCR on every ingest photo.
- [ ] Parse category attributes from OCR text with deterministic parsers.
- [ ] Propose category and attributes with a local vision-language model.
- [ ] Constrain model output to the category template schema.
- [ ] Record per-field source and confidence (code, parser, model, preset).
- [ ] Flag likely duplicates of existing items using identity attributes.
- [ ] Benchmark local VLM latency and accuracy on representative photos.

### Review

- [ ] Show a draft review queue in the inventory console.
- [ ] Approve a draft as a new item with one action.
- [ ] Merge a duplicate draft into an existing item's quantity.
- [ ] Edit fields inline with keyboard-first controls.
- [ ] Bind decoded vendor codes to the approved item.
- [ ] Queue a Tori label for printing on approval.

### Exit Criteria

- [ ] Ingest a lot of at least 20 endmills or drills with presets at under 15 seconds of operator time per item.
- [ ] Ingest mixed electronics parts with useful drafts that need only minor correction.
- [ ] Duplicates are offered as merges instead of being created silently.
- [ ] Every approved item is immediately identifiable by Phase 5 scans.
- [ ] No image or text leaves the local network.

## Goals

- Minimize operator keystrokes per item, not model latency per photo.
- Let deterministic sources (codes, presets, parsers) win over model guesses.
- Keep the operator as the final authority. Nothing is created without approval.

## Ingest Flow

1. The operator selects a lot preset or none, for example
   `Endmills · carbide · square · 4FL`.
2. The operator snaps one or more photos per item: packaging, label, the item
   itself.
3. The service creates a draft and returns at once, so capture can continue.
4. Workers decode codes, run OCR, run the category parsers, and ask a local VLM
   for anything still missing.
5. Drafts appear in the review queue with photos, proposed fields, sources, and
   duplicate warnings.
6. The operator approves, merges, or edits. Approval creates the item, binds
   its codes, and optionally queues a label.

Field priority when sources disagree: preset > decoded code lookup >
deterministic parser > VLM. The review UI shows which source supplied each
field.

## Domain Notes

Shop cutting tools:

- Endmills and drills often carry laser-etched shank markings (`1/2 4FL`,
  `Ø6.0`) that are small, reflective, and curved. Packaging labels and vendor
  barcodes are usually the better source, so photograph the tube or box when
  possible.
- Homogeneous lots dominate. Presets plus a single varying attribute such as
  diameter are the main speed lever.
- Drill index boxes can be ingested per slot, with the index position stored as
  the location.

Home electronics parts:

- Distributor bags often carry Data Matrix or barcodes that encode the MPN and
  quantity. Decoding these is faster and more accurate than OCR.
- Passives need value, package, and tolerance parsed from the label text.
- Fasteners usually come in labeled bags or bins. Thread and length are the
  key attributes.

## Local Model Direction

The Phase 2 Ollama trial ran vision encoders on the CPU, which made Gemma 3
take about 44 seconds per image. Before choosing a model, evaluate GPU-resident
vision runtimes such as llama.cpp with a CUDA multimodal projector, and small
VLMs like Qwen2.5-VL 3B/7B, on the RTX 3080. Because drafting is asynchronous,
several seconds per draft is acceptable. Accuracy and schema adherence matter
more than latency here.

## Acceptance Criteria

- Capture never blocks on drafting.
- Drafts survive service restarts until approved or discarded.
- The ingest pipeline is debuggable through the same scan-job diagnostics.
