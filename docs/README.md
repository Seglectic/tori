# Tori Documentation

Tori, the Tagged Object Recognition Interface, is a general-purpose local inventory system with a handheld ESP32 camera device. The device scans 1D/2D codes or captures label images, sends them to a local server, receives the best matching inventory item, and lets the operator adjust quantity from the device controls. New items are ingested from photos, with local models drafting the record for operator review. It is aimed at two inventories: home electronics parts and shop cutting tools.

The project is split into two entry points:

- `firmware/`: ESP32 firmware for camera capture, controls, display, service discovery, server communication, and quantity update workflow.
- `service/`: OCR and inventory service code, Docker packaging, service discovery, and inventory backend integrations.
- `util/`: developer-side helpers such as the local `toriTest/toriTest.py` TUI for exercising the service without the ESP32.

## Product Intent

Tori should feel like a compact modern field tool: crisp, fast, utilitarian, and purpose-built. The interface should be minimal, high-contrast, and easy to scan on a small screen. It should avoid battle-themed wording while still using a durable technical design language.

The first useful version prioritizes a narrow loop:

1. Press a hardware button.
2. Capture an image with a supported OV2640 or OV3660 camera.
3. Upload the image to the Tori server.
4. Decode codes, or run OCR when no known code is present.
5. Match codes or recognized text against inventory items.
6. Return the best item match to the device.
7. Adjust item quantity with the D-pad.
8. Send the updated quantity back to the inventory backend.

## Project Phases

The active roadmap lives in [phases.md](./phases.md), which now indexes one file per phase under [`docs/phases/`](./phases/phase-0.md).
Current checked progress and the immediate work queue live in [status.md](./status.md).

- Phases 0–4 are complete: scaffolding, the scan-and-identify MVP, OCR accuracy, the containerized service, and the local SQLite backend.
- Phase 5 adds categories, typed attributes, code scanning, and Tori labels.
- Phase 6 adds local-model photo ingest with a review queue.
- Phase 7 designs Handheld v1 and its on-device UX; Phase 8 validates it in the field.

## Architecture References

- [architecture.md](./architecture.md): firmware/server split, API shape, discovery, and inventory backend flow.
- [onnx-ocr.md](./onnx-ocr.md): RapidOCR setup, CUDA isolation, benchmark results, warm-worker behavior, and optimization direction.
- [design.md](./design.md): device and screen design principles.
- [hardware/nulllab-esp32s3-cam.md](./hardware/nulllab-esp32s3-cam.md): primary development board, relevant pins, flashlight circuit, and power notes.

## Current Defaults

- Primary firmware target: nulllab ESP32-S3-CAM using an OV3660 sensor.
- Legacy firmware target: AI Thinker ESP32-CAM using an OV2640 sensor.
- Firmware framework: PlatformIO with Arduino for ESP32.
- Server runtime: Node.js with Express.
- Default OCR engine: RapidOCR ONNX with strict CUDA execution and a warmed worker.
- Portable OCR mode: the same RapidOCR ONNX worker using CPU execution.
- Legacy diagnostic fallback: host-installed `tesseract` binary, outside the
  supported container deployment path.
- Discovery: mDNS using `_tori._tcp.local`.
- Inventory backends: local SQLite (writable) or Airtable (read-only).
- Models: local only. No images or text are sent to cloud services.

## Development Defaults

During active development, the default workflow should run the service directly on the host machine rather than inside Docker.

- Use direct host execution for the normal edit-run-test loop.
- Treat Docker as optional for packaging checks, deployment rehearsal, or later production-oriented phases.
- Avoid making local development depend on building or managing container images unless a specific task is about container behavior.
- Use `util/toriTest/toriTest.py` when you need to validate discovery, OCR responses, or match ranking without reflashing firmware.
