// ╭──────────────────────────────╮
// │  Inventory Service           │
// │  Resolves Airtable or local  │
// │  SQLite inventory behind one │
// │  firmware-facing contract.   │
// ╰──────────────────────────────╯

const fs = require("fs");
const path = require("path");
const { randomUUID } = require("node:crypto");
const { DatabaseSync } = require("node:sqlite");

const { loadConfig } = require("../config");

const localDatabases = new Map();
const LOCAL_EXPORT_HEADERS = [
  "id",
  "name",
  "partNumber",
  "secondaryName",
  "aliases",
  "quantity",
];

function readAliases(value) {
  return (Array.isArray(value) ? value : [value])
    .flatMap((entry) => String(entry ?? "").split(/[,;\n]/))
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function normalizeQuantity(value) {
  const quantity = Number(value ?? 0);
  return Number.isFinite(quantity) ? quantity : 0;
}

function escapeCsvValue(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, "\"\"")}"` : text;
}

function parseCsv(text) {
  const rows = [];
  let current = "";
  let row = [];
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const next = text[index + 1];

    if (inQuotes) {
      if (character === "\"" && next === "\"") {
        current += "\"";
        index += 1;
      } else if (character === "\"") {
        inQuotes = false;
      } else {
        current += character;
      }
      continue;
    }

    if (character === "\"") {
      inQuotes = true;
      continue;
    }

    if (character === ",") {
      row.push(current);
      current = "";
      continue;
    }

    if (character === "\n") {
      row.push(current);
      rows.push(row);
      row = [];
      current = "";
      continue;
    }

    if (character !== "\r") {
      current += character;
    }
  }

  if (current || row.length) {
    row.push(current);
    rows.push(row);
  }

  return rows.filter((entry) => entry.some((value) => String(value).trim() !== ""));
}

function normalizeImportItem(item) {
  return {
    id: String(item.id || randomUUID()),
    recordId: String(item.recordId || ""),
    name: String(item.name || "").trim(),
    partNumber: String(item.partNumber || "").trim(),
    secondaryName: String(item.secondaryName || "").trim(),
    aliases: readAliases(item.aliases ?? []),
    quantity: normalizeQuantity(item.quantity),
  };
}

function normalizeLocalItem(row) {
  return {
    id: String(row.id),
    recordId: row.record_id || "",
    name: String(row.name || "").trim(),
    partNumber: String(row.part_number || "").trim(),
    secondaryName: String(row.secondary_name || "").trim(),
    aliases: JSON.parse(row.aliases_json || "[]"),
    quantity: normalizeQuantity(row.quantity),
  };
}

function normalizeAirtableItem(record, config) {
  const fields = record.fields ?? {};
  const explicitId = config.airtable.itemIdField ? fields[config.airtable.itemIdField] : "";
  const quantityValue = normalizeQuantity(fields[config.airtable.quantityField]);
  const primaryName = String(fields[config.airtable.itemNameField] ?? "").trim();
  const partNumber = config.airtable.itemPartNumberField
    ? String(fields[config.airtable.itemPartNumberField] ?? "").trim()
    : "";
  const secondaryName = config.airtable.itemSecondaryNameField
    ? String(fields[config.airtable.itemSecondaryNameField] ?? "").trim()
    : "";
  const aliasesValue = config.airtable.itemAliasesField
    ? fields[config.airtable.itemAliasesField]
    : [];

  return {
    id: String(explicitId || record.id),
    recordId: record.id,
    name: primaryName,
    partNumber,
    secondaryName,
    aliases: readAliases(aliasesValue),
    quantity: quantityValue,
  };
}

function getConfig() {
  return loadConfig();
}

function getTablePath(config) {
  return `https://api.airtable.com/v0/${encodeURIComponent(config.airtable.baseId)}/${encodeURIComponent(config.airtable.tableId)}`;
}

function getAirtableHeaders(config) {
  return {
    Authorization: `Bearer ${config.airtable.apiToken}`,
    "Content-Type": "application/json",
  };
}

function requireAirtableConfig(config) {
  if (!config.airtable.apiToken || !config.airtable.baseId) {
    throw new Error("Airtable API token and base ID must be configured");
  }
}

async function airtableRequest(url, init) {
  const response = await fetch(url, init);
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = payload.error?.message || payload.error || response.statusText;
    throw new Error(`Airtable request failed: ${message}`);
  }

  return payload;
}

