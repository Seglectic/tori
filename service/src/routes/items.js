// ╭──────────────────────────────╮
// │  Quantity Route              │
// │  Handles device-originated   │
// │  quantity updates against    │
// │  the inventory abstraction.  │
// ╰──────────────────────────────╯

const express = require("express");

function createItemsRouter({
  exportLocalInventory,
  createInventoryItem,
  getInventoryCapabilities,
  importAirtableIntoLocalInventory,
  importLocalInventory,
  listInventoryItems,
  updateItemQuantity,
}) {
  const router = express.Router();

  router.get("/", async (_request, response, next) => {
    try {
      const capabilities = await getInventoryCapabilities();
      response.json({
        ok: true,
        capabilities,
        items: await listInventoryItems(),
        migration: capabilities.migration || null,
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/", async (request, response, next) => {
    try {
      const item = await createInventoryItem(request.body ?? {});
      response.status(201).json({
        ok: true,
        item,
      });
    } catch (error) {
      next(error);
    }
  });

  router.post(
    "/import",
    express.text({ type: ["text/csv", "application/json"], limit: "5mb" }),
    async (request, response, next) => {
      try {
        const format =
          String(request.query.format || "").toLowerCase() ||
          (request.is("text/csv") ? "csv" : "json");
        const summary = importLocalInventory({
          format,
          body: request.body,
        });
        response.status(201).json({
          ok: true,
          summary,
        });
      } catch (error) {
        next(error);
      }
    },
  );

  router.post("/import-airtable", async (_request, response, next) => {
    try {
      const summary = await importAirtableIntoLocalInventory();
      response.status(201).json({
        ok: true,
        summary,
      });
    } catch (error) {
      next(error);
    }
  });

  router.get("/export", async (request, response, next) => {
    try {
      const format = String(request.query.format || "json").toLowerCase();
      const payload = exportLocalInventory(format);
      response
        .setHeader("Content-Type", payload.contentType)
        .setHeader("Content-Disposition", `attachment; filename="${payload.fileName}"`)
        .send(payload.body);
    } catch (error) {
      next(error);
    }
  });

  router.post("/:id/quantity", async (request, response, next) => {
    try {
      const { quantity } = request.body ?? {};

      if (!Number.isFinite(quantity)) {
        response.status(400).json({
          ok: false,
          error: "quantity must be a number",
        });
        return;
      }

      const updated = await updateItemQuantity(request.params.id, quantity);
      response.json({
        ok: true,
        id: updated.id,
        quantity: updated.quantity,
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}

module.exports = {
  createItemsRouter,
};
