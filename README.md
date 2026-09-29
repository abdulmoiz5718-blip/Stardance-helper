# Stardance Helper

A Slack bot with the commands from the reference screenshot, using JavaScript, Slack Bolt, and Socket Mode.

## Commands

| Command | What it does |
| --- | --- |
| `/sdhelper-ping` | Confirms the bot responds. |
| `/sdhelper-help` | Lists commands and usage. |
| `/sdhelper-status` | Confirms the bot is online. |
| `/sdhelper-qotd` | Shows a quote of the day. |
| `/sdhelper-trivia` | Posts a trivia question with answer buttons. |
| `/sdhelper-dadjoke` | Fetches a dad joke. |
| `/sdhelper-urban <term>` | Looks up a slang term. |
| `/sdhelper-beat [HH:MM or @beat]` | Converts Swatch Internet Time; clock times are UTC. |
| `/sdhelper-search <query>` | Returns a DuckDuckGo search link. |
| `/sdhelper-userinfo @user` | Shows a Slack user's basic profile. |
| `/sdhelper-poll <question>` | Posts a Yes/No poll with buttons in the current channel. |
| `/sdhelper-remind <time> <task>` | Schedules a channel reminder, e.g. `10m homework` or `2h meeting`. |
| `/sdhelper-weather <city>` | Shows current weather in Celsius. |
| `/sdhelper-dns <domain>` | Looks up A and MX records. |
| `/sdhelper-website <domain>` | Checks the website's response without following redirects. |
| `/sdhelper-disify <email>` | Checks email format, mail DNS, and disposable-email signals. |
| `/sdhelper-ip <ip>` | Looks up approximate location and network details for an IP address. |

Use the `sdhelper` prefix consistently to reduce command-name conflicts in the Hack Club workspace.

## 1. Update the Slack app

Open [Slack API: Your Apps](https://api.slack.com/apps), choose **Stardance Helper**, then:

1. Under **OAuth & Permissions → Bot Token Scopes**, add `users:read`. The app already needs `commands` and `chat:write`.
2. Click **Reinstall to Hack Club** and approve the updated permission.
3. Under **Basic Information → App-Level Tokens**, make sure Socket Mode has an app token with `connections:write`. Keep this `xapp-` token private.
4. In **Slash Commands**, create the commands from the table above. Use each command name exactly as written. For Socket Mode, a public Request URL is not needed.
5. If Slack shows an **Interactivity & Shortcuts** toggle, enable it so trivia and poll buttons can work. Socket Mode receives button clicks over its WebSocket connection.
6. In your private test channel, invite the bot by typing `/invite @Stardance Helper`. This lets it post polls, trivia questions, and scheduled reminders there.

When Slack gives you a refreshed `xoxb-` Bot User OAuth Token, update `SLACK_BOT_TOKEN` in your private `.env` file. Never send tokens in chat or commit them to GitHub.

## 2. Run it locally

Open a terminal in this folder. Install Node.js LTS from [nodejs.org](https://nodejs.org/) if needed, then run:

```powershell
npm install
```

If you have not already created the private token file, copy the example and edit it:

```powershell
Copy-Item .env.example .env
notepad .env
```

Put your current tokens in `.env`:

```text
SLACK_BOT_TOKEN=xoxb-your-bot-token
SLACK_APP_TOKEN=xapp-your-app-token
```

Start the bot:

```powershell
npm start
```

Keep the terminal open while testing. Try all commands in `#sdhelper-test` or `#bot-spam`, not `#stardance`. Stop the bot with **Ctrl+C** before making code changes or moving it to Nest.

## Notes about outside services and privacy

- Trivia questions come from [Open Trivia Database](https://opentdb.com/api_config.php); dad jokes come from [icanhazdadjoke](https://icanhazdadjoke.com/api); weather uses [Open-Meteo](https://open-meteo.com/en/docs).
- The Urban Dictionary command uses user-submitted definitions, which may include offensive content.
- `/sdhelper-disify` sends the entered email address to [DISIFY](https://docs.disify.com/guide/introduction.html). It checks signals only; it cannot prove an inbox exists.
- IP lookup sends the entered IP to [ipapi.co](https://ipapi.co/api/); geolocation is approximate.
- Polls and reminder messages appear in the channel. The bot must be a member of that channel. Reminder times are relative to when you run the command, and Slack schedules them for up to 120 days ahead.
- Search returns a DuckDuckGo link; it does not fetch search results inside Slack.
- Poll and quiz state is saved in `bot-data.json`, which is excluded from GitHub. If you delete that file, old poll buttons stop working.

## 3. Push to GitHub safely

Create an empty GitHub repository and follow GitHub's instructions to push this folder. `.gitignore` excludes `.env`, `node_modules`, and bot state. Before pushing, make sure `.env` is not listed among the files to upload.

## 4. Keep it online with Hack Club Nest

Apply for an account in the [Hack Club Dashboard](https://dashboard.hackclub.app/) if needed. The [Nest Quickstart](https://guides.hackclub.app/index.php/Quickstart) explains approval and SSH access. Connect as your Nest username; do not assume root access.

On Nest, clone your repository and install the packages:

```sh
git clone YOUR_REPOSITORY_URL
cd stardance-helper
npm install
```

Create a private `.env` on Nest with the same current tokens and run `chmod 600 .env`. Do not put tokens in GitHub. Start with `npm start` and check the commands.

To stay online after disconnecting and restart after a reboot, configure a persistent service method that Nest permits for your account. A user-level systemd service may work, but boot-time autostart can require administrator-enabled user lingering. Do not use `sudo` or a root service. If Nest does not allow user services/lingering, ask in `#nest-help` for its supported persistent-process setup.
