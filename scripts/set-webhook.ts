import { readFileSync } from "node:fs";

import { parseDevVars } from "./dev-vars";

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
    return parseDevVars(readFileSync(".dev.vars", "utf8"));
  } catch {
    return {};
  }
}
