require("dotenv").config();

const { App } = require("@slack/bolt");
const dns = require("node:dns").promises;
const fs = require("node:fs");
const path = require("node:path");
const net = require("node:net");
const http = require("node:http");
const https = require("node:https");
const { randomUUID } = require("node:crypto");

if (!process.env.SLACK_BOT_TOKEN || !process.env.SLACK_APP_TOKEN) {
  throw new Error("Set SLACK_BOT_TOKEN and SLACK_APP_TOKEN in your .env file.");
}

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  appToken: process.env.SLACK_APP_TOKEN,
  socketMode: true,
});

const stateFile = path.join(__dirname, "bot-data.json");
let savedState = { polls: {}, quizzes: {} };
try {
  savedState = { ...savedState, ...JSON.parse(fs.readFileSync(stateFile, "utf8")) };
} catch (error) {
  if (error.code !== "ENOENT") console.error("Could not read saved bot data.");
}

function saveState() {
  const temporaryFile = `${stateFile}.tmp`;
  fs.writeFileSync(temporaryFile, JSON.stringify(savedState, null, 2), "utf8");
  fs.renameSync(temporaryFile, stateFile);
}

function escapeSlackText(value) {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function reply(respond, text, responseType = "ephemeral") {
  return respond({ response_type: responseType, text: String(text).slice(0, 2900) });
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    signal: AbortSignal.timeout(9000),
    headers: {
      "User-Agent": "StardanceHelper/1.0 (Slack bot)",
      ...(options.headers || {}),
    },
  });
  if (!response.ok) throw new Error("External service returned an error.");
  return response.json();
}

function addCommand(name, handler) {
  app.command(name, async ({ ack, respond, ...context }) => {
    console.log(`Received ${name}`);
    await ack();
    try {
      await handler({ ...context, respond });
    } catch (error) {
      console.error(`${name} failed (${error.name || "Error"}).`);
      await reply(respond, "Sorry, that command hit a problem. Try again in a moment.");
    }
  });
}

function pollBlocks(poll) {
  const votes = Object.values(poll.votes);
  const yes = votes.filter((vote) => vote === "yes").length;
  const no = votes.filter((vote) => vote === "no").length;
  return [
    { type: "section", text: { type: "plain_text", text: `Poll: ${poll.question}` } },
    { type: "section", text: { type: "mrkdwn", text: `✅ Yes: *${yes}*     ❌ No: *${no}*` } },
    {
      type: "actions",
      elements: [
        { type: "button", text: { type: "plain_text", text: "Yes" }, action_id: "sdhelper_poll_vote", value: `${poll.id}|yes`, style: "primary" },
        { type: "button", text: { type: "plain_text", text: "No" }, action_id: "sdhelper_poll_vote", value: `${poll.id}|no`, style: "danger" },
      ],
    },
  ];
}

function quizBlocks(quiz) {
  const blocks = [{ type: "section", text: { type: "plain_text", text: quiz.question } }];
  if (quiz.answered) {
    blocks.push({ type: "section", text: { type: "plain_text", text: quiz.lastResult } });
    return blocks;
  }
  blocks.push({
    type: "actions",
    elements: quiz.choices.map((choice, index) => ({
      type: "button",
      text: { type: "plain_text", text: choice.slice(0, 75) },
      action_id: "sdhelper_trivia_answer",
      value: `${quiz.id}|${index}`,
    })),
  });
  return blocks;
}

function normalizeDomain(input) {
  const raw = String(input || "").trim();
  if (!raw) throw new Error("Enter a domain, such as example.com.");
  const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  if (url.username || url.password || url.port || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("Enter only a domain name, such as example.com.");
  }
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!host || host === "localhost" || !host.includes(".")) {
    throw new Error("Enter a public domain name, such as example.com.");
  }
  return { host, protocol: url.protocol };
}

function isPublicIPv4(address) {
  if (!net.isIPv4(address)) return false;
  const [a, b, c] = address.split(".").map(Number);
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && (b === 168 || b === 0)) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) return false;
  if (a === 203 && b === 0 && c === 113) return false;
  return true;
}

