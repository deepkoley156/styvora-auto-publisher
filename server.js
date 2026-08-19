const path = require("path");
const express = require("express");
const dotenv = require("dotenv");
const multer = require("multer");
const xlsx = require("xlsx");
const { publishToGitHub } = require("./publisher");

let sendLinkToBot;
try {
  const telegramModule = require("./telegram");
  sendLinkToBot = telegramModule.sendLinkToBot;
} catch (e) {
  console.log("Telegram module code skipped or not found.");
}

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

const upload = multer({ storage: multer.memoryStorage() });

app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, "public")));

// Endpoint 1: Parse uploaded Excel file columns
app.post("/api/parse-excel", upload.single("excelFile"), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: "No file uploaded." });

    const workbook = xlsx.read(req.file.buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows = xlsx.utils.sheet_to_json(sheet);

    const products = rows.map(row => {
      const keys = Object.keys(row);
      // Tries each alias in order, returns the first column that actually has a value
      const getVal = (...names) => {
        for (const name of names) {
          const foundKey = keys.find(k => k.toLowerCase().trim() === name);
          if (foundKey && row[foundKey]) return row[foundKey];
        }
        return "";
      };
      return {
        productLink: getVal("product link", "original link", "product url"),
        affiliateLink: getVal("affiliate link"),
        image: getVal("image", "image link", "image url"),
        seoTitle: getVal("seo title", "title"),
        seoDescription: getVal("seo description", "description"),
        mrp: getVal("mrp", "original price", "regular price", "list price"),
        price: getVal("price", "selling price", "offer price", "discounted price", "sale price")
      };
    }).filter(p => p.productLink || p.affiliateLink);

    res.json({ success: true, products });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Endpoint 2: Process a Single Product Row loop step
app.post("/api/publish-single", async (req, res) => {
  try {
    const { productUrl, focusProduct, geminiApiKey, telegramBypass, siteCategory, categoryImageUrl, aiBypass, seoTitle, seoDescription, mrp, price } = req.body;
    let { affiliateLink, imageUrl } = req.body;

    // Gemini key is only mandatory when AI Bypass is off (bypass mode can run without it)
    if ((!geminiApiKey && !aiBypass) || !imageUrl) {
      return res.status(400).json({ success: false, error: "Missing required details." });
    }

    if (!telegramBypass && productUrl && sendLinkToBot) {
      console.log("Fetching dynamic affiliate link from Bot channel...");
      const botResult = await sendLinkToBot(productUrl);
      if (botResult && botResult.affiliateLink) {
        affiliateLink = botResult.affiliateLink;
      }
    }

    const result = await publishToGitHub({
      affiliateLink,
      imageUrl,
      focusProduct,
      siteCategory, 
      categoryImageUrl,
      geminiApiKey,
      aiBypass,
      seoTitle,
      seoDescription,
      mrp,
      price
    });

    res.json({ success: true, ...result });

  } catch (error) {
    console.error("Publish execution error:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

const server = app.listen(PORT, () => {
  console.log(`Server running smoothly on port ${PORT}`);
});

// ⚡ Graceful shutdown — ensures the old process actually releases the port
// on redeploy/restart instead of hanging (e.g. due to an open Telegram socket)
function shutdown(signal) {
  console.log(`${signal} received — shutting down gracefully...`);
  server.close(() => {
    console.log("HTTP server closed.");
    process.exit(0);
  });
  // Force-exit if something is still holding the process open after 8s
  setTimeout(() => {
    console.log("Forcing exit after timeout.");
    process.exit(1);
  }, 8000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
