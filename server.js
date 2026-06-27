const path = require("path");
const express = require("express");
const dotenv = require("dotenv");
const multer = require("multer");
const xlsx = require("xlsx");
const { sendLinkToBot, initTelegramClient } = require("./telegram");
const { publishToGitHub } = require("./publisher");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

const upload = multer({ storage: multer.memoryStorage() });

app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, "public")));

// Endpoint 1: Parse Excel Rows
app.post("/api/parse-excel", upload.single("excelFile"), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: "No file uploaded." });

    const workbook = xlsx.read(req.file.buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows = xlsx.utils.sheet_to_json(sheet);

    // Standardizing case-insensitive keys
    const products = rows.map(row => {
      const keys = Object.keys(row);
      const getVal = (name) => row[keys.find(k => k.toLowerCase().trim() === name)] || "";
      return {
        productLink: getVal("product link"),
        affiliateLink: getVal("affiliate link"),
        image: getVal("image")
      };
    }).filter(p => p.productLink || p.affiliateLink);

    res.json({ success: true, products });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Endpoint 2: Process Single Row securely inside loop
app.post("/api/publish-single", async (req, res) => {
  try {
    const { productUrl, focusProduct, geminiApiKey, imageAiKey, telegramBypass } = req.body;
    let { affiliateLink, imageUrl } = req.body;

    if (!geminiApiKey || !imageUrl) {
      return res.status(400).json({ success: false, error: "Missing required details." });
    }

    // If Telegram Bypass is OFF, fetch dynamically
    if (!telegramBypass && productUrl) {
      console.log("Fetching Affiliate link from Telegram...");
      const botResult = await sendLinkToBot(productUrl);
      if (botResult && botResult.affiliateLink) {
        affiliateLink = botResult.affiliateLink;
      }
    }

    // Call the updated GitHub publisher with Model Change prompt capabilities
    const result = await publishToGitHub({
      affiliateLink,
      imageUrl, // Row's image URL
      focusProduct,
      geminiApiKey,
      imageAiKey
    });

    res.json({ success: true, ...result });

  } catch (error) {
    console.error("Row process failed:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
  try { await initTelegramClient(); } catch (e) { console.log("Telegram client skip:", e.message); }
});
