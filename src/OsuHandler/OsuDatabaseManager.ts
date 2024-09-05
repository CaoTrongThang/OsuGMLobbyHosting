import { Collection, Db } from "mongodb";
import { dbClient } from "..";
import * as Banchojs from "bancho.js";

type OsuPlayerData = {
  osuId?: string;
  name?: string;
  firstJoin?: Date;
  totalPlayed?: number;
  totalPlayedScore?: number;
  totalTopOne?: number;
  isBanned?: boolean;
  banReason?: string;
};

class OsuDatabaseManager {
  private db: Db | null = null;
  private collection: Collection<OsuPlayerData> | null = null;
  private playerList: OsuPlayerData[] | null = null;

  /**
   * Connects to the MongoDB database and initializes the collection.
   */
  async connectToDB(): Promise<void> {
    try {
      this.db = dbClient.db(process.env.MONGO_OSU_DB_NAME || "");
      this.collection = this.db.collection(
        process.env.MONGO_OSU_DB_COLLECTION || ""
      );
      this.playerList = []; // Initialize playerList to avoid null checks
    } catch (error) {
      console.error("Error connecting to the database:", error);
    }
  }

  /**
   * Finds a player by their OSU ID. First checks the in-memory player list, then the database if necessary.
   * @param osuPlayer - The player to find.
   * @returns The player data or null if not found.
   */
  async findPlayerByOsuID(osuPlayer: Banchojs.BanchoLobbyPlayer): Promise<OsuPlayerData | null> {
    try {
      if (!this.collection) {
        console.warn("Database collection not initialized.");
        return null;
      }

      // Check the in-memory player list first
      if (this.playerList) {
        const playerFromList = this.playerList.find(
          (x) => x.osuId === osuPlayer.user.id.toString()
        );
        if (playerFromList) {
          return playerFromList;
        }
      }

      // Fetch from database if not found in the player list
      const player = await this.collection.findOne({
        osuId: osuPlayer.user.id.toString(),
      });

      if (player) {
        // Add to in-memory player list
        if (this.playerList) {
          this.playerList.push(player as OsuPlayerData);
        }
        return player as OsuPlayerData;
      }

      return null;
    } catch (error) {
      console.error("Error finding player by OSU ID:", error);
      return null;
    }
  }

  /**
   * Creates a new player record in the database.
   * @param osuDoc - The player data to insert.
   */
  async createPlayerInDatabase(osuDoc: OsuPlayerData): Promise<void> {
    try {
      if (!this.collection) {
        console.warn("Database collection not initialized.");
        return;
      }
      await this.collection.insertOne(osuDoc);
      // Optionally add to the in-memory player list if needed
      if (this.playerList) {
        this.playerList.push(osuDoc);
      }
    } catch (error) {
      console.error("Error creating player in the database:", error);
    }
  }

  /**
   * Updates existing player records in the database.
   * This method should be implemented based on specific update requirements.
   */
  async updatePlayers(): Promise<void> {
    try {
      if (!this.collection) {
        console.warn("Database collection not initialized.");
        return;
      }
      // Implement the update logic as needed
    } catch (error) {
      console.error("Error updating players:", error);
    }
  }
}

const osuDatabaseManager = new OsuDatabaseManager();
osuDatabaseManager.connectToDB().catch((error) => {
  console.error("Error during database connection:", error);
});

export default osuDatabaseManager;