async function listAirtableItems(config = getConfig()) {
  requireAirtableConfig(config);
  const items = [];
  let offset = "";

  do {
    const url = new URL(getTablePath(config));
    url.searchParams.set("pageSize", "100");
    url.searchParams.append("fields[]", config.airtable.itemNameField);
    url.searchParams.append("fields[]", config.airtable.itemPartNumberField);
    url.searchParams.append("fields[]", config.airtable.quantityField);

    if (config.airtable.itemIdField) {
      url.searchParams.append("fields[]", config.airtable.itemIdField);
    }

    if (config.airtable.itemSecondaryNameField) {
      url.searchParams.append("fields[]", config.airtable.itemSecondaryNameField);
    }

    if (config.airtable.itemAliasesField) {
      url.searchParams.append("fields[]", config.airtable.itemAliasesField);
    }

    if (config.airtable.viewId) {
      url.searchParams.set("view", config.airtable.viewId);
    }

    if (offset) {
      url.searchParams.set("offset", offset);
    }

    const payload = await airtableRequest(url, {
      headers: getAirtableHeaders(config),
    });

    for (const record of payload.records ?? []) {
      const item = normalizeAirtableItem(record, config);
      if (item.name || item.secondaryName || item.partNumber) {
        items.push(item);
      }
    }

    offset = payload.offset || "";
  } while (offset);

  return items;
}

