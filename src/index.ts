import osuLobby from "./OsuHandler/OsuLobbyBot";
import { Client, GatewayIntentBits } from "discord.js";
import dotenv from "dotenv";
import * as http from "http";
import { Db, MongoClient } from "mongodb";

dotenv.config();

//CONNECT TO MONGODB
let MONGO_URL = process.env.MONGO_URL;
MONGO_URL = MONGO_URL?.replace("<db_password>", process.env.MONGO_DB_PASSWORD!);

export const dbClient = new MongoClient(MONGO_URL!);

async () => {
  console.log("Connecting to database");
  try {
    await dbClient.connect();
    console.log("Successfully Connected!");
  } catch {
    console.log("Connected Fail!");
  }
};

const PORT = process.env.PORT || 3000;

export const discordClient = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent,
  ],
});

//This HTTP server will keep the bot alive, not be shut down by heroku
const server = http.createServer((req, res) => {
  if (req.url === "/ping") {
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

osuLobby.start();

