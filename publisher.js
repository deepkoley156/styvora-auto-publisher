const axios = require("axios");
const FormData = require("form-data");

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

// 🚀 STABILITY AI MODEL SWAP LOGIC
async function processModelSwap(originalImageUrl, imageAiKey) {
  if (!imageAiKey) {
    console.log("No Image AI Key provided. Skipping model swap.");
    return { isBase64: false, url: originalImageUrl };
  }

  console.log(`Downloading original image for AI processing: ${originalImageUrl}`);
  try {
    // 1. Flipkart link থেকে আসল ছবি ডাউনলোড করা
    const imageRes = await axios.get(originalImageUrl, { responseType: 'arraybuffer' });
    
    console.log("Sending image to Stability AI for model swap...");
    const formData = new FormData();
    formData.append('init_image', Buffer.from(imageRes.data), 'image.jpg');
    formData.append('init_image_mode', 'IMAGE_STRENGTH');
    formData.append('image_strength', 0.35); // 0.35 মানে ড্রেস একই থাকবে, কিন্তু মডেল/ব্যাকগ্রাউন্ড পাল্টে যাবে
    formData.append('text_prompts[0][text]', "indian beautiful white skin tone young girl wearing the dress, highly detailed, photorealistic fashion model, cinematic lighting, 1024x1536 frame resolution");
    formData.append('text_prompts[0][weight]', 1);

    // 2. Stability AI-তে ছবি ও প্রম্পট পাঠানো
    const aiResponse = await axios.post(
      'https://api.stability.ai/v1/generation/stable-diffusion-xl-1024-v1-0/image-to-image',
      formData,
      {
        headers: {
          ...formData.getHeaders(),
          Accept: 'application/json',
          Authorization: `Bearer ${imageAiKey}`
        }
      }
    );

    // 3. নতুন জেনারেট হওয়া ছবিটি রিসিভ করা
    if (aiResponse.data && aiResponse.data.artifacts && aiResponse.data.artifacts.length > 0) {
       console.log("✅ Model swap successful!");
       return { isBase64: true, base64: aiResponse.data.artifacts[0].base64, mimeType: 'image/jpeg' };
    }
  } catch (err) {
    console.error("❌ Model swap failed. Using original image. Error:", err.response ? err.response.data : err.message);
  }
  
  // এআই ফেল করলে যেন সিস্টেম থেমে না যায়, তাই অরিজিনাল ছবি পাঠিয়ে দেওয়া হবে
  return { isBase64: false, url: originalImageUrl };
}

async function generateWithGemini(imageBase64, imageMimeType, focusProduct, geminiApiKey) {
  const prompt = `
  You are an expert Pinterest marketer for women's fashion. Primary focus: ${focusProduct}.
  CRITICAL RULE: If jewelry, explicitly describe it as artificial or gold-plated. Never as real gold.
  Return valid JSON: {"title": "catchy", "description": "2 lines description", "hashtags": "#tag1", "altText": "Visual details"}`;

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

async function publishToGitHub({ affiliateLink, imageUrl, focusProduct, geminiApiKey, imageAiKey }) {
  
  // 1. Process Model Swap
  const finalImageInfo = await processModelSwap(imageUrl, imageAiKey);

  let imageBase64;
  let imageMimeType;

  // এআই দিয়ে তৈরি ছবি হলে সরাসরি Base64 নেবে, নাহলে লিংকের ছবি ডাউনলোড করবে
  if (finalImageInfo.isBase64) {
    imageBase64 = finalImageInfo.base64;
    imageMimeType = finalImageInfo.mimeType;
  } else {
    const imgRes = await axios.get(finalImageInfo.url, { responseType: 'arraybuffer' });
    imageBase64 = Buffer.from(imgRes.data).toString('base64');
    imageMimeType = imgRes.headers['content-type'] || 'image/jpeg';
  }

  // 2. Gemini AI দিয়ে টাইটেল ও ডেসক্রিপশন তৈরি
  const content = await generateWithGemini(imageBase64, imageMimeType, focusProduct, geminiApiKey);
  const slug = content.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  
  const siteUrl = `https://${process.env.GITHUB_USERNAME}.github.io/${process.env.GITHUB_REPO}`;
  const imagePath = `images/${slug}.jpg`;
  const pagePath = `${slug}.html`;

  // 3. GitHub-এ আপলোড
  await putGitHubFile(imagePath, imageBase64, `Add image ${slug}`);
  const html = buildHtml(content.title, content.description, affiliateLink, `${siteUrl}/${imagePath}`, content.hashtags);
  await putGitHubFile(pagePath, Buffer.from(html).toString("base64"), `Add landing page ${slug}`);

  // 4. RSS Feed আপডেট
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
