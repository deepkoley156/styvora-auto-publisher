const axios = require("axios");
const sharp = require("sharp");

function escapeXml(unsafe) {
  return String(unsafe || "").replace(/[<>&'"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '\'': '&apos;', '"': '&quot;' }[c]));
}

function escapeCsv(field) {
  let stringValue = String(field || "").replace(/"/g, '""');
  if (stringValue.includes(",") || stringValue.includes('"') || stringValue.includes("\n") || stringValue.includes("\r")) {
    return `"${stringValue}"`;
  }
  return stringValue;
}

// SVG-তে ব্যবহারের জন্য টেক্সট escape করা (XML-এর মতোই, & < > জরুরি)
function escapeSvgText(text) {
  return String(text || "").replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
}

// ⚡ Pinterest-এ যাওয়া ছবির উপর price/MRP/discount টেক্সট বসিয়ে একটা নতুন "pin graphic" বানায়।
// Price data না থাকলে মূল ছবিই অপরিবর্তিত ফেরত দেয় (কোনো ভাঙা/খালি ব্যানার বসে না)।
async function createPinGraphic(rawImageBuffer, mrp, price) {
  const mrpNum = parseFloat(String(mrp || "").replace(/[^\d.]/g, ""));
  const priceNum = parseFloat(String(price || "").replace(/[^\d.]/g, ""));

  if (!priceNum || isNaN(priceNum)) return rawImageBuffer; // price না থাকলে ব্যানার ছাড়াই আসল ছবি

  const image = sharp(rawImageBuffer).rotate(); // rotate() EXIF orientation ঠিক করে দেয়
  const metadata = await image.metadata();
  const width = metadata.width || 1000;
  const height = metadata.height || 1500;

  const hasDiscount = mrpNum && !isNaN(mrpNum) && mrpNum > priceNum;
  const discountPct = hasDiscount ? Math.round(((mrpNum - priceNum) / mrpNum) * 100) : null;

  const bannerHeight = Math.round(height * 0.13);
  const priceFontSize = Math.round(bannerHeight * 0.48);
  const mrpFontSize = Math.round(bannerHeight * 0.28);
  const padding = Math.round(width * 0.035);

  const priceText = `₹${priceNum.toLocaleString("en-IN")}`;
  const mrpText = hasDiscount ? `₹${mrpNum.toLocaleString("en-IN")}` : "";
  const badgeText = hasDiscount ? `${discountPct}% OFF` : "";
  const badgeWidth = Math.round(mrpFontSize * badgeText.length * 0.62) + 24;
  const badgeHeight = Math.round(mrpFontSize * 1.7);

  const svg = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="${height - bannerHeight}" width="${width}" height="${bannerHeight}" fill="#000000" fill-opacity="0.68"/>
      <text x="${padding}" y="${height - bannerHeight / 2 + priceFontSize * 0.34}" font-family="Arial, Helvetica, sans-serif" font-size="${priceFontSize}" font-weight="700" fill="#ffffff">${escapeSvgText(priceText)}</text>
      ${hasDiscount ? `
      <text x="${padding + priceFontSize * (priceText.length * 0.62) + 18}" y="${height - bannerHeight / 2 - mrpFontSize * 0.15}" font-family="Arial, Helvetica, sans-serif" font-size="${mrpFontSize}" fill="#cccccc" text-decoration="line-through">${escapeSvgText(mrpText)}</text>
      <rect x="${width - padding - badgeWidth}" y="${height - bannerHeight / 2 - badgeHeight / 2}" width="${badgeWidth}" height="${badgeHeight}" rx="6" fill="#d9364f"/>
      <text x="${width - padding - badgeWidth / 2}" y="${height - bannerHeight / 2 + mrpFontSize * 0.32}" font-family="Arial, Helvetica, sans-serif" font-size="${Math.round(mrpFontSize * 0.85)}" font-weight="700" fill="#ffffff" text-anchor="middle">${escapeSvgText(badgeText)}</text>
      ` : ""}
    </svg>`;

  return await image
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .jpeg({ quality: 90 })
    .toBuffer();
}

function formatPriceBlock(mrp, price) {
  const mrpNum = parseFloat(String(mrp || "").replace(/[^\d.]/g, ""));
  const priceNum = parseFloat(String(price || "").replace(/[^\d.]/g, ""));

  if (!priceNum || isNaN(priceNum)) return ""; // no usable price data at all — skip the block entirely

  if (mrpNum && !isNaN(mrpNum) && mrpNum > priceNum) {
    const discountPct = Math.round(((mrpNum - priceNum) / mrpNum) * 100);
    return `<div class="price-box">
        <span class="mrp">₹${mrpNum.toLocaleString("en-IN")}</span>
        <span class="sale-price">₹${priceNum.toLocaleString("en-IN")}</span>
        <span class="discount-badge">${discountPct}% OFF</span>
    </div>`;
  }

  // Valid selling price but no (or invalid) MRP to compare against — show price alone
  return `<div class="price-box"><span class="sale-price">₹${priceNum.toLocaleString("en-IN")}</span></div>`;
}

function buildHtml(title, desc, affiliateLink, imageUrl, hashtags, priceHtml, priceNum, pageUrl) {
  const safeTitle = escapeXml(title);
  const safeDesc = escapeXml(desc);
  const priceMetaTags = (priceNum && !isNaN(priceNum))
    ? `    <meta property="product:price:amount" content="${priceNum}">
    <meta property="product:price:currency" content="INR">
    <meta property="product:availability" content="in stock">`
    : "";
  return `<!DOCTYPE html>
<html lang="en">
<head>
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

    <!-- ⚡ Pinterest / Facebook Rich Pins (Product) — this is what lets Pinterest show price on the Pin -->
    <meta property="og:type" content="product">
    <meta property="og:title" content="${safeTitle}">
    <meta property="og:description" content="${safeDesc}">
    <meta property="og:image" content="${imageUrl}">
    <meta property="og:url" content="${pageUrl}">
${priceMetaTags}
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
        .price-box { display: flex; align-items: center; justify-content: center; gap: 12px; flex-wrap: wrap; margin-bottom: 20px; }
        .price-box .mrp { font-size: 16px; color: #999999; text-decoration: line-through; }
        .price-box .sale-price { font-size: 26px; font-weight: 700; color: #111111; }
        .price-box .discount-badge { font-size: 12px; font-weight: 700; color: #ffffff; background-color: #d9534f; padding: 4px 10px; border-radius: 4px; letter-spacing: 0.5px; }
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
        ${priceHtml || ""}
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

async function updateHomepageWithCategory(siteCategory, categoryFolder, categoryImageUrl, geminiApiKey) {
  if (!siteCategory || siteCategory.toLowerCase() === "products") return; 
  const indexFile = await getGitHubFile("index.html");
  if (!indexFile) return;
  let indexHtml = indexFile.content;
  const bgStyle = categoryImageUrl 
    ? `background-image: linear-gradient(rgba(255, 255, 255, 0.65), rgba(255, 255, 255, 0.75)), url('${categoryImageUrl}'); background-size: cover; background-position: center;`
    : `background: #ffffff;`;
  if (indexHtml.includes(`https://styvorafashion.com/${categoryFolder}`)) {
    const stylePattern = new RegExp(`(<div class="collection-card" style=")[^"]*(">[\\s\\S]*?<a href="https://styvorafashion.com/${categoryFolder}")`, "i");
    if (stylePattern.test(indexHtml)) {
       indexHtml = indexHtml.replace(stylePattern, `$1${bgStyle} border: 1px solid #eeeeee; padding: 50px 30px; transition: transform 0.3s; text-align: center;$2`);
       await putGitHubFile("index.html", Buffer.from(indexHtml).toString("base64"), `Auto-updated image background for category ${siteCategory}`, indexFile.sha);
    }
    return;
  }
  let catDesc = "Discover our exclusive new arrivals tailored for your elegant lifestyle.";
  try {
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`,
      { contents: [{ parts: [{ text: `You are a premium fashion copywriter. Write a very short, engaging 1-line description (maximum 10 words) for a women's fashion website category named '${siteCategory}'. Do not use quotes or hashtags.` }] }] }
    );
    catDesc = response.data.candidates[0].content.parts[0].text.replace(/["\n]/g, "").trim();
  } catch (e) {}
  const newCardHtml = `
            <div class="collection-card" style="${bgStyle} border: 1px solid #eeeeee; padding: 50px 30px; transition: transform 0.3s; text-align: center;">
                <a href="https://styvorafashion.com/${categoryFolder}" style="display:block; text-decoration:none; color:inherit;">
                    <h3 style="font-size: 20px; font-weight: 600; margin-bottom: 15px; letter-spacing: 1.5px; text-transform: uppercase; color: #111;">${siteCategory.toUpperCase()}</h3>
                    <p style="font-size: 14px; color: #333; font-weight: 500;">${catDesc}</p>
                    <span style="font-size: 11px; font-weight: bold; border-bottom: 1px solid #111; margin-top: 15px; display: inline-block; color: #111;">EXPLORE &rarr;</span>
                </a>
            </div>`;
  if (indexHtml.includes('<div class="collection-grid">')) {
     indexHtml = indexHtml.replace(/(<div class="collection-grid">)/i, `$1\n${newCardHtml}`);
     await putGitHubFile("index.html", Buffer.from(indexHtml).toString("base64"), `Auto-added category ${siteCategory} to homepage`, indexFile.sha);
  }
}

async function updateCategoryStorefront(siteCategory, categoryFolder, productTitle, fullImageUrl, fullPageUrl) {
  const catIndexPath = `${categoryFolder}/index.html`;
  const existingCatFile = await getGitHubFile(catIndexPath);
  const productCardHtml = `
            <div class="collection-card" style="padding: 15px; text-align: center; background: #ffffff; border: 1px solid #eeeeee;">
                <a href="${fullPageUrl}" style="text-decoration:none; color:inherit;">
                    <img src="${fullImageUrl}" alt="${productTitle}" style="width: 100%; height: auto; display: block; border-radius: 8px; margin-bottom: 15px;">
                    <h3 style="font-size: 16px; font-weight: 500; margin-bottom: 10px; text-transform: uppercase;">${productTitle}</h3>
                    <span style="font-size: 12px; font-weight: bold; border-bottom: 1px solid #111;">VIEW PRODUCT &rarr;</span>
                </a>
            </div>`;
  let htmlContent = "";
  if (existingCatFile && existingCatFile.content.includes('<div class="collection-grid">')) {
    // ⚡ এই প্রোডাক্টের card আগে থেকেই grid-এ থাকলে (re-publish করার সময়, যেমন পুরনো ছবি/দাম
    // ঠিক করতে) সেই পুরনো card-টা আগে সরানো হচ্ছে — নাহলে duplicate card তৈরি হয়ে যেত
    const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const existingCardRegex = new RegExp(`\\s*<div class="collection-card"[^>]*>\\s*<a href="${escapeRegex(fullPageUrl)}"[\\s\\S]*?</div>`, 'i');
    const baseContent = existingCatFile.content.replace(existingCardRegex, '');
    htmlContent = baseContent.replace(/(<div class="collection-grid">)/i, `$1\n${productCardHtml}`);
  } else {
    htmlContent = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${siteCategory.toUpperCase()} | Styvora Fashion</title><style>* { margin: 0; padding: 0; box-sizing: border-box; } body { font-family: 'Helvetica Neue', Arial, sans-serif; background-color: #fbfbfb; color: #1a1a1a; line-height: 1.6; } a { text-decoration: none; color: inherit; transition: all 0.3s ease; } header { display: flex; justify-content: space-between; align-items: center; padding: 15px 8%; background-color: #ffffff; box-shadow: 0 2px 10px rgba(0, 0, 0, 0.02); position: sticky; top: 0; z-index: 1000; } .logo-container { display: flex; align-items: center; gap: 12px; } .brand-logo { height: 45px; width: 45px; object-fit: cover; border-radius: 50%; } .brand-name { font-size: 24px; font-weight: 700; letter-spacing: 3px; text-transform: uppercase; color: #111111; } nav ul { list-style: none; display: flex; gap: 35px; } nav ul li a { font-size: 13px; font-weight: 500; text-transform: uppercase; letter-spacing: 1.5px; color: #555555; } nav ul li a:hover { color: #000000; } .category-header { text-align: center; padding: 60px 20px; background: #ffffff; border-bottom: 1px solid #eeeeee; } .category-header h1 { font-size: 32px; font-weight: 400; letter-spacing: 3px; text-transform: uppercase; margin-bottom: 15px; } .category-header p { font-size: 16px; color: #666666; max-width: 600px; margin: auto; } .products-container { padding: 60px 8%; } .collection-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 30px; max-width: 1200px; margin: 0 auto; } .collection-card { transition: transform 0.3s; } .collection-card:hover { transform: translateY(-5px); box-shadow: 0 10px 30px rgba(0,0,0,0.05); } footer { background-color: #111111; color: #ffffff; text-align: center; padding: 50px 20px; margin-top: 60px;} footer p { font-size: 13px; letter-spacing: 1.5px; color: #999999; } @media (max-width: 768px) { header { flex-direction: column; gap: 20px; padding: 20px; } nav ul { gap: 15px; flex-wrap: wrap; justify-content: center; } }</style></head><body><header><a href="https://styvorafashion.com" class="logo-container"><img src="https://styvorafashion.com/logo.jpg" alt="Styvora Logo" class="brand-logo"><span class="brand-name">Styvora</span></a><nav><ul><li><a href="https://styvorafashion.com/">Home</a></li><li><a href="https://styvorafashion.com/contact">Contact</a></li></ul></nav></header><div class="category-header"><h1>${siteCategory.toUpperCase()}</h1><p>Explore our exclusive collection of premium ${siteCategory.toLowerCase()}.</p></div><section class="products-container"><div class="collection-grid">${productCardHtml}</div></section><footer><p>&copy; 2026 STYVORA. All Rights Reserved.</p></footer></body></html>`;
  }
  await putGitHubFile(catIndexPath, Buffer.from(htmlContent).toString("base64"), `Update storefront list index for ${siteCategory}`, existingCatFile?.sha);
}

// Main Controller
async function publishToGitHub({ affiliateLink, imageUrl, focusProduct, siteCategory, categoryImageUrl, geminiApiKey, aiBypass, seoTitle, seoDescription, mrp, price, scheduledDate }) {
  // ⚡ 1. UNPACK BUNDLED ROUTING DATA
  let mode = "rss";
  let boardName = "Women's Fashion";
  let actualSiteCategory = siteCategory || "products";

  if (siteCategory && siteCategory.includes("|||")) {
    const parts = siteCategory.split("|||");
    actualSiteCategory = parts[0] || "products";
    mode = parts[1] || "rss";
    boardName = parts[2] || "Women's Fashion";
  }

  // ⚡ 2. INTERCEPT RESET CSV COMMAND (NO API LIMITS WASTED)
  if (mode === "reset_csv") {
    const csvHeader = "Title,Media URL,Pinterest board,Thumbnail,Description,Link,Publish date,Keywords\n";
    const existingCsv = await getGitHubFile("pinterest_bulk.csv");
    await putGitHubFile("pinterest_bulk.csv", Buffer.from(csvHeader).toString("base64"), `Reset Pinterest Bulk CSV Data`, existingCsv?.sha);
    return { title: "CSV Reset Successfully" };
  }

  // ⚡ 3. NORMAL PROCESSING (FOR RSS & CSV UPLOADS)
  const imgRes = await axios.get(imageUrl, { responseType: 'arraybuffer' });
  const imageBase64 = Buffer.from(imgRes.data).toString('base64');
  const imageMimeType = imgRes.headers['content-type'] || 'image/jpeg';

  let content;
  if (aiBypass && seoTitle && seoDescription) {
    // ⚡ AI BYPASS: use pre-written Title/Description straight from the uploaded file, skip Gemini entirely
    content = {
      title: String(seoTitle).replace(/\*/g, "").trim(),
      description: String(seoDescription).replace(/\*/g, "").trim(),
      hashtags: `#${String(actualSiteCategory).replace(/[^a-zA-Z0-9]/g, "")} #Styvora #IndianFashion`,
      altText: String(seoTitle).trim()
    };
  } else {
    content = await generateWithGemini(imageBase64, imageMimeType, focusProduct, geminiApiKey);
  }
  
  const slug = content.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  const categoryFolder = actualSiteCategory.toLowerCase().replace(/[^a-z0-9]+/g, "");
  
  const siteUrl = "https://styvorafashion.com"; 
  const imagePath = `${categoryFolder}/images/${slug}.jpg`;
  const pinImagePath = `${categoryFolder}/images/${slug}-pin.jpg`;
  const pagePath = `${categoryFolder}/${slug}.html`;
  const fullImageUrl = `${siteUrl}/${imagePath}`;
  const fullPinImageUrl = `${siteUrl}/${pinImagePath}`;
  const fullPageUrl = `${siteUrl}/${pagePath}`;

  const priceHtml = formatPriceBlock(mrp, price);
  const priceNum = (() => {
    const n = parseFloat(String(price || "").replace(/[^\d.]/g, ""));
    return isNaN(n) ? null : n;
  })();

  // ⚡ একই slug-এর ফাইল আগে থেকেই থাকলে তার sha নেওয়া হচ্ছে — না নিলে GitHub existing ফাইল
  // overwrite করতে 422 error দেয়। এটা করার ফলে একই প্রোডাক্ট (যেমন সঠিক MRP দিয়ে) আবার
  // publish করলে সেটা নতুন ফাইলের বদলে আগেরটাকেই আপডেট করবে।
  const existingImageFile = await getGitHubFile(imagePath);
  await putGitHubFile(imagePath, imageBase64, `Add/update image for ${categoryFolder}`, existingImageFile?.sha);

  // ⚡ Pinterest-এর জন্য price/MRP/discount টেক্সট বসানো আলাদা একটা graphic —
  // ওয়েবসাইটের নিজের প্রোডাক্ট পেজ/og:image আগের মতোই clean ছবি ব্যবহার করবে
  const pinImageBuffer = await createPinGraphic(Buffer.from(imgRes.data), mrp, price);
  const existingPinImageFile = await getGitHubFile(pinImagePath);
  await putGitHubFile(pinImagePath, pinImageBuffer.toString("base64"), `Add/update Pinterest graphic for ${categoryFolder}`, existingPinImageFile?.sha);

  const html = buildHtml(content.title, content.description, affiliateLink, fullImageUrl, content.hashtags, priceHtml, priceNum, fullPageUrl);
  const existingPageFile = await getGitHubFile(pagePath);
  await putGitHubFile(pagePath, Buffer.from(html).toString("base64"), `Add/update landing page for ${categoryFolder}`, existingPageFile?.sha);

  if (mode === "rss") {
    const itemXml = `  <item>
    <title><![CDATA[${content.title}]]></title>
    <link>${escapeXml(fullPageUrl)}</link>
    <guid>${escapeXml(fullPageUrl)}</guid>
    <description><![CDATA[${content.description} \n\n ${content.hashtags}]]></description>
    <pubDate>${escapeXml(new Date().toUTCString())}</pubDate>
    <enclosure url="${escapeXml(fullPinImageUrl)}" length="1024" type="image/jpeg" />
    <altText><![CDATA[${content.altText || content.title}]]></altText>
  </item>`;

    const existingRss = await getGitHubFile("rss.xml");
    let rssContent = existingRss && existingRss.content.includes("</channel>") 
      ? existingRss.content.replace("</channel>", `${itemXml}\n</channel>`)
      : `<?xml version="1.0" encoding="UTF-8" ?><rss version="2.0"><channel><title>Styvora Collections</title><link>${siteUrl}</link><description>Latest Arrivals</description>${itemXml}</channel></rss>`;

    await putGitHubFile("rss.xml", Buffer.from(rssContent).toString("base64"), `Update RSS feed for ${categoryFolder}`, existingRss?.sha);
  } else if (mode === "csv") {
    const cleanDesc = `${content.description} \n\n ${content.hashtags}`;
    const newCsvRow = `${escapeCsv(content.title)},${escapeCsv(fullPinImageUrl)},${escapeCsv(boardName)},,${escapeCsv(cleanDesc)},${escapeCsv(fullPageUrl)},${escapeCsv(scheduledDate || "")},${escapeCsv(actualSiteCategory)}\n`;

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

  await updateHomepageWithCategory(actualSiteCategory, categoryFolder, categoryImageUrl, geminiApiKey);
  await updateCategoryStorefront(actualSiteCategory, categoryFolder, content.title, fullImageUrl, fullPageUrl);

  return { title: content.title };
}

module.exports = { publishToGitHub };
