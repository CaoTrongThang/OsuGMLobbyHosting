# Osu! Hosting Lobby with AI Management

![image](https://github.com/user-attachments/assets/37538fd3-34ea-4687-a803-c64369b0ad70)

## Overview

This project is an advanced Osu! Hosting Lobby that uses AI to efficiently manage the lobby. The AI mostly will help players to use command. Additionally, it integrates with Discord, sending real-time updates about the lobby's status via embeds. Whether you're hosting a casual lobby or a competitive match, this project ensures everything runs smoothly.

## Features (Since this bot is mostly automated, there isn’t much you need to do)

- **AI-Powered Lobby Management**: Automates lobby tasks, reducing the need for manual intervention.
- **Change Difficulty Base On The Median**: Change the lobby's difficulty base on the players in the room.
- **Change Beatmap By ID Or Link Or Itself**: A variety of commands that players can use to interact with the lobby.
- **Get Last Matches Data Of The Lobby**: A variety of commands that players can use to interact with the lobby.
- **Get Stats, Recent Play**: A variety of commands that players can use to interact with the lobby.
- **Get Last Matches Data Of The Lobby**: A variety of commands that players can use to interact with the lobby.
- **Real-Time Discord Integration**: Sends live updates to a specified Discord channel, keeping everyone informed.
- **Flexible Game Modes**: Easily switch between "Host Rotate" and "Random Map" modes.
- **Player Commands**: A variety of commands that players can use to interact with the lobby.
- **... Many more**

## Commands

### Player Commands

- **`rhelp`**: Displays all available commands for players.
- **`votechangemode`**: Switches the lobby's mode between "Host Rotate" and "Random Map".
- **`voteskipmap`**: Skips the current map.
- **`voteskiphost`**: Skips the current host.
- **`voteabortmatch`**: Aborts the current match.
- **`votestartmatch`**: Starts the match.
- **`fastlink`**: Gets the faster links of the beatmap.
- **`timeleft`**: Displays the time left in the current match, if it's in progress.

### System Functions (This Is Only For AI To Use)

- **`kickplayer`**: Kicks a player from the lobby.
- **`moveplayertoslot`**: Moves a player to a specific slot (1-16).
- **`startmatchafter`**: start match after seconds if half players are ready, usually 30s.
- **...Many more**

### Admin Functions

- **`closelobby`**: Closes the lobby.
- **`kickplayer`**: Kick a players from the lobby.
- **`banplayer`**: bans a player from the lobby. (todo)
- **...Many more**

## Environment Variables

Create a `.env` file in the root of your project and configure the following environment variables:

```env
USE_AI = false //if the USE_AI is false, you don't need to worry about any AI things down here
HUGGING_FACE_API_KEY = "KEY HERE, MUST BE A PRO VERSION OF HUGGING FACE, or you can try to change the AI and change way the function chatWithAI worth"
AI_MODEL = "meta-llama/Meta-Llama-3.1-70B-Instruct" //The model of the AI on Hugging Face, lot of them can't be used, choose wisely
AI_REPLY_COOLDOWN_SECONDS = "7" //I don't know what's the limit of HUGGING FACE so i'll just leave 7 here

LOBBY_PASSWORD = "NONE"

USE_DISCORD = false
DISCORD_BOT_TOKEN = ""
DISCORD_BOT_ID = "984240904871219200"
DISCORD_GUILD_ID = ""
DISCORD_OSU_LOBBLY_STATS_CHANNEL_ID = ""

# MONGO_URL = ""
# MONGO_DB_PASSWORD = ""
# MONGO_OSU_DB_NAME = "OsuLobbyData"
# MONGO_OSU_DB_COLLECTION = "OsuPlayerData"

OSU_ADMIN_IDs = "NONE"

OSU_IRC_PORT=6667
OSU_IRC_USERNAME="ThangProVip"
OSU_IRC_PASSWORD="ea637f54"
OSU_LEGACY_API_KEY="56c959df9e054e9543994054fcb2e6fb7f22f4d8"
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

Testers:

- Me
- Rot4tion
- TinsLevis
- Ripuli
- Revoken
- You are mine
- CkoCon
- Final_Zelix
- picco
- Andirus
- dasher1505
- ... And some players joined the lobby to play but never gotten to play
