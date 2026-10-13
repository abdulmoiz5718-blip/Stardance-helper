# Stardance Helper

Stardance Helper is a Slack bot for the Hack Club workspace. It brings quick utilities, fun commands, and simple channel interactions together under the `/sdhelper-` command prefix.

## What it can do

### Bot basics

| Command | What happens |
| --- | --- |
| `/sdhelper-help` | Shows the command list. |
| `/sdhelper-ping` | Replies with “Pong!” to confirm the bot is responding. |
| `/sdhelper-status` | Reports whether the bot is online and ready. |

### Fun and discovery

| Command | What happens |
| --- | --- |
| `/sdhelper-qotd` | Shows a quote selected for the current day. |
| `/sdhelper-trivia` | Posts a multiple-choice trivia question in the channel. Choose an answer button to reveal the result. |
| `/sdhelper-dadjoke` | Fetches and shares a random dad joke. |
| `/sdhelper-urban <term>` | Looks up a term in Urban Dictionary. |
| `/sdhelper-beat` | Shows the current Swatch Internet Time. You can also convert a UTC time or beat, such as `/sdhelper-beat 14:30` or `/sdhelper-beat @600`. |

### Slack and everyday tools

| Command | What happens |
| --- | --- |
| `/sdhelper-search <query>` | Creates a DuckDuckGo search link for your query. |
| `/sdhelper-userinfo @user` | Shows basic profile information for a selected Slack user. |
| `/sdhelper-poll <question>` | Posts a Yes/No poll in the current channel. Members vote with buttons and the totals update. |
| `/sdhelper-remind <time> <task>` | Schedules a reminder in the current channel, for example `/sdhelper-remind 10m finish homework` or `/sdhelper-remind 2h meeting`. Times can be from 1 minute to 120 days ahead. |
| `/sdhelper-weather <city>` | Shows current weather for a city in Celsius. Add a country if the city name is ambiguous. |

### Web and network lookups

| Command | What happens |
| --- | --- |
| `/sdhelper-dns <domain>` | Looks up a domain’s IPv4 and mail-server DNS records. |
| `/sdhelper-website <domain>` | Checks a website’s response and reports its status and public IP. |
| `/sdhelper-disify <email>` | Checks email format, mail-DNS signals, and whether the address appears disposable. It cannot confirm that an inbox exists. |
| `/sdhelper-ip <ip>` | Looks up approximate location, organization, and timezone for a public IP address. |

## How it works

1. A user enters a `/sdhelper-...` command in Slack.
2. Slack sends the command to Stardance Helper through **Socket Mode**, a WebSocket connection. This means the bot does not need a public web address to receive commands.
3. Slack Bolt routes the command to its matching handler. The handler acknowledges it promptly, then replies or performs the requested action.
4. Simple replies are sent privately in Slack to the person who ran the command. Trivia, polls, and reminders appear in the channel so members can participate or see them.
5. When needed, the bot fetches information from a third-party service, such as a weather or trivia API, and formats the result for Slack.

Poll and trivia buttons are handled as Slack interactions. The bot saves their current state in `bot-data.json`, allowing votes and answers to update the original message. Reminder delivery is scheduled through Slack.

## Example

```text
/sdhelper-weather Karachi

Weather for Karachi, Pakistan
Clear sky
Temperature: 29°C
Wind: 11 km/h
```

The exact result depends on current weather data.

## Services and privacy

Some commands send their input to third-party services to get a result:

- Trivia questions come from the [Open Trivia Database](https://opentdb.com/).
- Dad jokes come from [icanhazdadjoke](https://icanhazdadjoke.com/).
- Urban Dictionary lookups use [Urban Dictionary](https://www.urbandictionary.com/). Its definitions are user-submitted and may include offensive content.
- Weather lookups use [Open-Meteo](https://open-meteo.com/).
- Email checks send the entered address to [DISIFY](https://docs.disify.com/). They check signals but cannot confirm that an inbox exists.
- IP lookups send the entered address to [ipapi.co](https://ipapi.co/). Location results are approximate.
- Search creates a [DuckDuckGo](https://duckduckgo.com/) link; it does not retrieve search results inside Slack.

Polls, trivia questions, and reminders are visible in the channel where they are used. Invite Stardance Helper to a channel before using these features there. Other command replies are private to the person who invoked them.

## Built with

- JavaScript and Node.js
- [Slack Bolt for JavaScript](https://slack.dev/bolt-js/)
- Slack Socket Mode
- Hosted on Hack Club Nest

The bot’s commands and interactions are implemented in [`index.js`](index.js). Its runtime dependencies are listed in [`package.json`](package.json).



