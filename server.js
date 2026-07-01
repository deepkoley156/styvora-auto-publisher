// Endpoint 2: Process Single Row
app.post("/api/publish-single", async (req, res) => {
  try {
    const { productUrl, focusProduct, geminiApiKey, telegramBypass, siteCategory } = req.body;
    let { affiliateLink, imageUrl } = req.body;

    if (!geminiApiKey || !imageUrl) {
      return res.status(400).json({ success: false, error: "Missing required details." });
    }

    if (!telegramBypass && productUrl) {
      const botResult = await sendLinkToBot(productUrl);
      if (botResult && botResult.affiliateLink) {
        affiliateLink = botResult.affiliateLink;
      }
    }

    // Calling publisher with siteCategory
    const result = await publishToGitHub({
      affiliateLink,
      imageUrl,
      focusProduct,
      siteCategory, // Passing the folder name
      geminiApiKey
    });

    res.json({ success: true, ...result });

  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});
