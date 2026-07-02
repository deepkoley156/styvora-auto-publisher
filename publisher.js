const axios = require("axios");

function escapeXml(unsafe) {
  return String(unsafe || "").replace(/[<>&'"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '\'': '&apos;', '"': '&quot;' }[c]));
}

// Template 1: Product Landing Page Style
function buildHtml(title, desc, affiliateLink, imageUrl, hashtags) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
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
            .product-section { margin: 20px; padding: 20px; }
            .product-title { font-size: 22px; }
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

// AI Engine Processing (Pinterest Rules Applied)
async function generateWithGemini(imageBase64, imageMimeType, focusProduct, geminiApiKey) {
  const prompt = `You are an expert Pinterest marketer for women's fashion. Focus: ${focusProduct}.
  CRITICAL: If jewelry, call it artificial/gold-plated. Never real gold.
  Return JSON: {"title": "catchy", "description": "2 lines description", "hashtags": "#tag1", "altText": "Brief visual details, STRICTLY UNDER 400 chars."}`;

  const response = await axios.post(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`,
    { contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: imageMimeType, data: imageBase64 } }] }] }
  );
  const text = response.data.candidates[0].content.parts[0].text.replace(/`{3}json|`{3}/g, "").trim();
  return JSON.parse(text);
}

// GitHub Core Helpers
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

// Dynamic Homepage Configuration Logic
async function updateHomepageWithCategory(siteCategory, categoryFolder, categoryImageUrl, geminiApiKey) {
  if (!siteCategory || siteCategory.toLowerCase() === "products") return; 
  
  const indexFile = await getGitHubFile("index.html");
  if (!indexFile) return;

  let indexHtml = indexFile.content;
  if (indexHtml.includes(`/${categoryFolder}`)) return;

  let catDesc = "Discover our exclusive new arrivals tailored for your elegant lifestyle.";
  try {
    const prompt = `You are a premium fashion copywriter. Write a very short, engaging 1-line description (maximum 10 words) for a women's fashion website category named '${siteCategory}'. Do not use quotes or hashtags.`;
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`,
      { contents: [{ parts: [{ text: prompt }] }] }
    );
    catDesc = response.data.candidates[0].content.parts[0].text.replace(/["\n]/g, "").trim();
  } catch (e) {}

  // Navbar Dynamic category insert
  const navRegex = /<\/ul>\s*<\/nav>/i;
  const navHtml = `    <li><a href="https://styvorafashion.com/${categoryFolder}">${siteCategory.toUpperCase()}</a></li>\n            </ul>\n        </nav>`;
  indexHtml = indexHtml.replace(navRegex, navHtml);

  // Background Image Overlay setup
  const bgStyle = categoryImageUrl 
    ? `background-image: linear-gradient(rgba(255, 255, 255, 0.85), rgba(255, 255, 255, 0.95)), url('${categoryImageUrl}'); background-size: cover; background-position: center;`
    : `background: #ffffff;`;

  const markerRegex = /<\/div>\s*/i;
  const newCardHtml = `
            <div class="collection-card" style="${bgStyle} border: 1px solid #eeeeee; padding: 50px 30px; transition: transform 0.3s; text-align: center;">
                <a href="https://styvorafashion.com/${categoryFolder}" style="display:block; text-decoration:none; color:inherit;">
                    <h3 style="font-size: 20px; font-weight: 500; margin-bottom: 15px; letter-spacing: 1.5px; text-transform: uppercase;">${siteCategory.toUpperCase()}</h3>
                    <p style="font-size: 14px; color: #555;">${catDesc}</p>
                    <span style="font-size: 11px; font-weight: bold; border-bottom: 1px solid #111; margin-top: 15px; display: inline-block;">EXPLORE &rarr;</span>
                </a>
            </div>
        </div>
        
        `;

  if (markerRegex.test(indexHtml)) {
     indexHtml = indexHtml.replace(markerRegex, newCardHtml);
     await putGitHubFile("index.html", Buffer.from(indexHtml).toString("base64"), `Auto-added category ${siteCategory} to homepage`, indexFile.sha);
  }
}

// Category Storefront Grid Auto-builder
async function updateCategoryStorefront(siteCategory, categoryFolder, productTitle, fullImageUrl, fullPageUrl) {
  const catIndexPath = `${categoryFolder}/index.html`;
  const existingCatFile = await getGitHubFile(catIndexPath);
  
  const productCardHtml = `
            <div class="collection-card" style="padding: 15px; text-align: center; background: #ffffff; border: 1px solid #eeeeee;">
                <a href="${fullPageUrl}" style="text-decoration:none; color:inherit;">
                    <img src="${fullImageUrl}" alt="${productTitle}" style="width: 100%; height: 320px; object-fit: cover; border-radius: 8px; margin-bottom: 15px;">
                    <h3 style="font-size: 16px; font-weight: 500; margin-bottom: 10px; text-transform: uppercase;">${productTitle}</h3>
                    <span style="font-size: 12px; font-weight: bold; border-bottom: 1px solid #111;">VIEW PRODUCT &rarr;</span>
                </a>
            </div>`;

  let htmlContent = "";

  if (existingCatFile && existingCatFile.content.includes('<div class="collection-grid">')) {
    htmlContent = existingCatFile.content.replace(/(<div class="collection-grid">)/i, `$1\n${productCardHtml}`);
  } else {
    htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${siteCategory.toUpperCase()} | Styvora Fashion</title>
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
        .category-header { text-align: center; padding: 60px 20px; background: #ffffff; border-bottom: 1px solid #eeeeee; }
        .category-header h1 { font-size: 32px; font-weight: 400; letter-spacing: 3px; text-transform: uppercase; margin-bottom: 15px; }
        .category-header p { font-size: 16px; color: #666666; max-width: 600px; margin: auto; }
        .products-container { padding: 60px 8%; }
        .collection-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 30px; max-width: 1200px; margin: 0 auto; }
        .collection-card { transition: transform 0.3s; }
        .collection-card:hover { transform: translateY(-5px); box-shadow: 0 10px 30px rgba(0,0,0,0.05); }
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

    <div class="category-header">
        <h1>${siteCategory.toUpperCase()}</h1>
        <p>Explore our exclusive collection of premium ${siteCategory.toLowerCase()}.</p>
    </div>

    <section class="products-container">
        <div class="collection-grid">
            ${productCardHtml}
        </div>
    </section>

    <footer><p>&copy; 2026 STYVORA. All Rights Reserved.</p></footer>
</body>
</html>`;
  }
  
  await putGitHubFile(catIndexPath, Buffer.from(htmlContent).toString("base64"), `Update storefront list index for ${siteCategory}`, existingCatFile?.sha);
}

// Main Controller
async function publishToGitHub({ affiliateLink, imageUrl, focusProduct, siteCategory, categoryImageUrl, geminiApiKey }) {
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

  // Upload Landing assets
  await putGitHubFile(imagePath, imageBase64, `Add image to ${categoryFolder}`);
  const html = buildHtml(content.title, content.description, affiliateLink, fullImageUrl, content.hashtags);
  await putGitHubFile(pagePath, Buffer.from(html).toString("base64"), `Add landing page to ${categoryFolder}`);

  // Update Main Core RSS feed
  const itemXml = `  <item>
    <title><![CDATA[${content.title}]]></title>
    <link>${escapeXml(fullPageUrl)}</link>
    <guid>${escapeXml(fullPageUrl)}</guid>
    <description><![CDATA[${content.description} \n\n ${content.hashtags}]]></description>
    <pubDate>${escapeXml(new Date().toUTCString())}</pubDate>
    <enclosure url="${escapeXml(fullImageUrl)}" type="image/jpeg" />
    <altText><![CDATA[${content.altText || content.title}]]></altText>
  </item>`;

  const existingRss = await getGitHubFile("rss.xml");
  let rssContent = existingRss && existingRss.content.includes("</channel>") 
    ? existingRss.content.replace("</channel>", `${itemXml}\n</channel>`)
    : `<?xml version="1.0" encoding="UTF-8" ?><rss version="2.0"><channel><title>Styvora Collections</title><link>${siteUrl}</link><description>Latest Arrivals</description>${itemXml}</channel></rss>`;

  await putGitHubFile("rss.xml", Buffer.from(rssContent).toString("base64"), `Update RSS feed for ${categoryFolder}`, existingRss?.sha);
  
  // Update website files
  await updateHomepageWithCategory(siteCategory, categoryFolder, categoryImageUrl, geminiApiKey);
  await updateCategoryStorefront(siteCategory, categoryFolder, content.title, fullImageUrl, fullPageUrl);

  return { title: content.title };
}

module.exports = { publishToGitHub };