async function findAirtableRecordId(itemId, config) {
  const url = new URL(getTablePath(config));
  const escapedId = String(itemId).replace(/'/g, "\\'");
  const fieldName = config.airtable.itemIdField || "RECORD_ID()";
  const formula = config.airtable.itemIdField
    ? `{${fieldName}}='${escapedId}'`
    : `RECORD_ID()='${escapedId}'`;

  url.searchParams.set("maxRecords", "1");
  url.searchParams.set("filterByFormula", formula);

  const payload = await airtableRequest(url, {
    headers: getAirtableHeaders(config),
  });

  const record = payload.records?.[0];
  if (!record) {
    throw new Error(`Inventory item not found: ${itemId}`);
  }

  return record.id;
}

async function updateAirtableItemQuantity(id, quantity, config = getConfig()) {
  requireAirtableConfig(config);
  const recordId = config.airtable.itemIdField ? await findAirtableRecordId(id, config) : id;
  const payload = await airtableRequest(`${getTablePath(config)}/${recordId}`, {
    method: "PATCH",
    headers: getAirtableHeaders(config),
    body: JSON.stringify({
      fields: {
        [config.airtable.quantityField]: quantity,
      },
    }),
  });
  const updated = normalizeAirtableItem(payload, config);

  if (String(id) !== updated.id) {
    updated.id = String(id);
  }

  return updated;
}

function getLocalDatabase(config) {
  const location = config.inventory.localDbPath;
  if (localDatabases.has(location)) {
    return localDatabases.get(location);
  }

  fs.mkdirSync(path.dirname(location), { recursive: true });
  const database = new DatabaseSync(location);
  database.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS inventory_items (
      id TEXT PRIMARY KEY,
      record_id TEXT NOT NULL DEFAULT '',
      name TEXT NOT NULL,
      part_number TEXT NOT NULL DEFAULT '',
      secondary_name TEXT NOT NULL DEFAULT '',
      aliases_json TEXT NOT NULL DEFAULT '[]',
      quantity REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS inventory_items_name_idx
      ON inventory_items(name, part_number);
  `);

  localDatabases.set(location, database);
  return database;
}

function closeInventoryDatabases() {
  for (const database of localDatabases.values()) {
    database.close();
  }
  localDatabases.clear();
}

function countLocalItems(config = getConfig()) {
  const row = getLocalDatabase(config)
    .prepare("SELECT COUNT(*) AS count FROM inventory_items")
    .get();

  return Number(row?.count || 0);
}

function listLocalItems(config = getConfig()) {
  return getLocalDatabase(config)
    .prepare(`
      SELECT id, record_id, name, part_number, secondary_name, aliases_json, quantity
      FROM inventory_items
      ORDER BY
        CASE WHEN part_number = '' THEN 1 ELSE 0 END,
        LOWER(part_number),
        LOWER(name),
        LOWER(id)
    `)
    .all()
    .map(normalizeLocalItem);
}

function createLocalItem(input, config = getConfig()) {
  const name = String(input.name ?? "").trim();
  const partNumber = String(input.partNumber ?? "").trim();
  const secondaryName = String(input.secondaryName ?? "").trim();
  const aliases = readAliases(input.aliases ?? []);
  const quantity = normalizeQuantity(input.quantity);

  if (!name) {
    throw new Error("Inventory item name is required");
  }

  const item = {
    id: String(input.id || randomUUID()),
    recordId: "",
    name,
    partNumber,
    secondaryName,
    aliases,
    quantity,
  };
  const now = new Date().toISOString();

  getLocalDatabase(config)
    .prepare(`
      INSERT INTO inventory_items (
        id,
        record_id,
        name,
        part_number,
        secondary_name,
        aliases_json,
        quantity,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      item.id,
      item.recordId,
      item.name,
      item.partNumber,
      item.secondaryName,
      JSON.stringify(item.aliases),
      item.quantity,
      now,
      now,
    );

  return item;
}

function replaceLocalInventory(items, config = getConfig()) {
  const database = getLocalDatabase(config);
  const normalizedItems = items.map(normalizeImportItem);
  const now = new Date().toISOString();
  const insert = database.prepare(`
    INSERT OR REPLACE INTO inventory_items (
      id,
      record_id,
      name,
      part_number,
      secondary_name,
      aliases_json,
      quantity,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, COALESCE((SELECT created_at FROM inventory_items WHERE id = ?), ?), ?)
  `);
  let created = 0;

  database.exec("BEGIN");
  try {
    database.exec("DELETE FROM inventory_items");
    for (const item of normalizedItems) {
      insert.run(
        item.id,
        item.recordId,
        item.name,
        item.partNumber,
        item.secondaryName,
        JSON.stringify(item.aliases),
        item.quantity,
        item.id,
        now,
        now,
      );
      created += 1;
    }
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }

  return {
    created,
    skipped: 0,
    failed: 0,
  };
}

function updateLocalItemQuantity(id, quantity, config = getConfig()) {
  const database = getLocalDatabase(config);
  const now = new Date().toISOString();
  const result = database
    .prepare(`
      UPDATE inventory_items
      SET quantity = ?, updated_at = ?
      WHERE id = ?
    `)
    .run(normalizeQuantity(quantity), now, String(id));

  if (!result.changes) {
    throw new Error(`Inventory item not found: ${id}`);
  }

  const row = database
    .prepare(`
      SELECT id, record_id, name, part_number, secondary_name, aliases_json, quantity
      FROM inventory_items
      WHERE id = ?
    `)
    .get(String(id));

  return normalizeLocalItem(row);
}

function importItemsIntoLocal(items, config = getConfig()) {
  const database = getLocalDatabase(config);
  const now = new Date().toISOString();
  const insert = database.prepare(`
    INSERT OR IGNORE INTO inventory_items (
      id,
      record_id,
      name,
      part_number,
      secondary_name,
      aliases_json,
      quantity,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  let created = 0;
  let skipped = 0;
  database.exec("BEGIN");
  try {
    for (const item of items) {
      const result = insert.run(
        String(item.id),
        String(item.recordId || ""),
        String(item.name || "").trim(),
        String(item.partNumber || "").trim(),
        String(item.secondaryName || "").trim(),
        JSON.stringify(readAliases(item.aliases ?? [])),
        normalizeQuantity(item.quantity),
        now,
        now,
      );

      if (result.changes) {
        created += 1;
      } else {
        skipped += 1;
      }
    }
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }

  return { created, skipped, failed: 0 };
}

async function getLocalMigrationStatus(config = getConfig()) {
  if (countLocalItems(config) > 0) {
    return {
      available: false,
      reason: "local inventory already contains items",
      sourceCount: 0,
    };
  }

  try {
    const airtableItems = await listAirtableItems(config);

    return {
      available: airtableItems.length > 0,
      reason: airtableItems.length > 0 ? "" : "Airtable contains no importable items",
      sourceCount: airtableItems.length,
    };
  } catch (error) {
    return {
      available: false,
      reason: error.message,
      sourceCount: 0,
    };
  }
}

async function importAirtableIntoLocalInventory(config = getConfig()) {
  if (config.inventory.backend !== "local") {
    throw new Error("Airtable migration is only available in local inventory mode");
  }

  if (countLocalItems(config) > 0) {
    throw new Error("Local inventory must be empty before Airtable migration runs");
  }

  const airtableItems = await listAirtableItems(config);
  const summary = importItemsIntoLocal(airtableItems, config);

  return {
    ...summary,
    source: "airtable",
    totalSourceItems: airtableItems.length,
  };
}

function parseJsonInventoryImport(text) {
  const payload = typeof text === "string" ? JSON.parse(text) : text;
  const items = Array.isArray(payload) ? payload : payload.items;

  if (!Array.isArray(items)) {
    throw new Error("JSON import must be an array of inventory items or an object with an items array");
  }

  return items.map(normalizeImportItem);
}

function parseCsvInventoryImport(text) {
  const rows = parseCsv(String(text ?? ""));
  const header = rows.shift()?.map((value) => String(value).trim()) || [];
  const required = ["name"];

  for (const field of required) {
    if (!header.includes(field)) {
      throw new Error(`CSV import is missing required column: ${field}`);
    }
  }

  return rows.map((values) => {
    const row = Object.fromEntries(header.map((key, index) => [key, values[index] ?? ""]));
    return normalizeImportItem({
      id: row.id,
      name: row.name,
      partNumber: row.partNumber,
      secondaryName: row.secondaryName,
      aliases: row.aliases,
      quantity: row.quantity,
    });
  });
}

function exportLocalInventory(format, config = getConfig()) {
  const items = listLocalItems(config);

  if (format === "json") {
    return {
      contentType: "application/json; charset=utf-8",
      fileName: "inventory.json",
      body: `${JSON.stringify({ items }, null, 2)}\n`,
    };
  }

  const lines = [
    LOCAL_EXPORT_HEADERS.join(","),
    ...items.map((item) =>
      [
        item.id,
        item.name,
        item.partNumber,
        item.secondaryName,
        item.aliases.join("; "),
        item.quantity,
      ]
        .map(escapeCsvValue)
        .join(","),
    ),
  ];

  return {
    contentType: "text/csv; charset=utf-8",
    fileName: "inventory.csv",
    body: `${lines.join("\n")}\n`,
  };
}

function importLocalInventory({ format, body }, config = getConfig()) {
  if (config.inventory.backend !== "local") {
    throw new Error("Inventory import is only available in local inventory mode");
  }

  const normalizedFormat = String(format || "").toLowerCase();
  if (!["json", "csv"].includes(normalizedFormat)) {
    throw new Error("Import format must be json or csv");
  }

  const items = normalizedFormat === "json"
    ? parseJsonInventoryImport(body)
    : parseCsvInventoryImport(body);

  const summary = replaceLocalInventory(items, config);
  return {
    ...summary,
    source: normalizedFormat,
    totalSourceItems: items.length,
  };
}

async function getInventoryCapabilities(config = getConfig()) {
  if (config.inventory.backend === "local") {
    return {
      backend: "local",
      label: "Local SQLite",
      canAdjustQuantity: true,
      canCreateItems: true,
      supportsImport: true,
      supportsExport: true,
      migration: await getLocalMigrationStatus(config),
    };
  }

  return {
    backend: "airtable",
    label: "Airtable",
    canAdjustQuantity: false,
    canCreateItems: false,
    supportsImport: false,
    supportsExport: false,
    migration: {
      available: false,
      reason: "Airtable mode is already active",
      sourceCount: 0,
    },
  };
}

async function listInventoryItems() {
  const config = getConfig();
  return config.inventory.backend === "local"
    ? listLocalItems(config)
    : listAirtableItems(config);
}

async function createInventoryItem(input) {
  const config = getConfig();

  if (config.inventory.backend !== "local") {
    throw new Error("Item creation is only available in local inventory mode");
  }

  return createLocalItem(input, config);
}

async function updateItemQuantity(id, quantity) {
  const config = getConfig();
  return config.inventory.backend === "local"
    ? updateLocalItemQuantity(id, quantity, config)
    : updateAirtableItemQuantity(id, quantity, config);
}

module.exports = {
  closeInventoryDatabases,
  createInventoryItem,
  exportLocalInventory,
  getInventoryCapabilities,
  importAirtableIntoLocalInventory,
  importLocalInventory,
  listInventoryItems,
  updateItemQuantity,
};
