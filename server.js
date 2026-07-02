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

// Endpoint 2: Process a Single Product Row loop step
app.post("/api/publish-single", async (req, res) => {
  try {
    const { productUrl, focusProduct, geminiApiKey, telegramBypass, siteCategory, categoryImageUrl } = req.body;
    let { affiliateLink, imageUrl } = req.body;

    if (!geminiApiKey || !imageUrl) {
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
      geminiApiKey
    });

    res.json({ success: true, ...result });

  } catch (error) {
    console.error("Publish execution error:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server running smoothly on port ${PORT}`);
});
