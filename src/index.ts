import osuLobby from "./OsuHandler/OsuLobbyBot";
import { Client, GatewayIntentBits } from "discord.js";
import dotenv from "dotenv";
import * as http from "http";
import { MongoClient } from "mongodb";

dotenv.config();

// Setup MongoDB connection URL by replacing the password placeholder with the actual password from environment variables
let MONGO_URL = process.env.MONGO_URL;
MONGO_URL = MONGO_URL?.replace("<db_password>", process.env.MONGO_DB_PASSWORD!);

export const dbClient = new MongoClient(MONGO_URL!);

/**
 * Connects to the MongoDB database.
 */
(async () => {
  console.log("Connecting to database...");
  try {
    await dbClient.connect();
    console.log("Successfully connected to the database!");
  } catch (error) {
    console.error("Database connection failed!", error);
  }
})();

// Define the port from environment variables or use default 3000
const PORT = process.env.PORT || 3000;

/**
 * Create a new Discord client with specific intents for managing guilds, messages, and members.
 */
export const discordClient = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent,
  ],
});

/**
 * Logs the Discord bot in using the token from environment variables.
 * Also, clears all messages in the osu! lobby channel upon startup.
 */
(async () => {
  try {
    await discordClient.login(process.env.DISCORD_BOT_TOKEN);
    console.log("Discord bot logged in successfully.");
    await osuLobby.deleteAllMessagesInOsuLobbyChannel();
    console.log("Cleared osu! lobby channel messages.");
  } catch (error) {
    console.error("Error logging in or clearing osu! lobby messages:", error);
  }
})();

/**
 * Creates a simple HTTP server to respond to uptime monitoring pings.
 * This ensures that the bot stays alive when hosted on platforms like Render.
 */
const server = http.createServer((req, res) => {
  if (req.url === "/ping") {
    // Respond with a JSON message when the /ping route is accessed
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        message: "Bot is active",
        timestamp: new Date().toISOString(),
      })
    );
  } else {
    // Respond with 404 for any other route
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not Found", status: 404 }));
  }
});

// Start the HTTP server on the defined PORT
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT} (Used For Uptime Robot)`);
});

/**
 * Starts the osu! lobby bot.
 */
osuLobby.start();
