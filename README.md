# Osu! Hosting Lobby with AI Management

![image](https://github.com/user-attachments/assets/37538fd3-34ea-4687-a803-c64369b0ad70)

## Overview

This project is an advanced Osu! Hosting Lobby that uses AI to efficiently manage the lobby. The AI mostly will help players to use command. Additionally, it integrates with Discord, sending real-time updates about the lobby's status via embeds. Whether you're hosting a casual lobby or a competitive match, this project ensures everything runs smoothly.

## Features (Because this mostly automatic so no much things you need to do)

- **AI-Powered Lobby Management**: Automates lobby tasks, reducing the need for manual intervention.
- **Change Difficulty Base On The Median**: Change the lobby's difficulty base on the players in the room.
- **Real-Time Discord Integration**: Sends live updates to a specified Discord channel, keeping everyone informed.
- **Flexible Game Modes**: Easily switch between "Host Rotate" and "Random Map" modes.
- **Player Commands**: A variety of commands that players can use to interact with the lobby.

## Commands

### Player Commands

- **`rhelp`**: Displays all available commands for players.
- **`votechangemode`**: Switches the lobby's mode between "Host Rotate" and "Random Map".
- **`voteskipmap`**: Skips the current map.
- **`voteskiphost`**: Skips the current host.
- **`voteabortmatch`**: Aborts the current match.
- **`votestartmatch`**: Starts the match.
- **`timeleft`**: Displays the time left in the current match, if it's in progress.

### System Functions (This Is Only For AI To Use)

- **`kickplayer`**: Kicks a player from the lobby.
- **`moveplayertoslot`**: Moves a player to a specific slot (1-16).
- **`getfivebeatmapsinbeatmaphistory`**: Retrieves the last 5 played beatmaps in the lobby.

### Admin Functions

- **`closelobby`**: Closes the lobby.
- **`kickplayer`**: Kick a players from the lobby.
- **`banplayer`**: bans a player from the lobby.

## Environment Variables

Create a `.env` file in the root of your project and configure the following environment variables:

```env
GROQ_API_KEYS = "sda1233 1231443fd 12314gv" //Should create at least 3 accounts on GROQ to get 3 API keys, i mean if you don't want to pay
AI_REPLY_COOLDOWN_SECONDS = "5" //If you're using a free account, so this will be depended on how many API Keys you have, if you only have 1 (which mean 6k tokens), you should change this to like 20

DISCORD_BOT_TOKEN = "your_discord_bot_token"
DISCORD_BOT_ID = "your_discord_bot_id"

DISCORD_GUILD_ID = "your_discord_guild_id"
DISCORD_OSU_LOBBY_STATS_CHANNEL_ID = "your_discord_osu_lobby_stats_channel_id"

MONGO_URL = "your_mongo_url"
MONGO_DB_PASSWORD = "your_mongo_db_password"
MONGO_OSU_DB_NAME = "OsuLobbyData"
MONGO_OSU_DB_COLLECTION = "OsuPlayerData"

OSU_ADMIN_IDs = "123124 342351"
OSU_IRC_PORT=6667
OSU_IRC_USERNAME="your_osu_irc_username"
OSU_IRC_PASSWORD="your_osu_irc_password"
OSU_API_KEY="your_osu_api_key"
```

## Getting Started

### Prerequisites

- Node.js (v14+)
- MongoDB
- A Discord bot token
- Osu! IRC password

### Installation (Only 4 Steps)

1. Clone the repository:

   ```bash
   git clone https://github.com/yourusername/osu-hosting-lobby.git
   cd osu-hosting-lobby
   ```

2. Install the dependencies:

   ```bash
   npm install
   ```

3. Set up the environment variables by copying the `.env.example` file to `.env` and filling in the required values:

   ```bash
   cp .env.example .env
   ```

4. Start the bot:

   ```bash
   npm start dev
   ```

## Usage

Once the bot is running, it will automatically join your specified Osu! lobby and begin managing it. Players can use the provided commands to interact with the lobby, and admins can use the admin functions to control the lobby.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Contact

For any inquiries or support, please reach out to [your email address].

---

## [Our Discord For Pull Requests Or Your Ideas, Enjoy your automated Osu! lobby experience!](https://discord.gg/game-mlem-686218489396068373)

<a href="https://discord.gg/game-mlem-686218489396068373">
  <img src="https://static-00.iconduck.com/assets.00/discord-icon-256x256-sp1mmakp.png" alt="Discord" width="64" height="64">
</a>

Me and my mate are playing visual studio code right here :>
![image](https://github.com/user-attachments/assets/40e49783-031b-4bee-8985-acb789e98c4a)