async function checkWebsite(input) {
  const { host, protocol } = normalizeDomain(input);
  const addresses = await dns.lookup(host, { all: true });
  const publicAddress = addresses.find((entry) => isPublicIPv4(entry.address));
  if (!publicAddress) throw new Error("This domain has no public IPv4 address to check.");

  return new Promise((resolve, reject) => {
    const requester = protocol === "http:" ? http : https;
    const request = requester.request({
      hostname: host,
      method: "HEAD",
      path: "/",
      headers: { "User-Agent": "StardanceHelper/1.0 (Slack bot)" },
      lookup: (_hostname, options, callback) => {
        if (options && options.all) callback(null, [{ address: publicAddress.address, family: 4 }]);
        else callback(null, publicAddress.address, 4);
      },
    }, (response) => {
      resolve({ host, protocol, status: response.statusCode, server: response.headers.server || "not disclosed", ip: publicAddress.address });
      response.resume();
    });
    request.setTimeout(7000, () => request.destroy(new Error("Website check timed out.")));
    request.on("error", reject);
    request.end();
  });
}

function weatherDescription(code) {
  if (code === 0) return "Clear sky";
  if ([1, 2, 3].includes(code)) return "Mainly clear to overcast";
  if ([45, 48].includes(code)) return "Fog";
  if ([51, 53, 55, 56, 57].includes(code)) return "Drizzle";
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "Rain";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "Snow";
  if ([95, 96, 99].includes(code)) return "Thunderstorm";
  return "Conditions unavailable";
}

const quotes = [
  "Small progress still counts. — Stardance Helper",
  "Curiosity turns questions into projects. — Stardance Helper",
  "Make something useful, then make it better. — Stardance Helper",
  "A good idea gets stronger when you try it. — Stardance Helper",
  "Start simple. Keep learning. — Stardance Helper",
];
let lastTriviaRequest = 0;

addCommand("/sdhelper-ping", async ({ respond }) => {
  await reply(respond, "Pong! Stardance Helper is responding.");
});

addCommand("/sdhelper-status", async ({ respond }) => {
  await reply(respond, "Stardance Helper is online and ready for commands.");
});

addCommand("/sdhelper-help", async ({ respond }) => {
  await reply(respond, [
    "Stardance Helper commands:",
    "/sdhelper-ping — check that I can respond",
    "/sdhelper-help — show this list",
    "/sdhelper-status — check that I am online",
    "/sdhelper-qotd — get a quote of the day",
    "/sdhelper-trivia — answer a random trivia question",
    "/sdhelper-dadjoke — get a random dad joke",
    "/sdhelper-urban <term> — look up a slang term",
    "/sdhelper-beat [HH:MM or @beat] — convert Swatch Internet Time (HH:MM is UTC)",
    "/sdhelper-search <query> — get a web search link",
    "/sdhelper-userinfo @user — see basic Slack profile info",
    "/sdhelper-poll <question> — create a Yes/No poll in this channel",
    "/sdhelper-remind <time> <task> — schedule a channel reminder (e.g. 10m homework)",
    "/sdhelper-weather <city> — see current weather",
    "/sdhelper-dns <domain> — look up A and MX records",
    "/sdhelper-website <domain> — check the website response",
    "/sdhelper-disify <email> — check disposable-email signals",
    "/sdhelper-ip <ip> — look up public IP information",
  ].join("\n"));
});

addCommand("/sdhelper-qotd", async ({ respond }) => {
  const day = Math.floor(Date.now() / 86400000);
  await reply(respond, quotes[day % quotes.length]);
});

