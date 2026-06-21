const path = require("path");
const express = require("express");
const dotenv = require("dotenv");
const multer = require("multer");
const { sendLinkToBot, initTelegramClient } = require("./telegram");
const { publishToGitHub } = require("./publisher");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// ইমেজ ফাইল মেমোরিতে সেভ করার জন্য multer সেটআপ
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
    const imageFile = req.file;

    if (!productUrl || !imageFile) {
      return res.status(400).json({ success: false, error: "URL and Image are required." });
    }

    isProcessing = true;
    console.log("Started processing workflow...");

    // ১. টেলিগ্রাম বট থেকে অ্যাফিলিয়েট লিংক নেওয়া
    const { affiliateLink } = await sendLinkToBot(productUrl);
    if (!affiliateLink) throw new Error("Could not fetch affiliate link.");

    // ২. ইমেজ বাফার থেকে base64 এ কনভার্ট করা
    const imageBase64 = imageFile.buffer.toString("base64");
    const imageMimeType = imageFile.mimetype;

    // ৩. AI দিয়ে কন্টেন্ট তৈরি এবং GitHub-এ আপলোড করা
    const result = await publishToGitHub({
      affiliateLink,
      imageBase64,
      imageMimeType,
      focusProduct
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
