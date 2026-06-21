const { TelegramClient } = require("telegram");
const { StringSession } = require("telegram/sessions");

const apiId = Number(process.env.API_ID);
const apiHash = process.env.API_HASH;
const telegramSession = process.env.TELEGRAM_SESSION;

const stringSession = new StringSession(telegramSession);
const client = new TelegramClient(stringSession, apiId, apiHash, { connectionRetries: 5 });

let initialized = false;

async function initTelegramClient() {
  if (initialized) return client;
  await client.connect();
  initialized = true;
  console.log("Telegram Client Connected");
  return client;
}

function extractLink(text) {
  const match = String(text || "").match(/(https?:\/\/(?:fkrt\.co|fktr\.co|flipkart\.com)[^\s]+)/i);
  return match ? match[1] : null;
}

async function sendLinkToBot(productUrl) {
  await initTelegramClient();
  const botUsername = process.env.BOT_USERNAME || "ExtraPeBot";
  
  await client.sendMessage(botUsername, { message: productUrl });
  console.log("Link sent to bot, waiting for reply...");

  const start = Date.now();
  // ৪৫ সেকেন্ড পর্যন্ত বটের রিপ্লাইয়ের জন্য ওয়েট করবে
  while (Date.now() - start < 45000) {
    const messages = await client.getMessages(botUsername, { limit: 5 });
    for (const msg of messages) {
      if (msg.out) continue;
      const link = extractLink(msg.message);
      if (link) return { affiliateLink: link };
    }
    await new Promise(r => setTimeout(r, 3000));
  }
  throw new Error("Telegram bot timeout. No affiliate link received.");
}

module.exports = { initTelegramClient, sendLinkToBot };

