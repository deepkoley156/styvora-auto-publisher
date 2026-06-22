const path = require("path");
const express = require("express");
const dotenv = require("dotenv");
const multer = require("multer");
const { sendLinkToBot, initTelegramClient } = require("./telegram");
const { publishToGitHub } = require("./publisher");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

const upload = multer({ storage: multer.memoryStorage() });

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

let isProcessing = false;

app.post("/api/publish", upload.single("productImage"), async (req, res) => {
  if (isProcessing) {
    return res.status(429).json({ success: false, error: "System is busy processing another product." });
  }

  try {
    const productUrl = req.body.productUrl;
    const focusProduct = req.body.productType || "product";
    const geminiApiKey = req.body.geminiApiKey; 
    const telegramBypass = req.body.telegramBypass === 'true'; // Checking if bypass is ON
    const imageFile = req.file;

    if (!geminiApiKey) {
      return res.status(400).json({ success: false, error: "Gemini API Key is missing." });
    }
    if (!productUrl || !imageFile) {
      return res.status(400).json({ success: false, error: "URL and Image are required." });
    }

    isProcessing = true;
    console.log("Started processing workflow...");

    let affiliateLink = "";

    // Telegram Bypass Logic
    if (telegramBypass) {
      console.log("Telegram Bypass is ON: Using direct link provided by user.");
      affiliateLink = productUrl; // Using the provided URL directly as the affiliate link
    } else {
      console.log("Telegram Bypass is OFF: Sending link to Telegram bot...");
      const botResult = await sendLinkToBot(productUrl);
      if (!botResult || !botResult.affiliateLink) {
        throw new Error("Could not fetch affiliate link from Telegram.");
      }
      affiliateLink = botResult.affiliateLink;
    }

    const imageBase64 = imageFile.buffer.toString("base64");
    const imageMimeType = imageFile.mimetype;

    const result = await publishToGitHub({
      affiliateLink,
      imageBase64,
      imageMimeType,
      focusProduct,
      geminiApiKey
    });

    res.json({ success: true, ...result });

  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ success: false, error: error.message });
  } finally {
    isProcessing = false;
  }
});

app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
  try {
    await initTelegramClient();
  } catch (error) {
    console.error("Telegram init failed:", error.message);
  }
});