addCommand("/sdhelper-trivia", async ({ command, respond, client }) => {
  if (Date.now() - lastTriviaRequest < 5000) {
    return reply(respond, "Give the trivia service a few seconds before asking for another question.");
  }
  lastTriviaRequest = Date.now();
  const data = await fetchJson("https://opentdb.com/api.php?amount=1&type=multiple&encode=url3986");
  const item = data.results && data.results[0];
  if (!item) return reply(respond, "No trivia question came back. Try again shortly.");
  const decode = (value) => decodeURIComponent(value);
  const choices = [item.correct_answer, ...item.incorrect_answers].map(decode);
  for (let i = choices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [choices[i], choices[j]] = [choices[j], choices[i]];
  }
  const id = randomUUID();
  const quiz = {
    id,
    channel: command.channel_id,
    question: decode(item.question).slice(0, 250),
    choices,
    answer: decode(item.correct_answer),
    answered: false,
  };
  const posted = await client.chat.postMessage({
    channel: command.channel_id,
    text: "Stardance Helper trivia question",
    blocks: quizBlocks(quiz),
  });
  quiz.ts = posted.ts;
  savedState.quizzes[id] = quiz;
  saveState();
  await reply(respond, "I posted a trivia question in this channel—tap an answer to reveal the result.");
});

addCommand("/sdhelper-dadjoke", async ({ respond }) => {
  const joke = await fetchJson("https://icanhazdadjoke.com/", {
    headers: { Accept: "application/json", "User-Agent": "Stardance Helper (Hack Club Slack bot)" },
  });
  await reply(respond, escapeSlackText(joke.joke || "I couldn't find a joke just now."));
});

addCommand("/sdhelper-urban", async ({ command, respond }) => {
  const term = command.text.trim();
  if (!term) return reply(respond, "Usage: /sdhelper-urban <term>");
  const url = `https://api.urbandictionary.com/v0/define?term=${encodeURIComponent(term)}`;
  const data = await fetchJson(url);
  if (!data.list || data.list.length === 0) return reply(respond, `No definition found for “${escapeSlackText(term)}”.`);
  const definition = data.list[0];
  await reply(respond, `Urban Dictionary: ${escapeSlackText(definition.word)}\n${escapeSlackText(definition.definition).slice(0, 1800)}`);
});

addCommand("/sdhelper-beat", async ({ command, respond }) => {
  const input = command.text.trim();
  if (!input) {
    const now = new Date();
    const utcSeconds = now.getUTCHours() * 3600 + now.getUTCMinutes() * 60 + now.getUTCSeconds();
    const beat = Math.floor(((utcSeconds + 3600) % 86400) / 86.4);
    return reply(respond, `It is @${String(beat).padStart(3, "0")} Swatch beats right now.`);
  }
  if (/^@?\d{1,3}$/.test(input)) {
    const beat = Number(input.replace("@", ""));
    if (beat > 999) return reply(respond, "Beat time must be between @000 and @999.");
    const seconds = (beat * 86.4 - 3600 + 86400) % 86400;
    const hours = String(Math.floor(seconds / 3600)).padStart(2, "0");
    const minutes = String(Math.floor((seconds % 3600) / 60)).padStart(2, "0");
    return reply(respond, `@${String(beat).padStart(3, "0")} is approximately ${hours}:${minutes} UTC.`);
  }
  const match = input.match(/^(\d{1,2}):(\d{2})$/);
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) {
    return reply(respond, "Use /sdhelper-beat, /sdhelper-beat 14:30 (UTC), or /sdhelper-beat @600.");
  }
  const seconds = (Number(match[1]) * 3600 + Number(match[2]) * 60 + 3600) % 86400;
  const beat = Math.floor(seconds / 86.4);
  await reply(respond, `${input} UTC is approximately @${String(beat).padStart(3, "0")} Swatch beats.`);
});

addCommand("/sdhelper-search", async ({ command, respond }) => {
  const query = command.text.trim();
  if (!query) return reply(respond, "Usage: /sdhelper-search <query>");
  const url = `https://duckduckgo.com/?q=${encodeURIComponent(query)}`;
  await reply(respond, `Search the web: ${url}`);
});

