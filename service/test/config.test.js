// ╭──────────────────────────────╮
// │  Config Tests                │
// │  Verifies recognition        │
// │  backend selection.          │
// ╰──────────────────────────────╯

const assert = require("node:assert/strict");
const test = require("node:test");

const { loadConfig } = require("../src/config");

test("defaults to the ONNX backend", () => {
  const previous = process.env.OCR_BACKEND;
  delete process.env.OCR_BACKEND;

  try {
    assert.equal(loadConfig().ocr.backend, "onnx");
    assert.equal(loadConfig().ocr.onnxProvider, "auto");
    assert.equal(loadConfig().airtable.itemPartNumberField, "Part Number");
  } finally {
    if (previous === undefined) {
      delete process.env.OCR_BACKEND;
    } else {
      process.env.OCR_BACKEND = previous;
    }
  }
});

function withEnv(values, run) {
  const previous = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    run();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("advertises the dashboard at tori.local by default", () => {
  withEnv({ TORI_MDNS_HOST: undefined, SEGTORI_MDNS_HOST: undefined }, () => {
    assert.equal(loadConfig().mdnsHost, "tori.local");
  });
});

test("prefers TORI_ settings and still reads legacy SEGTORI_ settings", () => {
  withEnv({ TORI_MDNS_NAME: undefined, SEGTORI_MDNS_NAME: "legacy" }, () => {
    assert.equal(loadConfig().mdnsName, "legacy");
  });
  withEnv({ TORI_MDNS_NAME: "tori-bench", SEGTORI_MDNS_NAME: "legacy" }, () => {
    assert.equal(loadConfig().mdnsName, "tori-bench");
  });
});

test("rejects unknown OCR backends", () => {
  const previous = process.env.OCR_BACKEND;
  process.env.OCR_BACKEND = "unknown";

  try {
    assert.throws(() => loadConfig(), /Unsupported OCR backend/);
  } finally {
    if (previous === undefined) {
      delete process.env.OCR_BACKEND;
    } else {
      process.env.OCR_BACKEND = previous;
    }
  }
});

test("accepts the ONNX OCR backend", () => {
  const previous = process.env.OCR_BACKEND;
  process.env.OCR_BACKEND = "onnx";

  try {
    assert.equal(loadConfig().ocr.backend, "onnx");
    assert.equal(loadConfig().ocr.onnxProvider, "auto");
  } finally {
    if (previous === undefined) {
      delete process.env.OCR_BACKEND;
    } else {
      process.env.OCR_BACKEND = previous;
    }
  }
});

test("rejects unknown ONNX providers", () => {
  const previous = process.env.ONNX_PROVIDER;
  process.env.ONNX_PROVIDER = "unknown";

  try {
    assert.throws(() => loadConfig(), /Unsupported ONNX provider/);
  } finally {
    if (previous === undefined) {
      delete process.env.ONNX_PROVIDER;
    } else {
      process.env.ONNX_PROVIDER = previous;
    }
  }
});

test("rejects unknown inventory backends", () => {
  const previous = process.env.INVENTORY_BACKEND;
  process.env.INVENTORY_BACKEND = "unknown";

  try {
    assert.throws(() => loadConfig(), /Unsupported inventory backend/);
  } finally {
    if (previous === undefined) {
      delete process.env.INVENTORY_BACKEND;
    } else {
      process.env.INVENTORY_BACKEND = previous;
    }
  }
});
