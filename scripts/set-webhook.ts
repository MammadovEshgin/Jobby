import { readFileSync } from "node:fs";

const webhookUrl = process.argv[2] ?? process.env.WEBHOOK_URL;
const vars = loadDevVars();
const botToken = process.env.BOT_TOKEN ?? vars.BOT_TOKEN;
const webhookSecret = process.env.WEBHOOK_SECRET ?? vars.WEBHOOK_SECRET;

if (webhookUrl === undefined || webhookUrl.length === 0) {
  throw new Error("WEBHOOK_URL is required. Usage: npm run set-webhook -- https://<worker-url>");
}

if (botToken === undefined || botToken.length === 0) {
  throw new Error("BOT_TOKEN is required in environment or .dev.vars.");
}

if (webhookSecret === undefined || webhookSecret.length === 0) {
  throw new Error("WEBHOOK_SECRET is required in environment or .dev.vars.");
}

const response = await fetch(`https://api.telegram.org/bot${botToken}/setWebhook`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    url: webhookUrl,
    secret_token: webhookSecret,
    allowed_updates: ["message", "callback_query"],
    drop_pending_updates: false,
  }),
});

const payload = (await response.json()) as { ok?: boolean; description?: string };

if (!response.ok || payload.ok !== true) {
  throw new Error(`setWebhook failed: ${payload.description ?? `HTTP ${response.status}`}`);
}

console.log("Telegram webhook configured.");

function loadDevVars(): Record<string, string> {
  try {
    return Object.fromEntries(
      readFileSync(".dev.vars", "utf8")
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0 && !line.startsWith("#"))
        .map((line) => {
          const index = line.indexOf("=");
          const key = line.slice(0, index).trim();
          const value = line.slice(index + 1).trim().replace(/^"(.*)"$/, "$1");
          return [key, value];
        }),
    );
  } catch {
    return {};
  }
}
