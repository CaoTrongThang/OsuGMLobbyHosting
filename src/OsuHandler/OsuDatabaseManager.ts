// //TODO VẪN ĐANG LÀM, CƠ BẢN LÀ CHECK, UPDATE, INSERT, HURRY UP https://imgur.com/a/gyOUWoA
// //TODO STILL IN WORKING, NOT USING IN ANYTHING

// import { Collection, Db } from "mongodb";

// import * as Banchojs from "bancho.js";

// type osuPlayerData = {
//   osuId?: string;
//   name?: string;
//   firstJoin?: Date;
//   totalPlayed?: number;
//   totalPlayedScore?: number;
//   totalTopOne?: number;
//   isBanned?: boolean;
//   unbanDate?: Date
//   banReason?: string
// };

// class OsuDatabaseManager {
//   DB: Db | null = null;
//   collection: Collection<osuPlayerData> | null = null;

//   playerList: osuPlayerData[] | null = null;

//   async ConnectToDB() {
//     try {
//       this.DB = dbClient.db(process.env.MONGO_OSU_DB_NAME);
//       this.collection = this.DB.collection(
//         process.env.MONGO_OSU_DB_COLLECTION!
//       );
//     } catch (e) {}
//   }

//   async findPlayerByOsuID(osuPlayer: Banchojs.BanchoLobbyPlayer) {
//     try {
//       if (!this.collection) return;
//       //Find the player in the playerList first, if there's no player the player list, then find the player in the database then push it to the playerList
//       if (!this.playerList) return;
//       if (
//         this.playerList
//           .map((x) => x.osuId)
//           .includes(osuPlayer.user.id.toString())
//       ) {
//         return this.playerList.find(
//           (x) => x.osuId === osuPlayer.user.id.toString()
//         );
//       }
//       const player = await this.collection.findOne({
//         OsuID: osuPlayer.user.id,
//       });
//       if (player) {
//         this.playerList.push(player as osuPlayerData);
//       } else {
//         return null;
//       }
//     } catch (error) {
//       console.error("Error finding player by OsuID:", error);
//       return null;
//     }
//   }

//   async createPlayerInDatabase(osuDoc : osuPlayerData) {
//     try {

//     } catch (error) {

//     }
//   }

//   async updatePlayers() {}
// }

// const osuDatabaseManager = new OsuDatabaseManager();
// osuDatabaseManager.ConnectToDB();
// export default osuDatabaseManager;
