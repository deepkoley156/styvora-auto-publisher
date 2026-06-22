const axios = require("axios");

function escapeXml(unsafe) {
  return String(unsafe || "").replace(/[<>&'"]/g, function (c) {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
    }
  });
}

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

function buildRssItem({ title, pageUrl, description, imageUrl, pubDate }) {
  return `  <item>
    <title><![CDATA[${title}]]></title>
    <link>${escapeXml(pageUrl)}</link>
    <guid>${escapeXml(pageUrl)}</guid>
    <description><![CDATA[${description}]]></description>
    <pubDate>${escapeXml(pubDate)}</pubDate>
    <enclosure url="${escapeXml(imageUrl)}" type="image/jpeg" />
  </item>`;
}

function buildInitialRss(firstItem, siteUrl) {
  return `<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0">
<channel>
  <title>Styvora Auto RSS</title>
  <link>${escapeXml(siteUrl)}</link>
  <description>Latest fashion affiliate products</description>
  <language>en-us</language>
${firstItem}
</channel>
</rss>`;
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
  
  const text = response.data.candidates[0].content.parts[0].text.replace(/`{3}json|`{3}/g, "").trim();
  return JSON.parse(text);
}

async function getGitHubFile(path) {
  const url = `https://api.github.com/repos/${process.env.GITHUB_USERNAME}/${process.env.GITHUB_REPO}/contents/${path}`;
  try {
    const res = await axios.get(url, {
      headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` }
    });
    return { content: Buffer.from(res.data.content, "base64").toString("utf8"), sha: res.data.sha };
  } catch (e) {
    return null;
  }
}

async function putGitHubFile(path, contentBase64, message, sha = null) {
  const url = `https://api.github.com/repos/${process.env.GITHUB_USERNAME}/${process.env.GITHUB_REPO}/contents/${path}`;
  const headers = {
    Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
    Accept: "application/vnd.github+json"
  };
  const body = { message, content: contentBase64, branch: "main" };
  if (sha) body.sha = sha;

  await axios.put(url, body, { headers });
}

async function publishToGitHub({ affiliateLink, imageBase64, imageMimeType, focusProduct }) {
  const content = await generateWithGemini(imageBase64, imageMimeType, focusProduct);
  const slug = content.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  
  const siteUrl = `https://${process.env.GITHUB_USERNAME}.github.io/${process.env.GITHUB_REPO}`;
  const imagePath = `images/${slug}.jpg`;
  const pagePath = `${slug}.html`;

  await putGitHubFile(imagePath, imageBase64, `Add image ${slug}`);
  
  const html = buildHtml(content.title, content.description, affiliateLink, `${siteUrl}/${imagePath}`, content.hashtags);
  const htmlBase64 = Buffer.from(html).toString("base64");
  await putGitHubFile(pagePath, htmlBase64, `Add landing page ${slug}`);

  const pubDate = new Date().toUTCString();
  const rssItem = buildRssItem({
    title: content.title,
    pageUrl: `${siteUrl}/${pagePath}`,
    description: `${content.description} \n\n ${content.hashtags}`,
    imageUrl: `${siteUrl}/${imagePath}`,
    pubDate
  });

  const existingRss = await getGitHubFile("rss.xml");
  let newRssContent = "";
  let rssSha = null;

  // এই জায়গাটিতে লজিক আপডেট করা হয়েছে
  if (existingRss && existingRss.content.includes("</channel>")) {
    newRssContent = existingRss.content.replace("</channel>", `${rssItem}\n</channel>`);
    rssSha = existingRss.sha;
  } else {
    newRssContent = buildInitialRss(rssItem, siteUrl);
    if (existingRss) rssSha = existingRss.sha; // ফাইল আছে কিন্তু ফাঁকা, তাই Overwrite করতে হবে
  }

  await putGitHubFile("rss.xml", Buffer.from(newRssContent).toString("base64"), `Update RSS for ${slug}`, rssSha);

  return {
    title: content.title,
    description: content.description,
    hashtags: content.hashtags,
    pageUrl: `${siteUrl}/${pagePath}`,
    affiliateLink
  };
}

module.exports = { publishToGitHub };
