const axios = require("axios");

function escapeXml(unsafe) {
  return String(unsafe || "").replace(/[<>&'"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '\'': '&apos;', '"': '&quot;' }[c]));
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

async function generateWithGemini(imageBase64, imageMimeType, focusProduct, geminiApiKey) {
  const prompt = `
  You are an expert Pinterest marketer for women's fashion. Focus: ${focusProduct}.
  CRITICAL: If jewelry, call it artificial/gold-plated. Never real gold.
  Return JSON: {"title": "catchy", "description": "2 lines description", "hashtags": "#tag1", "altText": "Brief visual details of the image, STRICTLY UNDER 400 characters."}`;

  const response = await axios.post(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`,
    { contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: imageMimeType, data: imageBase64 } }] }] }
  );
  const text = response.data.candidates[0].content.parts[0].text.replace(/`{3}json|`{3}/g, "").trim();
  return JSON.parse(text);
}

async function getGitHubFile(path) {
  const url = `https://api.github.com/repos/${process.env.GITHUB_USERNAME}/${process.env.GITHUB_REPO}/contents/${path}`;
  try {
    const res = await axios.get(url, { headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } });
    return { content: Buffer.from(res.data.content, "base64").toString("utf8"), sha: res.data.sha };
  } catch (e) { return null; }
}

async function putGitHubFile(path, contentBase64, message, sha = null) {
  const url = `https://api.github.com/repos/${process.env.GITHUB_USERNAME}/${process.env.GITHUB_REPO}/contents/${path}`;
  const body = { message, content: contentBase64, branch: "main", ...(sha && { sha }) };
  await axios.put(url, body, { headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, Accept: "application/vnd.github+json" } });
}

async function publishToGitHub({ affiliateLink, imageUrl, focusProduct, geminiApiKey }) {
  const imgRes = await axios.get(imageUrl, { responseType: 'arraybuffer' });
  const imageBase64 = Buffer.from(imgRes.data).toString('base64');
  const imageMimeType = imgRes.headers['content-type'] || 'image/jpeg';

  const content = await generateWithGemini(imageBase64, imageMimeType, focusProduct, geminiApiKey);
  const slug = content.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  
  const siteUrl = `https://${process.env.GITHUB_USERNAME}.github.io/${process.env.GITHUB_REPO}`;
  const imagePath = `images/${slug}.jpg`;
  const pagePath = `${slug}.html`;

  await putGitHubFile(imagePath, imageBase64, `Add image ${slug}`);
  const html = buildHtml(content.title, content.description, affiliateLink, `${siteUrl}/${imagePath}`, content.hashtags);
  await putGitHubFile(pagePath, Buffer.from(html).toString("base64"), `Add landing page ${slug}`);

  const itemXml = `  <item>
    <title><![CDATA[${content.title}]]></title>
    <link>${escapeXml(`${siteUrl}/${pagePath}`)}</link>
    <guid>${escapeXml(`${siteUrl}/${pagePath}`)}</guid>
    <description><![CDATA[${content.description} \n\n ${content.hashtags}]]></description>
    <pubDate>${escapeXml(new Date().toUTCString())}</pubDate>
    <enclosure url="${escapeXml(`${siteUrl}/${imagePath}`)}" type="image/jpeg" />
    <altText><![CDATA[${content.altText || content.title}]]></altText>
  </item>`;

  const existingRss = await getGitHubFile("rss.xml");
  let rssContent = existingRss && existingRss.content.includes("</channel>") 
    ? existingRss.content.replace("</channel>", `${itemXml}\n</channel>`)
    : `<?xml version="1.0" encoding="UTF-8" ?><rss version="2.0"><channel><title>Styvora RSS</title><link>${siteUrl}</link><description>Bulk</description>${itemXml}</channel></rss>`;

  await putGitHubFile("rss.xml", Buffer.from(rssContent).toString("base64"), `Update RSS`, existingRss?.sha);

  return { title: content.title };
}

module.exports = { publishToGitHub };
