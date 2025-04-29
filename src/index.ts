import osuLobby from "./OsuHandler/OsuLobbyBot";
import { Client, GatewayIntentBits } from "discord.js";
import dotenv from "dotenv";
import * as url from "url";
import * as http from "http";

dotenv.config();

const PORT = process.env.PORT || 25565;

const COOLDOWN_MS = 30000; // 30 seconds cooldown

interface PlayerData {
  playerName: string;
  currentDay: number;
  modpackName: string;
  version: string;
  lastActive: number; // Changed from timeout to track timestamp
}

const activePlayers = new Map<string, PlayerData>();

// Cleanup old entries every 5 seconds
setInterval(() => {
  const now = Date.now();
  for (const [playerName, data] of activePlayers.entries()) {
    if (now - data.lastActive > COOLDOWN_MS) {
      activePlayers.delete(playerName);
    }
  }
}, 5000);

//This HTTP server will keep the bot alive, not be shut down by Render
const server = http.createServer((req, res) => {
  const reqUrl = url.parse(req.url || "", true);
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET");
  res.setHeader("Content-Type", "application/json");

  if (req.method == "GET" && req.url === "/ping") {
    console.log("*UPTIME CHECKED");

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        message: `Hello}`,
      })
    );
  } else if (req.method === "POST" && reqUrl.pathname === "/ping") {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });

    req.on("end", () => {
      try {
        const data = JSON.parse(body);
        if (!data.playerName || !data.modpackName || !data.version) {
          res.writeHead(400);
          return res.end(JSON.stringify({ error: "Missing required fields" }));
        }

        const playerData: PlayerData = {
          playerName: data.playerName,
          currentDay: data.currentDay,
          modpackName: data.modpackName,
          version: data.version,
          lastActive: Date.now(), // Track timestamp instead of countdown
        };

        activePlayers.set(data.playerName, playerData);
        console.log(
          `Updated ${data.playerName} | ${activePlayers.size} players total`
        );

        res.writeHead(200);
        res.end(JSON.stringify({ success: true }));
      } catch (e) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: "Invalid JSON" }));
      }
    });
  } else if (req.method === "GET" && reqUrl.pathname === "/players") {
    const players = Array.from(activePlayers.values()).map((p) => ({
      playerName: p.playerName,
      currentDay: p.currentDay,
      modpackName: p.modpackName,
    }));

    res.writeHead(200);
    res.end(
      JSON.stringify({
        count: players.length,
        players,
      })
    );
  } else {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not Found", status: 404 }));
  }
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT} (Used For Uptime Robot)`);
  console.log(`Endpoints:
    POST /ping - Send player heartbeat
    GET /players - Get active players list`);
});

export let discordClient: Client | null = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent,
  ],
});

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
