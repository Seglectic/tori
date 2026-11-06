# Phase 7: Handheld v1

Phase 7 designs the first purpose-built handheld: a camera that can read codes
and photograph items, an onboard display, physical controls, a battery, and
on-device setup. It also takes over the on-device UX work that was originally
planned for Phase 5.

## Progress Checklist

### Carried Forward From The Original Phase 5

- [x] Establish explicit device scan and error states.
- [x] Recover from mDNS discovery failure using a configured fallback host.

### Hardware Design

- [ ] Choose the platform: nulllab ESP32-S3-CAM on a carrier board, or a custom ESP32-S3 board.
- [ ] Choose the camera: refocused OV3660 or an autofocus sensor such as the OV5640 AF.
- [ ] Choose the display: the 240x240 GC9A01 round panel or a rectangular 320x240 panel.
- [ ] Define the controls: trigger, D-pad, confirm, back, and scan/ingest mode.
- [ ] Budget GPIO for the display, controls, and flashlight, using an I/O expander if needed.
- [ ] Define the battery, charging, power switch, and battery sensing.
- [ ] Capture the carrier or main board in a KiCad schematic.
- [ ] Lay out and fabricate the first board revision.

### Firmware

- [ ] Enable a real display backend for preview and UI states.
- [ ] Persist Wi-Fi and server fallback settings in NVS.
- [ ] Add an on-device provisioning mode.
- [ ] Add identify and ingest capture modes.
- [ ] Add candidate browsing and confirmation.
- [ ] Add quantity editing and submission.
- [ ] Render clear no-match, offline, OCR, service, and update-failure states.
- [ ] Make controls consistent across all device states.

### Exit Criteria

- [ ] Configure Wi-Fi and server settings without recompiling firmware.
- [ ] Scan a Tori label, confirm the item, and update quantity using only the handheld.
- [ ] Capture an ingest burst from the handheld that lands in the review queue.
- [ ] Recover cleanly from service discovery and connectivity failures.
- [ ] Validate consistent control behavior across the full handheld workflow.

## Goals

- Keep the firmware thin: capture, display, controls, Wi-Fi, discovery, HTTP.
- Read codes reliably at a natural handheld distance.
- Make identify, confirm, and adjust feel fast with one hand.

## Open Hardware Questions

- The OV3660 is fixed-focus. Phase 5 decode measurements decide whether a
  refocused lens is enough or autofocus is required.
- The GC9A01 round panel suits the industrial design, but candidate lists and
  ingest review text fit a rectangular panel better.
- The nulllab board exposes few free GPIO once the camera and display are
  wired. A resistor-ladder ADC or an I2C expander can carry the D-pad and mode
  controls.
- The nulllab board already has a PH2.0 battery input and a charger. A carrier
  board needs battery voltage sensing and a power switch.

See [hardware/nulllab-esp32s3-cam.md](../hardware/nulllab-esp32s3-cam.md) for
the current board pins and the documented GC9A01 wiring.

## Control Semantics

- Trigger: preview while held; snap on release, or on a second press.
- D-pad left/right: browse candidates, or step quantity in the edit state.
- D-pad up/down: change the quantity step size, or scroll item details.
- Confirm: accept a candidate or submit a quantity.
- Back: cancel to ready, or dismiss an error.
- Mode: toggle between identify and ingest.

## Acceptance Criteria

- A user can configure Wi-Fi and server settings without editing firmware source.
- Candidate confirmation and quantity update states are clear on the display.
- Button behavior is consistent across ready, scan, candidate, edit, ingest,
  and error states.
