const axios = require("axios");

function escapeXml(unsafe) {
  return String(unsafe || "").replace(/[<>&'"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '\'': '&apos;', '"': '&quot;' }[c]));
}

// Function to safely format fields for Pinterest Bulk CSV
function escapeCsv(field) {
  let stringValue = String(field || "").replace(/"/g, '""');
  if (stringValue.includes(",") || stringValue.includes('"') || stringValue.includes("\n") || stringValue.includes("\r")) {
    return `"${stringValue}"`;
  }
  return stringValue;
}

function buildHtml(title, desc, affiliateLink, imageUrl, hashtags) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<!-- Google tag (gtag.js) -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-6GVYZCMMGH"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-6GVYZCMMGH');
</script>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title} | Styvora Fashion</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Helvetica Neue', Arial, sans-serif; background-color: #fbfbfb; color: #1a1a1a; line-height: 1.6; }
        a { text-decoration: none; color: inherit; transition: all 0.3s ease; }
        header { display: flex; justify-content: space-between; align-items: center; padding: 15px 8%; background-color: #ffffff; box-shadow: 0 2px 10px rgba(0, 0, 0, 0.02); position: sticky; top: 0; z-index: 1000; }
        .logo-container { display: flex; align-items: center; gap: 12px; }
        .brand-logo { height: 45px; width: 45px; object-fit: cover; border-radius: 50%; }
        .brand-name { font-size: 24px; font-weight: 700; letter-spacing: 3px; text-transform: uppercase; color: #111111; }
        nav ul { list-style: none; display: flex; gap: 35px; }
        nav ul li a { font-size: 13px; font-weight: 500; text-transform: uppercase; letter-spacing: 1.5px; color: #555555; }
        nav ul li a:hover { color: #000000; }
        .product-section { max-width: 800px; margin: 60px auto; padding: 40px; background: #ffffff; border: 1px solid #eeeeee; box-shadow: 0 10px 30px rgba(0,0,0,0.02); text-align: center; }
        .product-image { max-width: 100%; max-height: 600px; object-fit: cover; border-radius: 4px; margin-bottom: 30px; }
        .product-title { font-size: 28px; font-weight: 400; letter-spacing: 2px; text-transform: uppercase; margin-bottom: 20px; }
        .product-desc { font-size: 16px; color: #666666; margin-bottom: 20px; padding: 0 20px; }
        .hashtags { color: #999999; font-size: 13px; margin-bottom: 40px; letter-spacing: 1px; }
        .cta-btn { display: inline-block; padding: 15px 40px; background-color: #111111; color: #ffffff; font-size: 13px; text-transform: uppercase; letter-spacing: 2px; font-weight: 600; }
        .cta-btn:hover { background-color: #333333; letter-spacing: 2.5px; }
        footer { background-color: #111111; color: #ffffff; text-align: center; padding: 50px 20px; margin-top: 60px;}
        footer p { font-size: 13px; letter-spacing: 1.5px; color: #999999; }
        @media (max-width: 768px) {
            header { flex-direction: column; gap: 20px; padding: 20px; }
            nav ul { gap: 15px; flex-wrap: wrap; justify-content: center; }
        }
    </style>
</head>
<body>
    <header>
        <a href="https://styvorafashion.com" class="logo-container">
            <img src="https://styvorafashion.com/logo.jpg" alt="Styvora Logo" class="brand-logo">
            <span class="brand-name">Styvora</span>
        </a>
        <nav>
            <ul>
                <li><a href="https://styvorafashion.com/">Home</a></li>
                <li><a href="https://styvorafashion.com/contact">Contact</a></li>
            </ul>
        </nav>
    </header>
    <section class="product-section">
        <img src="${imageUrl}" alt="${title}" class="product-image">
        <h1 class="product-title">${title}</h1>
        <p class="product-desc">${desc}</p>
        <p class="hashtags">${hashtags}</p>
        <a href="${affiliateLink}" target="_blank" rel="nofollow" class="cta-btn">Buy Now</a>
    </section>
    <footer><p>&copy; 2026 STYVORA. All Rights Reserved.</p></footer>
</body>
</html>`;
}

async function generateWithGemini(imageBase64, imageMimeType, focusProduct, geminiApiKey) {
  const prompt = `Act as an Expert SEO Manager and Copywriter for women's fashion in India. I am providing you with a focus product: ${focusProduct}. 
  CRITICAL RULE: If it is jewelry, call it artificial/gold-plated. Never real gold.
  
  Format strictly as JSON:
  {
    "title": "Catchy title",
    "description": "Short SEO description under 350 chars",
    "hashtags": "Hashtags under 100 chars",
    "altText": "Alt text"
  }`;

  const response = await axios.post(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`,
    { contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: imageMimeType, data: imageBase64 } }] }] }
  );
  
  const text = response.data.candidates[0].content.parts[0].text.replace(/`{3}json|`{3}/g, "").trim();
  let parsedData = JSON.parse(text);

  if (parsedData.title) parsedData.title = parsedData.title.replace(/\*/g, "");
  if (parsedData.description) parsedData.description = parsedData.description.replace(/\*/g, "");

  return parsedData;
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

// Main Controller with RSS & CSV logic split
async function publishToGitHub({ affiliateLink, imageUrl, focusProduct, siteCategory, categoryImageUrl, geminiApiKey, publishMode, pinterestBoard }) {
  const imgRes = await axios.get(imageUrl, { responseType: 'arraybuffer' });
  const imageBase64 = Buffer.from(imgRes.data).toString('base64');
  const imageMimeType = imgRes.headers['content-type'] || 'image/jpeg';

  const content = await generateWithGemini(imageBase64, imageMimeType, focusProduct, geminiApiKey);
  
  const slug = content.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  const categoryFolder = (siteCategory || "products").toLowerCase().replace(/[^a-z0-9]+/g, "");
  
  const siteUrl = "https://styvorafashion.com"; 
  const imagePath = `${categoryFolder}/images/${slug}.jpg`;
  const pagePath = `${categoryFolder}/${slug}.html`;
  const fullImageUrl = `${siteUrl}/${imagePath}`;
  const fullPageUrl = `${siteUrl}/${pagePath}`;

  await putGitHubFile(imagePath, imageBase64, `Add image to ${categoryFolder}`);
  const html = buildHtml(content.title, content.description, affiliateLink, fullImageUrl, content.hashtags);
  await putGitHubFile(pagePath, Buffer.from(html).toString("base64"), `Add landing page to ${categoryFolder}`);

  const mode = publishMode || "rss";

  if (mode === "rss") {
    // 1. RSS FEED MODE
    const itemXml = `  <item>
    <title><![CDATA[${content.title}]]></title>
    <link>${escapeXml(fullPageUrl)}</link>
    <guid>${escapeXml(fullPageUrl)}</guid>
    <description><![CDATA[${content.description} \n\n ${content.hashtags}]]></description>
    <pubDate>${escapeXml(new Date().toUTCString())}</pubDate>
    <enclosure url="${escapeXml(fullImageUrl)}" length="1024" type="image/jpeg" />
    <altText><![CDATA[${content.altText || content.title}]]></altText>
  </item>`;

    const existingRss = await getGitHubFile("rss.xml");
    let rssContent = existingRss && existingRss.content.includes("</channel>") 
      ? existingRss.content.replace("</channel>", `${itemXml}\n</channel>`)
      : `<?xml version="1.0" encoding="UTF-8" ?><rss version="2.0"><channel><title>Styvora Collections</title><link>${siteUrl}</link><description>Latest Arrivals</description>${itemXml}</channel></rss>`;

    await putGitHubFile("rss.xml", Buffer.from(rssContent).toString("base64"), `Update RSS feed for ${categoryFolder}`, existingRss?.sha);
  } else if (mode === "csv") {
    // 2. OFFICIAL PINTEREST BULK CSV MODE
    const boardName = pinterestBoard || "Women's Fashion";
    const cleanDesc = `${content.description} \n\n ${content.hashtags}`;
    
    // Formatting matching template: Title,Media URL,Pinterest board,Thumbnail,Description,Link,Publish date,Keywords
    const newCsvRow = `${escapeCsv(content.title)},${escapeCsv(fullImageUrl)},${escapeCsv(boardName)},,${escapeCsv(cleanDesc)},${escapeCsv(fullPageUrl)},,${escapeCsv(siteCategory || "fashion")}\n`;

    const existingCsv = await getGitHubFile("pinterest_bulk.csv");
    let csvContent = "";
    if (existingCsv) {
      csvContent = existingCsv.content + newCsvRow;
    } else {
      const csvHeader = "Title,Media URL,Pinterest board,Thumbnail,Description,Link,Publish date,Keywords\n";
      csvContent = csvHeader + newCsvRow;
    }

    await putGitHubFile("pinterest_bulk.csv", Buffer.from(csvContent).toString("base64"), `Append product to Pinterest Bulk CSV`, existingCsv?.sha);
  }

  return { title: content.title };
}

module.exports = { publishToGitHub };
