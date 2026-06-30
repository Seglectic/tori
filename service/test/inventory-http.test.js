// ╭──────────────────────────────╮
// │  Inventory HTTP Tests        │
// │  Verifies local backend      │
// │  through the service API.    │
// ╰──────────────────────────────╯

const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { createApp } = require("../src/app");
const { loadConfig } = require("../src/config");

async function withLocalServer(run) {
  const previousEnv = {
    INVENTORY_BACKEND: process.env.INVENTORY_BACKEND,
    LOCAL_DB_PATH: process.env.LOCAL_DB_PATH,
    OCR_BACKEND: process.env.OCR_BACKEND,
  };
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "segtori-http-"));
  process.env.INVENTORY_BACKEND = "local";
  process.env.LOCAL_DB_PATH = path.join(directory, "inventory.sqlite");
  process.env.OCR_BACKEND = "onnx";

  let server = null;
  let runtime = null;

  async function startServer() {
    runtime = createApp(loadConfig(), { error() {}, warn() {}, info() {} });
    server = http.createServer(runtime.app);
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    return `http://127.0.0.1:${server.address().port}`;
  }

  async function stopServer() {
    runtime?.stop();
    await new Promise((resolve) => server.close(resolve));
    runtime = null;
    server = null;
  }

  try {
    await run({ startServer, stopServer });
  } finally {
    if (server) {
      await stopServer();
    }
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    await fs.rm(directory, { recursive: true, force: true });
  }
}

test("local inventory satisfies create, match, quantity, export, and restart flows", async () => {
  await withLocalServer(async ({ startServer, stopServer }) => {
    let baseUrl = await startServer();

    let response = await fetch(`${baseUrl}/api/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Metric Washer",
        partNumber: "W-200",
        secondaryName: "Bin C",
        aliases: "washer, shim",
        quantity: 5,
      }),
    });
    assert.equal(response.status, 201);
    const createdPayload = await response.json();
    assert.equal(createdPayload.item.name, "Metric Washer");

    response = await fetch(`${baseUrl}/api/match-text`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "washer" }),
    });
    assert.equal(response.status, 200);
    const matchPayload = await response.json();
    assert.equal(matchPayload.match.name, "Metric Washer");

    response = await fetch(`${baseUrl}/api/items/${encodeURIComponent(createdPayload.item.id)}/quantity`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quantity: 12 }),
    });
    assert.equal(response.status, 200);
    const updatePayload = await response.json();
    assert.equal(updatePayload.quantity, 12);

    response = await fetch(`${baseUrl}/api/items/export?format=json`);
    assert.equal(response.status, 200);
    const exportPayload = JSON.parse(await response.text());
    assert.equal(exportPayload.items.length, 1);
    assert.equal(exportPayload.items[0].quantity, 12);

    await stopServer();
    baseUrl = await startServer();

    response = await fetch(`${baseUrl}/api/items`);
    assert.equal(response.status, 200);
    const listPayload = await response.json();
    assert.equal(listPayload.items.length, 1);
    assert.equal(listPayload.items[0].quantity, 12);
  });
});

test("local inventory imports JSON and exports CSV", async () => {
  await withLocalServer(async ({ startServer }) => {
    const baseUrl = await startServer();

    let response = await fetch(`${baseUrl}/api/items/import?format=json`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: [
          {
            id: "item-a",
            name: "Socket Cap Screw",
            partNumber: "S-100",
            aliases: ["screw", "cap screw"],
            quantity: 6,
          },
          {
            id: "item-b",
            name: "Hex Nut",
            partNumber: "N-220",
            quantity: 14,
          },
        ],
      }),
    });
    assert.equal(response.status, 201);
    const importPayload = await response.json();
    assert.equal(importPayload.summary.created, 2);

    response = await fetch(`${baseUrl}/api/items/export?format=csv`);
    assert.equal(response.status, 200);
    const csv = await response.text();
    assert.match(csv, /id,name,partNumber,secondaryName,aliases,quantity/);
    assert.match(csv, /Socket Cap Screw/);
    assert.match(csv, /Hex Nut/);
  });
});
