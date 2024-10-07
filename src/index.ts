import osuLobby from "./OsuHandler/OsuLobbyBot";
import { Client, GatewayIntentBits } from "discord.js";
import dotenv from "dotenv";
import * as http from "http";

dotenv.config();

const PORT = process.env.PORT || 25565;

//This HTTP server will keep the bot alive, not be shut down by Render
const server = http.createServer((req, res) => {
  if (req.url === "/ping") {
    console.log("*UPTIME CHECKED");

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        message: `Hello}`,
      })
    );
  } else {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not Found", status: 404 }));
  }
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT} (Used For Uptime Robot)`);
});

export let discordClient: Client | null = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent,
  ],
});

//Hello
(async () => {
  if (process.env.USE_DISCORD?.toLowerCase() == "true") {
    try {
      await discordClient.login(process.env.DISCORD_BOT_TOKEN);
      await osuLobby.deleteAllMessagesInOsuLobbyChannel();
    } catch (e) {
      discordClient = null;
    }
  } else {
    discordClient = null;
  }
  console.error("USE DISCORD:", process.env.USE_DISCORD?.toLowerCase());
})();

osuLobby.start();
