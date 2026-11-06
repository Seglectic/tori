// ╭──────────────────────────────╮
// │  Inventory Service Tests     │
// │  Verifies local SQLite CRUD  │
// │  and Airtable migration.     │
// ╰──────────────────────────────╯

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  createInventoryItem,
  getInventoryCapabilities,
  importAirtableIntoLocalInventory,
  listInventoryItems,
  updateItemQuantity,
} = require("../src/services/inventory");

async function withLocalEnv(run) {
  const previousEnv = {
    INVENTORY_BACKEND: process.env.INVENTORY_BACKEND,
    LOCAL_DB_PATH: process.env.LOCAL_DB_PATH,
    AIRTABLE_API_TOKEN: process.env.AIRTABLE_API_TOKEN,
    AIRTABLE_BASE_ID: process.env.AIRTABLE_BASE_ID,
    AIRTABLE_TABLE_ID: process.env.AIRTABLE_TABLE_ID,
  };
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "tori-inventory-"));
  process.env.INVENTORY_BACKEND = "local";
  process.env.LOCAL_DB_PATH = path.join(directory, "inventory.sqlite");

  try {
    await run(directory);
  } finally {
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

test("local inventory creates, lists, and updates items", async () => {
  await withLocalEnv(async () => {
    const created = await createInventoryItem({
      name: "ACME Bolt",
      partNumber: "B-100",
      quantity: 4,
      secondaryName: "Bin A",
      aliases: "bolt, fastener",
    });

    assert.equal(created.name, "ACME Bolt");
    assert.equal(created.partNumber, "B-100");

    const listed = await listInventoryItems();
    assert.equal(listed.length, 1);
    assert.equal(listed[0].aliases[0], "bolt");

    const updated = await updateItemQuantity(created.id, 9);
    assert.equal(updated.quantity, 9);

    const afterUpdate = await listInventoryItems();
    assert.equal(afterUpdate[0].quantity, 9);
  });
});

test("local inventory exposes Airtable migration when empty and readable", async () => {
  await withLocalEnv(async () => {
    const previousFetch = global.fetch;
    process.env.AIRTABLE_API_TOKEN = "token";
    process.env.AIRTABLE_BASE_ID = "base";
    process.env.AIRTABLE_TABLE_ID = "Inventory";
    global.fetch = async () => ({
      ok: true,
      json: async () => ({
        records: [
          {
            id: "rec123",
            fields: {
              Name: "Imported Washer",
              "Part Number": "W-200",
              Quantity: 3,
            },
          },
        ],
      }),
    });

    try {
      const capabilities = await getInventoryCapabilities();
      assert.equal(capabilities.backend, "local");
      assert.equal(capabilities.migration.available, true);
      assert.equal(capabilities.migration.sourceCount, 1);
    } finally {
      global.fetch = previousFetch;
    }
  });
});

test("imports Airtable records into an empty local inventory", async () => {
  await withLocalEnv(async () => {
    const previousFetch = global.fetch;
    process.env.AIRTABLE_API_TOKEN = "token";
    process.env.AIRTABLE_BASE_ID = "base";
    process.env.AIRTABLE_TABLE_ID = "Inventory";
    global.fetch = async () => ({
      ok: true,
      json: async () => ({
        records: [
          {
            id: "rec123",
            fields: {
              Name: "Imported Washer",
              "Part Number": "W-200",
              Quantity: 3,
            },
          },
          {
            id: "rec124",
            fields: {
              Name: "Imported Nut",
              "Part Number": "N-300",
              Quantity: 8,
            },
          },
        ],
      }),
    });

    try {
      const summary = await importAirtableIntoLocalInventory();
      assert.equal(summary.created, 2);

      const items = await listInventoryItems();
      assert.equal(items.length, 2);
      assert.equal(items[0].name, "Imported Nut");

      const capabilities = await getInventoryCapabilities();
      assert.equal(capabilities.migration.available, false);
    } finally {
      global.fetch = previousFetch;
    }
  });
});
