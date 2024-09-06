// import { ColorResolvable, EmbedBuilder, Message, TextChannel } from "discord.js";
// import { discordClient } from "..";
// import * as Banchojs from "bancho.js"
// import utils from "../Utils";
// import { Beatmap } from "./OsuAPI";
// import osuLobby, { PlayerChatHistory } from "./OsuLobbyBot";
// import * as dotenv from "dotenv"

// dotenv.config()

// class DiscordEmbed{
//     embedMessage: Message | null = null;
    
//     async updateOsuEmbed() {
//       try {
//         const channel = (await discordClient.channels.fetch(
//           process.env.DISCORD_OSU_LOBBY_STATS_CHANNEL_ID || ""
//         )) as TextChannel;
  
//         if (!channel) {
//           console.log(
//             `${process.env.DISCORD_OSU_LOBBLY_STATS_CHANNEL_ID} is not a valid channel id`
//           );
//           return;
//         }
  
//         let playersStr = "";
//         let slotIndex = 0;
//         for (const slot of osuLobby.osuChannel?.lobby.slots || []) {
//           if (slot) {
//             if (slot.user) {
//               if (osuLobby.osuChannel?.lobby.getPlayerSlot(slot) == slotIndex) {
//                 if (slot.user.id == osuLobby.currentHost?.user.id) {
//                   playersStr += `:yellow_square: **[${
//                     slot.user.username.length > 10
//                       ? slot.user.username.slice(0, 8) + "..."
//                       : slot.user.username
//                   } #${utils.formatNumber(
//                     slot.user.ppRank
//                   )}](${`https://osu.ppy.sh/users/${slot.user.id}`})**\n`;
//                 } else {
//                   playersStr += `:green_square: **[${
//                     slot.user.username.length > 10
//                       ? slot.user.username.slice(0, 10) + "..."
//                       : slot.user.username
//                   } #${utils.formatNumber(
//                     slot.user.ppRank
//                   )}](${`https://osu.ppy.sh/users/${slot.user.id}`})**\n`;
//                 }
//                 slotIndex++;
//               } else {
//                 playersStr += ":black_large_square:\n";
//                 slotIndex++;
//               }
//             }
//           } else {
//             playersStr += ":black_medium_square:\n";
//             slotIndex++;
//           }
//         }
  
//         if (playersStr == "") {
//           playersStr = "No players in the lobby";
//         }
  
//         let beatmapStr = `[${osuLobby.currentBeatmap?.title}(${Number(
//             osuLobby.currentBeatmap?.difficultyrating
//         ).toFixed(2)}*) - ${osuLobby.currentBeatmap?.artist} - ${utils.formatSeconds(
//           Number(osuLobby.currentBeatmap?.total_length)
//         )} - ${osuLobby.currentBeatmap?.bpm} BPM - ${Number(
//             osuLobby.currentBeatmap?.diff_approach
//         )} AR- ${Number(
//             osuLobby.currentBeatmap?.diff_size
//         )} CS](${`https://osu.ppy.sh/beatmapsets/${osuLobby.currentBeatmap?.beatmapset_id}#osu/${osuLobby.currentBeatmap?.beatmap_id}`})`;
  
//         if (beatmapStr == "") {
//           beatmapStr = "No map is currently in progress";
//         }
  
//         const chatHistory = osuLobby.getChatHistory(false);
//         const startIndex = chatHistory.length - 5;
//         let chathistoryStr = chatHistory
//           .slice(startIndex >= 0 ? startIndex : 0, chatHistory.length)
//           .map(
//             (chat) =>
//               `**${chat.playerName || ":small_blue_diamond:"}** ${chat.message}`
//           )
//           .join("\n");
  
//         if (chathistoryStr.length >= 1024) {
//           chathistoryStr = chathistoryStr.slice(0, 1023);
//         }
  
//         if (!chathistoryStr) {
//           chathistoryStr = "No chat history";
//         }
//         let color: ColorResolvable;
//         if (osuLobby.isMatchPlaying) {
//           color = 0x9000bf;
//         } else {
//           color = 0xf071a9;
//         }
//         const embed = new EmbedBuilder()
//           .setTitle(osuLobby.getLobbyName())
//           .addFields(
//             {
//               name: `**Players** (${osuLobby.lobbyPlayers.length}/${osuLobby.osuChannel?.lobby.slots.length})`,
//               value: `${playersStr}`,
//               inline: true,
//             },
//             {
//               name: "**Chat History**",
//               value: chathistoryStr,
//               inline: true,
//             },
//             {
//               name: "**Time Left**",
//               value: `${
//                 osuLobby.calculateTimeLeft()
//                   ? utils.formatSeconds(osuLobby.calculateTimeLeft())
//                   : "waiting for players..."
//               }`,
//             },
//             {
//               name: "**Current Map**",
//               value: beatmapStr,
//             }
//           )
//           .setColor(color)
//           .setImage(
//             `https://assets.ppy.sh/beatmaps/${osuLobby.currentBeatmap?.beatmapset_id}/covers/cover.jpg`
//           )
//           .setURL("https://discord.gg/game-mlem-686218489396068373");
  
//         try {
//           if (!this.embedMessage) {
//             this.embedMessage = await channel.send({ embeds: [embed] });
//             return;
//           }
  
//           await this.embedMessage.edit({ embeds: [embed] });
//         } catch (e) {
//           console.error("Error editing message:", e);
//           this.embedMessage = await channel.send({ embeds: [embed] });
//           return;
//         }
//       } catch (e) {
//         console.log(e);
//       }
//     }

//     async deleteAllMessagesInOsuLobbyChannel() {
//         try {
//           const channel = (await discordClient.channels.fetch(
//             process.env.DISCORD_OSU_LOBBLY_STATS_CHANNEL_ID || ""
//           )) as TextChannel;
    
//           if (!channel) {
//             console.log("Channel not found");
//             return;
//           }
    
//           console.log("Deleting all messages in osu lobby channel...");
    
//           let fetchedMessages;
    
//           do {
//             fetchedMessages = await channel.messages.fetch({ limit: 20 });
    
//             if (!fetchedMessages) return;
    
//             await channel
//               .bulkDelete(fetchedMessages, true)
//               .catch((error) => console.error("Error deleting messages:", error));
//           } while (fetchedMessages.size > 1);
    
//           this.embedMessage = null;
//         } catch (e) {
//           await osuLobby.closeLobby();
//           console.log(e);
//         }
//       }
// }

// const discordEmbed = new DiscordEmbed()
// export default discordEmbed