import osuLobby from "./OsuHandler/OsuLobbyBot";
import { Client, GatewayIntentBits } from "discord.js";
import dotenv from "dotenv";
import * as http from "http";
import { MongoClient } from "mongodb";
import osuAPIRequest from "./OsuHandler/OsuAPI";
import { log } from "console";

dotenv.config();

// //CONNECT TO MONGODB
// let MONGO_URL = process.env.MONGO_URL;
// MONGO_URL = MONGO_URL?.replace("<db_password>", process.env.MONGO_DB_PASSWORD!);

// export const dbClient = new MongoClient(MONGO_URL!);

// async () => {
//   console.log("Connecting to database");
//   try {
//     await dbClient.connect();
//     console.log("Successfully Connected!");
//   } catch {
//     console.log("Connected Fail!");
//   }
// };

const PORT = process.env.PORT || 3000;

//This HTTP server will keep the bot alive, not be shut down by Render
const server = http.createServer((req, res) => {
  if (req.url === "/ping") {
    console.log("*UPTIME CHECKED");

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        message: "Bot is active",
        timestamp: new Date().toISOString(),
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
  console.error("USE AI:", process.env.USE_DISCORD?.toLowerCase());
})();

osuLobby.start();
