const axios = require("axios");

function buildHtml(title, desc, affiliateLink, imageUrl, hashtags) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} | Styvora</title>
  <meta name="description" content="${desc}">
  <style>
    body { font-family: 'Inter', sans-serif; text-align: center; padding: 20px; color: #111; max-width: 600px; margin: auto; }
    img { width: 100%; border-radius: 8px; margin-bottom: 20px; }
    h1 { font-size: 24px; font-weight: 600; }
    p { color: #555; line-height: 1.6; }
    .hashtags { color: #888; font-size: 14px; margin-bottom: 30px; }
    a.btn { display: inline-block; padding: 15px 30px; background: #111; color: #fff; text-decoration: none; font-weight: bold; border-radius: 5px; }
  </style>
</head>
<body>
  <p style="text-transform: uppercase; letter-spacing: 2px; color: #777; font-size: 12px;">Styvora | Women’s Fashion</p>
  <img src="${imageUrl}" alt="${title}">
  <h1>${title}</h1>
  <p>${desc}</p>
  <p class="hashtags">${hashtags}</p>
  <a href="${affiliateLink}" target="_blank" rel="nofollow" class="btn">Buy Now</a>
</body>
</html>`;
}

async function generateWithGemini(imageBase64, imageMimeType, focusProduct) {
  const prompt = `
  You are an expert Pinterest marketer for women's fashion.
  Primary focus: ${focusProduct}.
  
  CRITICAL RULE: If the product is jewelry, clearly state it is high-quality artificial or gold-plated jewelry. Never describe it as real or solid gold.
  
  Return ONLY valid JSON:
  {
    "title": "Short catchy title",
    "description": "2 lines premium description",
    "hashtags": "#fashion #style"
  }`;

  const response = await axios.post(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
    {
      contents: [{
        parts: [
          { text: prompt },
          { inline_data: { mime_type: imageMimeType, data: imageBase64 } }
        ]
      }]
    }
  );
  
  // Syntax error fixed line
  const text = response.data.candidates[0].content.parts[0].text.replace(/`{3}json|`{3}/g, "").trim();
  return JSON.parse(text);
}

async function putGitHubFile(path, contentBase64, message) {
  const url = `https://api.github.com/repos/${process.env.GITHUB_USERNAME}/${process.env.GITHUB_REPO}/contents/${path}`;
  const headers = {
    Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
    Accept: "application/vnd.github+json"
  };

  let sha;
  try {
    const existing = await axios.get(url, { headers });
    sha = existing.data.sha;
  } catch (e) {}

  await axios.put(url, { message, content: contentBase64, sha, branch: "main" }, { headers });
}

async function publishToGitHub({ affiliateLink, imageBase64, imageMimeType, focusProduct }) {
  const content = await generateWithGemini(imageBase64, imageMimeType, focusProduct);
  const slug = content.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  
  const siteUrl = `https://${process.env.GITHUB_USERNAME}.github.io/${process.env.GITHUB_REPO}`;
  const imagePath = `images/${slug}.jpg`;
  const pagePath = `${slug}.html`;

  // 1. Upload Image to GitHub
  await putGitHubFile(imagePath, imageBase64, `Add image ${slug}`);
  
  // 2. Upload Landing Page HTML to GitHub
  const html = buildHtml(content.title, content.description, affiliateLink, `${siteUrl}/${imagePath}`, content.hashtags);
  const htmlBase64 = Buffer.from(html).toString("base64");
  await putGitHubFile(pagePath, htmlBase64, `Add landing page ${slug}`);

  // 3. Send Data to Make.com Webhook (For Pinterest)
  if (process.env.MAKE_WEBHOOK_URL) {
    try {
      await axios.post(process.env.MAKE_WEBHOOK_URL, {
        title: content.title,
        description: `${content.description}\n\n${content.hashtags}`, 
        link: `${siteUrl}/${pagePath}`, // Landing page link is passed here securely
        imageUrl: `${siteUrl}/${imagePath}` // Direct image link
      });
      console.log("Successfully triggered Make.com Webhook");
    } catch (err) {
      console.log("Make.com webhook failed:", err.message);
    }
  }

  return {
    title: content.title,
    description: content.description,
    hashtags: content.hashtags,
    pageUrl: `${siteUrl}/${pagePath}`,
    affiliateLink
  };
}

module.exports = { publishToGitHub };