addCommand("/sdhelper-userinfo", async ({ command, respond, client }) => {
  const text = command.text.trim();
  const mention = text.match(/<@([A-Z0-9]+)(?:\|[^>]+)?>/);
  const idMatch = text.match(/\b([UW][A-Z0-9]{8,})\b/);
  const userId = mention?.[1] || idMatch?.[1];
  if (!userId) return reply(respond, "Usage: /sdhelper-userinfo @user — select a person from Slack's mention suggestions.");
  const result = await client.users.info({ user: userId });
  const user = result.user;
  const name = user.profile?.display_name || user.profile?.real_name || user.name || "Unknown";
  const title = user.profile?.title || "No title listed";
  await reply(respond, `Slack profile\nName: ${escapeSlackText(name)}\nUsername: @${escapeSlackText(user.name || "unknown")}\nTitle: ${escapeSlackText(title)}\nUser ID: ${user.id}`);
});

addCommand("/sdhelper-poll", async ({ command, respond, client }) => {
  const question = command.text.trim();
  if (!question) return reply(respond, "Usage: /sdhelper-poll <question>");
  const id = randomUUID();
  const poll = { id, question: question.slice(0, 240), channel: command.channel_id, votes: {} };
  const posted = await client.chat.postMessage({
    channel: command.channel_id,
    text: "Stardance Helper poll",
    blocks: pollBlocks(poll),
  });
  poll.ts = posted.ts;
  savedState.polls[id] = poll;
  saveState();
  await reply(respond, "Poll created in this channel. Members can change their vote at any time.");
});

addCommand("/sdhelper-remind", async ({ command, respond, client }) => {
  const match = command.text.trim().match(/^(\d+)\s*([smhd])\s+(.+)$/i);
  if (!match) return reply(respond, "Usage: /sdhelper-remind <time> <task> — examples: 10m homework, 2h meeting, 1d project check");
  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();
  const task = match[3].trim();
  const milliseconds = amount * ({ s: 1000, m: 60000, h: 3600000, d: 86400000 }[unit]);
  if (!Number.isFinite(milliseconds) || milliseconds < 60000 || milliseconds > 120 * 86400000) {
    return reply(respond, "Choose a reminder from 1 minute to 120 days from now.");
  }
  const postAt = Math.floor((Date.now() + milliseconds) / 1000);
  await client.chat.scheduleMessage({
    channel: command.channel_id,
    post_at: postAt,
    text: `Reminder for <@${command.user_id}>: ${escapeSlackText(task).slice(0, 700)}`,
  });
  await reply(respond, `Reminder scheduled for ${match[1]}${unit} from now in this channel. Everyone in this channel will be able to see it.`);
});

addCommand("/sdhelper-weather", async ({ command, respond }) => {
  const city = command.text.trim();
  if (!city) return reply(respond, "Usage: /sdhelper-weather <city>");
  const locationUrl = new URL("https://geocoding-api.open-meteo.com/v1/search");
  locationUrl.search = new URLSearchParams({ name: city, count: "1", language: "en", format: "json" });
  const locations = await fetchJson(locationUrl);
  const place = locations.results?.[0];
  if (!place) return reply(respond, `I couldn't find “${escapeSlackText(city)}”. Try adding the country, like “Paris, France”.`);
  const forecastUrl = new URL("https://api.open-meteo.com/v1/forecast");
  forecastUrl.search = new URLSearchParams({
    latitude: String(place.latitude),
    longitude: String(place.longitude),
    current: "temperature_2m,weather_code,wind_speed_10m",
    timezone: "auto",
  });
  const forecast = await fetchJson(forecastUrl);
  const current = forecast.current;
  await reply(respond, `Weather for ${escapeSlackText(place.name)}, ${escapeSlackText(place.country)}\n${weatherDescription(current.weather_code)}\nTemperature: ${current.temperature_2m}°C\nWind: ${current.wind_speed_10m} km/h`);
});

addCommand("/sdhelper-dns", async ({ command, respond }) => {
  const { host } = normalizeDomain(command.text);
  let addresses = [];
  let mailServers = [];
  try { addresses = await dns.resolve4(host); } catch {}
  try { mailServers = await dns.resolveMx(host); } catch {}
  const lines = [`DNS for ${host}`];
  lines.push(addresses.length ? `A records: ${addresses.join(", ")}` : "A records: none found");
  lines.push(mailServers.length ? `Mail servers: ${mailServers.map((entry) => entry.exchange).join(", ")}` : "Mail servers: none found");
  await reply(respond, lines.join("\n"));
});

