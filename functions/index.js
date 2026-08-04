const functions = require("firebase-functions");
const admin = require("firebase-admin");
const nodemailer = require("nodemailer");

admin.initializeApp();

// ─── CONFIGURATION ────────────────────────────────────────────
const CONFIG = {
  // Email settings (using Gmail App Password)
  EMAIL_RECIPIENT: "isackkazembe@gmail.com",
  EMAIL_SENDER: "isackkazembe@gmail.com",
  EMAIL_PASSWORD: "bkeockoxqjhgblhc", // ← Your App Password (no spaces)

  // WhatsApp (CallMeBot) – two numbers
  WHATSAPP_ENABLED: true,
  WHATSAPP_PHONE_NUMBERS: ["255747123133", "255758831033"],
  WHATSAPP_API_KEY: "6209165",
  WHATSAPP_API_URL: "https://api.callmebot.com/whatsapp.php",
};

// ─── EMAIL TRANSPORTER ────────────────────────────────────────
const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false,
  auth: {
    user: CONFIG.EMAIL_SENDER,
    pass: CONFIG.EMAIL_PASSWORD,
  },
});

// ─── SCHEDULED FUNCTION ──────────────────────────────────────
exports.weeklyInventoryReport = functions.pubsub
    .schedule("0 18 * * 0") // Sunday 18:00 (6 PM) Nairobi time
    .timeZone("Africa/Nairobi")
    .onRun(async (context) => {
      console.log("📊 Weekly inventory report started...");

      try {
      // ─── 1. Fetch products & inventory summaries ──────────
        const productSnap = await admin.firestore().collection("products").get();
        const invSnap = await admin.firestore().collection("inventorySummary").get();

        const productMap = {};
        productSnap.forEach((doc) => {
          const data = doc.data();
          productMap[doc.id] = {
            id: doc.id,
            name: data.productName || data.name || doc.id,
            category: data.category || "General",
            group: data.group || "",
            sellingPrice: data.sellingPrice || 0,
            wac: data.wac || 0,
          };
        });

        const invMap = {};
        invSnap.forEach((doc) => {
          const data = doc.data();
          const pid = data.productId || doc.id;
          invMap[pid] = {
            quantity: data.quantity || data.currentStock || 0,
            wac: data.wac || 0,
          };
        });

        // ─── 2. Sales for last 30 days ──────────────────────────
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const salesSnap = await admin.firestore()
            .collection("sales")
            .where("saleDate", ">=", thirtyDaysAgo.toISOString())
            .get();

        const saleIds = salesSnap.docs.map((doc) => doc.id);

        // ─── 3. Fetch salesItems (chunked) ──────────────────────
        const allItems = [];
        const chunkSize = 30;
        for (let i = 0; i < saleIds.length; i += chunkSize) {
          const chunk = saleIds.slice(i, i + chunkSize);
          if (chunk.length === 0) continue;
          const itemsSnap = await admin.firestore()
              .collection("salesItems")
              .where("saleId", "in", chunk)
              .get();
          itemsSnap.forEach((doc) => allItems.push(doc.data()));
        }

        // ─── 4. Sales stats per product ─────────────────────────
        const stats = {};
        allItems.forEach((item) => {
          const pid = item.productid || item.id;
          if (!pid) return;
          if (!stats[pid]) stats[pid] = {totalSold30d: 0};
          stats[pid].totalSold30d += item.quantity || 0;
        });

        // ─── 5. Metrics per product ─────────────────────────────
        const metrics = [];
        for (const [pid, product] of Object.entries(productMap)) {
          const inv = invMap[pid] || {quantity: 0, wac: 0};
          const sale = stats[pid] || {totalSold30d: 0};
          const avgDailySales = sale.totalSold30d / 30;
          const stockCoverage = avgDailySales > 0 ? inv.quantity / avgDailySales : Infinity;

          metrics.push({
            sku: pid,
            name: product.name,
            category: product.category,
            group: product.group,
            currentStock: inv.quantity,
            unitCost: inv.wac,
            inventoryValue: inv.quantity * inv.wac,
            totalSold30d: sale.totalSold30d,
            avgDailySales: avgDailySales,
            stockCoverage: stockCoverage,
          });
        }

        // ─── 6. Classify products ──────────────────────────────
        const categories = {
          FAST_MOVING: [],
          SLOW_MOVING: [],
          DEADSTOCK: [],
          REORDER_URGENT: [],
          OVERSTOCKED: [],
        };

        for (const p of metrics) {
          let primaryCategory = "NORMAL";
          if (p.totalSold30d === 0) {
            primaryCategory = "DEADSTOCK";
          } else if (p.totalSold30d <= 5 && p.currentStock > 0) {
            primaryCategory = "SLOW_MOVING";
          } else if (p.totalSold30d >= 20) {
            primaryCategory = "FAST_MOVING";
          }

          let alertCategory = null;
          if (p.stockCoverage < 7 && p.stockCoverage !== Infinity) alertCategory = "REORDER_URGENT";
          else if (p.stockCoverage > 30 && p.stockCoverage !== Infinity) alertCategory = "OVERSTOCKED";

          let recommendation = "";
          if (alertCategory === "REORDER_URGENT") recommendation = "Reorder Immediately";
          else if (alertCategory === "OVERSTOCKED") recommendation = "Discount / Bundle / Stop Reordering";
          else if (primaryCategory === "DEADSTOCK") recommendation = "Discount / Bundle / Stop Reordering";
          else if (primaryCategory === "SLOW_MOVING") recommendation = "Consider Promotion / Bundle";
          else if (primaryCategory === "FAST_MOVING") recommendation = "Maintain Stock Level";

          const enriched = {
            ...p,
            classification: primaryCategory,
            alert: alertCategory,
            recommendation,
            stockCoverageDisplay: p.stockCoverage === Infinity ? "N/A" : Math.round(p.stockCoverage),
            totalSold30dDisplay: p.totalSold30d,
            avgDailySalesDisplay: p.avgDailySales.toFixed(2),
          };

          if (primaryCategory !== "NORMAL") categories[primaryCategory].push(enriched);
          if (alertCategory) categories[alertCategory].push(enriched);
        }

        // Sorting
        categories.FAST_MOVING.sort((a, b) => b.totalSold30d - a.totalSold30d);
        categories.SLOW_MOVING.sort((a, b) => a.totalSold30d - b.totalSold30d);
        categories.DEADSTOCK.sort((a, b) => b.totalSold30d - a.totalSold30d);
        categories.REORDER_URGENT.sort((a, b) => a.stockCoverage - b.stockCoverage);
        categories.OVERSTOCKED.sort((a, b) => b.stockCoverage - a.stockCoverage);

        const deadstockValue = categories.DEADSTOCK.reduce((sum, p) => sum + p.inventoryValue, 0);

        // ─── 7. Build HTML Email ────────────────────────────────
        function buildTable(title, items, columns) {
          if (!items || !items.length) return `<h3>${title}</h3><p>No items.</p>`;
          let html = `<h3 style="margin-top:25px;">${title} (${items.length})</h3>
                    <table border="1" cellpadding="5" cellspacing="0" style="border-collapse:collapse; width:100%;">
                      <thead style="background-color:#f2f2f2;"><tr>${columns.map((col) => `<th>${col.label}</th>`).join("")}</tr></thead>
                      <tbody>`;
          for (const item of items) {
            html += "<tr>";
            for (const col of columns) {
              let value = item[col.field];
              if (col.field === "stockCoverage") value = item.stockCoverageDisplay;
              else if (col.field === "inventoryValue") value = "Tsh " + value.toLocaleString();
              else if (col.field === "currentStock") value = item.currentStock;
              else if (col.field === "totalSold30d") value = item.totalSold30dDisplay;
              html += `<td>${value}</td>`;
            }
            html += "</tr>";
          }
          html += "</tbody></table>";
          return html;
        }

        const commonColumns = [
          {label: "Product Name", field: "sku"},
          {label: "Current Stock", field: "currentStock"},
          {label: "Sales (30d)", field: "totalSold30d"},
          {label: "Stock Coverage (days)", field: "stockCoverage"},
          {label: "Recommendation", field: "recommendation"},
        ];

        const now = new Date();
        const dateStr = now.toLocaleString("en-TZ", {timeZone: "Africa/Nairobi"});

        let html = `
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; }
            h2 { color: #2c3e50; }
            h3 { color: #e67e22; }
            table { margin-bottom: 20px; border-collapse: collapse; width: 100%; }
            th { background: #3498db; color: white; padding: 8px; }
            td { padding: 8px; border: 1px solid #ddd; }
          </style>
        </head>
        <body>
          <h2>📊 Weekly Inventory Performance Report</h2>
          <p>Generated: ${dateStr}</p>
          <p><strong>Total value locked in deadstock:</strong> Tsh ${deadstockValue.toLocaleString()}</p>
          <p>CSV file attached – contains all products with their categories.</p>
      `;
        html += buildTable("🔥 FAST MOVING ITEMS", categories.FAST_MOVING, commonColumns);
        html += buildTable("🐢 SLOW MOVING ITEMS", categories.SLOW_MOVING, commonColumns);
        html += buildTable("💀 DEADSTOCK ITEMS", categories.DEADSTOCK, commonColumns);
        html += buildTable("⚠️ REORDER URGENT", categories.REORDER_URGENT, commonColumns);
        html += buildTable("📦 OVERSTOCKED ITEMS", categories.OVERSTOCKED, commonColumns);
        html += `</body></html>`;

        // ─── 8. Build CSV ──────────────────────────────────────
        const csvRows = [];
        csvRows.push(["Product Name", "Current Stock", "Sales (30d)", "Stock Coverage (days)", "Recommendation", "Category"]);
        const allItemsForCSV = [];
        for (const [catName, items] of Object.entries(categories)) {
          for (const item of items) {
            allItemsForCSV.push({
              sku: item.sku,
              currentStock: item.currentStock,
              totalSold30d: item.totalSold30dDisplay,
              stockCoverage: item.stockCoverageDisplay,
              recommendation: item.recommendation,
              category: catName.replace(/_/g, " "),
            });
          }
        }
        allItemsForCSV.sort((a, b) => a.category.localeCompare(b.category) || a.sku.localeCompare(b.sku));
        for (const item of allItemsForCSV) {
          csvRows.push([
            item.sku,
            item.currentStock,
            item.totalSold30d,
            item.stockCoverage,
            item.recommendation,
            item.category,
          ]);
        }
        const csvString = csvRows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, "\"\"")}"`).join(",")).join("\n");

        const fileName = `Inventory_Report_${now.toISOString().split("T")[0]}.csv`;
        const csvBuffer = Buffer.from(csvString, "utf-8");

        // ─── 9. Send Email ─────────────────────────────────────
        await transporter.sendMail({
          to: CONFIG.EMAIL_RECIPIENT,
          subject: "Weekly Inventory Performance Report",
          html: html,
          attachments: [
            {
              filename: fileName,
              content: csvBuffer,
              contentType: "text/csv",
            },
          ],
        });

        console.log("✅ Weekly report email sent.");

        // ─── 10. WhatsApp Alerts (to both numbers) ────────────
        if (CONFIG.WHATSAPP_ENABLED && categories.REORDER_URGENT.length > 0) {
          const urgent = categories.REORDER_URGENT;
          let msg = `⚠️ URGENT REORDER ALERT ⚠️\n${urgent.length} product(s) have stock coverage <7 days:\n`;
          urgent.slice(0, 5).forEach((p) => {
            msg += `- ${p.sku} | Stock: ${p.currentStock} | Coverage: ${p.stockCoverageDisplay} days\n`;
          });
          if (urgent.length > 5) msg += `... and ${urgent.length-5} more.`;

          for (const phone of CONFIG.WHATSAPP_PHONE_NUMBERS) {
            const url = `${CONFIG.WHATSAPP_API_URL}?phone=${phone}&text=${encodeURIComponent(msg)}&apikey=${CONFIG.WHATSAPP_API_KEY}`;
            try {
              await fetch(url);
              console.log(`✅ WhatsApp alert sent to ${phone}`);
            } catch (e) {
              console.log(`⚠️ WhatsApp failed for ${phone}:`, e.message);
            }
          }
        }

        console.log("📊 Weekly inventory report finished successfully.");
        return null;
      } catch (error) {
        console.error("❌ Weekly report failed:", error);
        throw new Error("Weekly report failed: " + error.message);
      }
    });