addCommand("/sdhelper-website", async ({ command, respond }) => {
  const info = await checkWebsite(command.text);
  await reply(respond, `Website check for ${info.host}\nResponse: ${info.status}\nProtocol: ${info.protocol.replace(":", "").toUpperCase()}\nPublic IP checked: ${info.ip}\nServer: ${escapeSlackText(info.server).slice(0, 150)}`);
});

addCommand("/sdhelper-disify", async ({ command, respond }) => {
  const email = command.text.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return reply(respond, "Usage: /sdhelper-disify <email>");
  const body = new URLSearchParams({ email });
  const result = await fetchJson("https://disify.com/api/email", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (typeof result.disposable !== "boolean") return reply(respond, "The email checker couldn't determine whether this address is disposable.");
  const format = result.format === true ? "valid format" : "invalid format";
  const dnsStatus = result.dns === true ? "mail DNS found" : result.dns === false ? "no mail DNS found" : "mail DNS inconclusive";
  const disposable = result.disposable ? "disposable email detected" : "not identified as disposable";
  await reply(respond, `Email check for ${escapeSlackText(email)}\nFormat: ${format}\n${dnsStatus}\nResult: ${disposable}\nThis does not confirm that the mailbox exists.`);
});

addCommand("/sdhelper-ip", async ({ command, respond }) => {
  const ip = command.text.trim();
  if (net.isIP(ip) === 0) return reply(respond, "Usage: /sdhelper-ip <IP address>");
  const data = await fetchJson(`https://ipapi.co/${encodeURIComponent(ip)}/json/`);
  if (data.error) return reply(respond, `IP lookup failed: ${escapeSlackText(data.reason || "address unavailable")}`);
  const location = [data.city, data.region, data.country_name].filter(Boolean).join(", ") || "Location unavailable";
  await reply(respond, `IP lookup for ${escapeSlackText(data.ip || ip)}\nLocation: ${escapeSlackText(location)}\nOrganization: ${escapeSlackText(data.org || "Unavailable")}\nTimezone: ${escapeSlackText(data.timezone || "Unavailable")}`);
});

app.action("sdhelper_poll_vote", async ({ ack, action, body, client, respond }) => {
  await ack();
  try {
    const [id, vote] = String(action.value || "").split("|");
    const poll = savedState.polls[id];
    if (!poll || !["yes", "no"].includes(vote)) return reply(respond, "This poll is no longer available.");
    poll.votes[body.user.id] = vote;
    saveState();
    await client.chat.update({ channel: poll.channel, ts: poll.ts, text: "Stardance Helper poll", blocks: pollBlocks(poll) });
    await reply(respond, "Vote counted. You can change it with either button.");
  } catch (error) {
    console.error(`Poll vote failed (${error.name || "Error"}).`);
    await reply(respond, "Sorry, I couldn't save that vote.");
  }
});

app.action("sdhelper_trivia_answer", async ({ ack, action, body, client, respond }) => {
  await ack();
  try {
    const [id, choiceText] = String(action.value || "").split("|");
    const quiz = savedState.quizzes[id];
    const choiceIndex = Number(choiceText);
    if (!quiz || quiz.answered || !Number.isInteger(choiceIndex) || !quiz.choices[choiceIndex]) {
      return reply(respond, "This trivia question is no longer available.");
    }
    const selected = quiz.choices[choiceIndex];
    quiz.answered = true;
    quiz.lastResult = selected === quiz.answer
      ? `Correct! The answer is ${quiz.answer}.`
      : `Not quite. The answer is ${quiz.answer}.`;
    saveState();
    await client.chat.update({ channel: quiz.channel, ts: quiz.ts, text: "Stardance Helper trivia question", blocks: quizBlocks(quiz) });
  } catch (error) {
    console.error(`Trivia answer failed (${error.name || "Error"}).`);
    await reply(respond, "Sorry, I couldn't record that answer.");
  }
});

(async () => {
  await app.start();
  console.log("Stardance Helper is connected to Slack.");
})();
