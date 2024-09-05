//TODO MAKE BAN FUNCTION

//TODO CHECK TIME NGOÀI ĐỜI
//TODO CHECK THỜI TIẾT TẠI KHU VỰC NÀO ĐÓ

import dotenv from "dotenv";

require("events").defaultMaxListeners = 60;
dotenv.config();

import * as Banchojs from "bancho.js";
import osuAPIRequest, {
  Beatmap,
  osuUser,
  PlayerRecentPlays,
  Beatmap as v1Beatmap,
} from "./OsuAPI";
import utils from "../Utils";
import {
  ColorResolvable,
  EmbedBuilder,
  Message,
  TextChannel,
} from "discord.js";
import { discordClient } from "../index";
import * as ns from "nodesu";
import { chatWithHF } from "../HuggingFaceRequest";
import osuCommands from "./OsuCommands";
import { ScoreCalculator } from "@kionell/osu-pp-calculator";

type RoomMode = "Auto Map Pick" | "Host Rotate";
type PlayerStatus = "joined" | "left";

type BeatmapIDs = {
  beatmap_id: number;
  beatmapset_id: number;
};

type PlayerChatHistory = {
  playerName: string;
  message: string;
  timestamp: Date;
};

type AIresponse = {
  response: string;
  functionName: string;
  functionParameters: string;
  isYourResponseSimilarToAnyOfYourPreviousMessagesInTheHistory: string;
  didYouDoubleCheckYourResponse: string;
};

type PlayersVotesData = {
  player: Banchojs.BanchoLobbyPlayer;
  voteskipmap: number;
  voteskiphost: number;
  voteabort: number;
  votestart: number;
};

type VoteType =
  | "Skip Map"
  | "Skip Host"
  | "Abort Match"
  | "Start Match"
  | "Change Mode";

type VoteData = {
  player: Banchojs.BanchoUser;
  voteType: VoteType;
};

type ChatWithAIType =
  | "Messages History: Carefully response to them or execute functions if need"
  | "Match Finished: The match just finished, give players the best comment about the match"
  | "Changed Difficulty: The Difficulty Of The Lobby Just Changed Base On Users Ranks"
  | "Required Run Function To Get Data: You required to run functions to get the data for responding to players";

class OsuLobbyBot {
  osuClient = new Banchojs.BanchoClient({
    username: process.env.OSU_IRC_USERNAME!,
    password: process.env.OSU_IRC_PASSWORD!,
    apiKey: process.env.OSU_API_KEY,
  });

  osuChannel: Banchojs.BanchoMultiplayerChannel | undefined;

  adminIDs: number[] = [];
  calculatePPFromScore = new ScoreCalculator();
  roomMode: RoomMode = "Auto Map Pick";

  mods = [
    { enumValue: 1, shortMod: "nf", longMod: "NoFail" },
    { enumValue: 2, shortMod: "ez", longMod: "Easy" },
    { enumValue: 8, shortMod: "hd", longMod: "Hidden" },
    { enumValue: 16, shortMod: "hr", longMod: "HardRock" },
    { enumValue: 32, shortMod: "sd", longMod: "SuddenDeath" },
    { enumValue: 64, shortMod: "dt", longMod: "DoubleTime" },
    { enumValue: 128, shortMod: "rx", longMod: "Relax" },
    { enumValue: 256, shortMod: "ht", longMod: "HalfTime" },
    { enumValue: 512, shortMod: "nc", longMod: "Nightcore" },
    { enumValue: 1024, shortMod: "fl", longMod: "Flashlight" },
    // Add more mods as needed
  ];

  lobbyPlayers: Banchojs.BanchoLobbyPlayer[];

  playersChatHistory: PlayerChatHistory[] = [];

  maxChatHistoryLength = 35;

  totalMatchPlayedFromStartLobby = 0;

  //Cooldown for things
  canUpdateEmbed = false;
  canChatWithAI = true;

  medianPPPoint = 0;

  currentMapMinDif = 0;
  lastMapMinDif = 0;
  currentMapMaxDif = 0;
  lastMapMaxDif = 0;
  maxLengthForAutoMapPickMode = 240;
  maxLengthForHostRotate = 400;

  matchStartTime: number | null = null;
  currentBeatmap: v1Beatmap | null = null;
  lastBeatmap?: ns.Beatmap;

  skipVotesTotal = 0;

  startMatchAllPlayersReadyTimeout = 10;
  timeoutAfterRoomModeChangeToAutoPick = 20;
  startMatchTimeout = 60;

  beatmapsSinceDay = new Date(2018, 1, 1);
  beatmaps: v1Beatmap[] = [];

  currentHost?: Banchojs.BanchoLobbyPlayer;

  lastBeatmapToRepick: BeatmapIDs | null = null;
  isMatchPlaying: boolean = false;
  isMatchStarting: boolean = false;

  lastLobbyName = "";

  voteData: VoteData[] = [];
  playerVotesData: PlayersVotesData[] = [];

  constructor() {
    this.lobbyPlayers = [];
    process.on("SIGINT", async () => {
      console.log("DISCONNECTING WITH LOBBY...");

      await this.osuChannel?.lobby.closeLobby();
      await this.osuClient.disconnect();
    });

    let adminIDs = process.env.OSU_ADMIN_IDs!.split(" ");

    for (let i = 0; i < adminIDs.length; i++) {
      this.adminIDs.push(Number(adminIDs[i]));
    }
  }

  async init() {
    await this.osuClient.connect();
  }

  async start() {
    console.log("Creating Osu Lobby...");

    await this.init();
    await this.createAndHandleLobby();

    //Update lobby's stats after 12*
    setInterval(async () => {
      this.updateEmbed();
      if(!this.isMatchStarting){
        this.osuChannel?.lobby.updateSettings();
      }
    }, 1000 * 12);

    setInterval(async () => {
      if (this.isMatchPlaying) {
        this.osuChannel?.lobby.setName(this.getLobbyName());
      }
    }, 1000 * 30);

    setInterval(async () => {
      if (this.osuChannel) {
        await this.osuChannel.lobby.setSize(16);
      }
      if (!this.osuClient.isConnected() && !this.osuChannel) {
        console.log("Reconnecting to the lobby...");
        this.start();
      }

      if (this.osuClient.isConnected() && !this.osuChannel) {
        this.createAndHandleLobby();
      }
    }, 1000 * 1800);
  }

  async createAndHandleLobby() {
    try {
      this.osuChannel = await this.osuClient.createLobby(
        this.getLobbyName(),
        false
      );

      if (!this.osuChannel) {
        this.closeLobby();
        return;
      }

      await this.osuChannel.lobby.setPassword("");
      await this.autoMapPick();

      await this.osuChannel.lobby.setMods([], true);

      console.log(
        "===================== Lobby created! Name: " +
          this.osuChannel.lobby.name
      );

      this.osuChannel.lobby.on("playerJoined", async (lobbyPlayer) => {
        if (!this.osuChannel) return;
        console.log(`+ ${lobbyPlayer.player.user.username} joined the lobby`);
        await this.updateLobbyPlayers(lobbyPlayer.player, "joined");

        if (this.roomMode == "Host Rotate") {
          if (this.lobbyPlayers.length == 1) {
            await this.hostRotate();
          }
        }

        this.chatWithAI(
          await this.getUserPrompt(
            "Messages History: Carefully response to them or execute functions if need"
          )
        );

        if (this.roomMode == "Auto Map Pick") {
          if (this.lobbyPlayers.length == 1) {
            await this.changeDifficultyBaseOnPlayersRank();
            await this.autoMapPick();
          }
        }
        // if (this.roomMode == "Auto Map Pick") {
        //   if (this.lobbyPlayers.length >= 4) {
        //     if (await this.areAllPlayersReady())
        //       await this.startMatchTimer(this.startMatchTimeout);
        //   }
        // }
      });

      this.osuChannel.lobby.on("playerLeft", async (lobbyPlayer) => {
        try {
          await this.updateLobbyPlayers(lobbyPlayer, "left");
          console.log(`- ${lobbyPlayer.user.username} left the lobby`);

          if (this.lobbyPlayers.length == 0) {
            await this.changeLobbyName(true);
            await this.changeDifficultyBaseOnPlayersRank();
            await this.autoMapPick();
          }

          if (
            lobbyPlayer.user.id == this.currentHost?.user.id &&
            this.roomMode == "Host Rotate"
          ) {
            if (this.isMatchPlaying == false && this.lobbyPlayers.length > 0) {
              await this.hostRotate();
            } else if (this.lobbyPlayers.length == 0) {
              this.currentHost = undefined;
            }
          }

          if (this.lobbyPlayers.length == 1 && this.roomMode == "Host Rotate") {
            this.osuChannel?.sendMessage(
              "You can use !changemode to change to Auto Pick Map mode and chill by yourself wait for players to join"
            );
          }

          //Check if all players are ready after a player left to start the match
          if (
            this.roomMode == "Auto Map Pick" &&
            this.lobbyPlayers.length < 5
          ) {
            if (!this.osuChannel) return;
            if (await this.areAllPlayersReady()) {
              await this.startMatchTimer();
            }
          } else if (
            this.roomMode == "Auto Map Pick" &&
            this.lobbyPlayers.length >= 5
          ) {
            await this.startMatchTimer();
          }
        } catch (e) {
          await this.closeLobby();
          console.log(e);
        }
      });
      this.osuChannel.lobby.on("host", (host) => {
        if (host) {
          console.log("Host changed to: ", host.user.username);
          this.currentHost = host;
        }
      });

      this.osuChannel.on("message", async (message) => {
        if (!this.osuChannel) return;
        this.chatHistoryHandler(message);

        if (
          message.user.username != undefined &&
          !message.message.startsWith("!") &&
          message.user.username != "ThangProVip"
        ) {
          this.chatWithAI(
            await this.getUserPrompt(
              "Messages History: Carefully response to them or execute functions if need"
            )
          );
        }

        let msg = message.message;
        console.log(`${message.user.username}: ${msg}`);
        if (msg.startsWith("!")) {
          let args = msg.substring(1, msg.length).toLowerCase().split(" ");
          if (this.adminIDs.includes(message.user.id)) {
            for (const x of this.getAllFunctions<OsuLobbyBot>(this)) {
              if (
                x.toLowerCase() == args[0] &&
                this.getObjectKeyValue(osuCommands.adminFunctionList).some(
                  (command) => command.key == x.toLowerCase()
                )
              ) {
                await (this as any)[x](message);
                return;
              }
            }
          }

          for (const x of this.getAllFunctions<OsuLobbyBot>(this)) {
            if (
              x.toLowerCase() == args[0] &&
              this.getObjectKeyValue(osuCommands.commandsList).some(
                (command) => command.key == x.toLowerCase()
              )
            ) {
              (this as any)[x](message);
            }
          }
        }
      });
      this.osuChannel.lobby.on("matchFinished", async () => {
        console.log("============= MATCH FINISHED =============");
        if (!this.osuChannel) return;
        this.totalMatchPlayedFromStartLobby++;
        try {
          this.lastBeatmap = this.osuChannel.lobby.beatmap;

          if (this.roomMode == "Auto Map Pick") {
            await Promise.all([
              await this.changeDifficultyBaseOnPlayersRank(),
              await this.autoMapPick(),
            ]);

            if (this.lobbyPlayers.length >= 4) {
              this.startMatchTimer(this.startMatchTimeout);
            }
          }

          if (this.roomMode == "Host Rotate") {
            //Host Rotation
            await this.hostRotate();
          }
          this.matchStartTime = null;

          if (!this.osuChannel) return;
          try {
            await this.chatWithAI(
              await this.getUserPrompt(
                "Match Finished: The match just finished, give players the best comment about the match"
              ),
              true
            );
          } catch (e) {
            console.error("ERROR: ", e);
            this.closeLobby();
          }
        } catch (e) {
          console.error("ERROR: ", e);
          this.closeLobby();
        }
      });

      this.osuChannel.lobby.on("matchAborted", async () => {
        console.log("MATCH ABORTED");
        if (this.roomMode == "Auto Map Pick" && this.lobbyPlayers.length > 0) {
          if (this.lobbyPlayers.length >= 4) {
            this.startMatchTimer(this.timeoutAfterRoomModeChangeToAutoPick);
          }
        }
      });

      this.osuChannel.lobby.on("beatmap", async (b) => {
        this.osuClient.osuApi.multi.getMatch(Number(this.osuChannel?.lobby.id));
        try {
          if (this.roomMode == "Host Rotate") {
            console.log("Host Pick Map");

            // Check if the beatmap is valid
            if (b != null) {
              if (
                b.difficultyRating > this.currentMapMaxDif ||
                b.difficultyRating < this.currentMapMinDif ||
                b.mode != 0 ||
                b.totalLength > this.maxLengthForHostRotate
              ) {
                if (this.osuChannel) {
                  //i wanna calculate the beatmap difficulty with DT
                  if (this.lastBeatmapToRepick) {
                    await Promise.all([
                      await this.osuChannel.sendAction(
                        `${b.title} (${b.difficultyRating.toFixed(
                          2
                        )}*) - ${utils.formatSeconds(
                          b.totalLength
                        )} ain't meet the requirements ${
                          this.currentMapMinDif
                        }* - ${
                          this.currentMapMaxDif
                        }* - Max Length: ${utils.formatSeconds(
                          this.maxLengthForHostRotate
                        )} - osu! Standard*`
                      ),
                      await this.osuChannel.lobby.setMap(
                        Number(this.lastBeatmapToRepick.beatmap_id)
                      ),
                    ]);
                  }
                }
              } else {
                if (this.osuChannel)
                  this.lastBeatmapToRepick = {
                    beatmap_id: b.beatmapId,
                    beatmapset_id: b.beatmapSetId,
                  };
                this.beatmapInfoSendChannel(
                  b.title,
                  b.artist,
                  b.difficultyRating.toString(),
                  b.bpm.toString(),
                  b.totalLength.toString(),
                  b.circleSize.toString(),
                  b.approachRate.toString()
                );
              }
            }
          }
        } catch (e) {
          await this.closeLobby();
          console.log(e);
        }
      });

      this.osuChannel.lobby.on("matchStarted", async () => {
        this.matchStartTime = Date.now();
        this.voteData = [];
        this.lastBeatmap = this.osuChannel?.lobby.beatmap;
      });

      this.osuChannel.lobby.on("playing", async (state) => {
        if (this.osuChannel) this.isMatchPlaying = state;
        if (this.lobbyPlayers.length === 0 && state) {
          this.osuChannel?.sendMessage("Match aborted because no players");
          this.osuChannel?.lobby.abortMatch();
          this.abortMatchTimer();
        }
      });

      this.osuChannel.lobby.on("allPlayersReady", async () => {
        if (await this.areAllPlayersReady()) {
          this.startMatchTimer();
        }
      });
    } catch (error) {
      this.closeLobby();
      console.error(error);
    }
  }

  //I want to get the key or the value of the commandsList
  getObjectKeyValue(obj: Object) {
    let commands: { key: string; value: string }[] = [];
    for (const x of Object.keys(obj)) {
      commands.push({
        key: x,
        value: (obj as any)[x],
      });
    }
    return commands;
  }

  getAllFunctions<T>(obj: T): (keyof T)[] {
    return Object.getOwnPropertyNames(Object.getPrototypeOf(obj)).filter(
      (key) => typeof obj[key as keyof T] === "function"
    ) as (keyof T)[];
  }

  getChatHistory(filter: boolean) {
    if (filter) {
      return this.playersChatHistory.filter(
        (message) =>
          !this.getObjectKeyValue(osuCommands.commandsList).some(
            (command) =>
              message.message.startsWith(command.key) ||
              message.message.includes(command.value)
          )
      );
    }

    return this.playersChatHistory;
  }

  chatHistoryHandler(message: Banchojs.BanchoMessage) {
    if (this.playersChatHistory.length > this.maxChatHistoryLength) {
      for (let index = 0; index < this.playersChatHistory.length; index++) {
        if (this.playersChatHistory.length <= 45) {
          break;
        } else {
          this.playersChatHistory.shift();
        }
      }
      this.playersChatHistory.push({
        playerName: message.user.username,
        message: message.message,
        timestamp: new Date(),
      });
    } else {
      this.playersChatHistory.push({
        playerName: message.user.username,
        message: message.message,
        timestamp: new Date(),
      });
    }
  }

  sendVoteMessage(vote: VoteData) {
    if (this.osuChannel) {
      this.osuChannel.sendMessage(
        `${vote.player.username} voted to ${vote.voteType}: ${
          this.voteData.filter((v) => v.voteType == vote.voteType).length
        }/${this.lobbyPlayers.length} votes`
      );
    }
  }

  async changeLobbyName(noPlayer?: boolean) {
    if (this.osuChannel) {
      if (noPlayer) {
        this.currentMapMinDif = 0;
        this.currentMapMaxDif = 0;
        let lobbyName = this.getLobbyName();
        if (this.lastLobbyName == lobbyName) return;
        await this.osuChannel.lobby.setName(lobbyName);
        this.lastLobbyName = lobbyName;
        return;
      }

      let lobbyName = this.getLobbyName();
      if (this.lastLobbyName == lobbyName) return;
      await this.osuChannel.lobby.setName(lobbyName);
      this.lastLobbyName = lobbyName;
    }
  }

  getLobbyName() {
    return `${this.currentMapMinDif.toFixed(
      1
    )}* - ${this.currentMapMaxDif.toFixed(1)}*| ${utils.formatSeconds(
      this.calculateTimeLeft()
    )} | Auto - !rhelp`;
  }

  async changeDifficultyBaseOnPlayersRank() {
    if (this.isMatchPlaying) return;
    if (!this.osuChannel) return;

    let ranks: number[] = [];

    for (const slot of this.osuChannel.lobby.slots) {
      if (slot) {
        if (slot.user) {
          ranks.push(slot.user.ppRaw);
        }
      }
    }

    if (ranks.length == 0) {
      return false;
    }

    let medianPPPoint = Math.pow(this.getMedian(ranks), 0.4);
    let averageDif = medianPPPoint * 0.2;

    let max = 0;
    let min = 0;
    //If mrekk come it, the dif won't be 13*, it will be around 11* <3
    if (medianPPPoint >= 0 && medianPPPoint <= 10) {
      max = averageDif * 1.5;
      min = averageDif * 1;
    } else if (medianPPPoint >= 10 && medianPPPoint <= 20) {
      max = averageDif * 1.4;
      min = averageDif * 1;
    } else if (medianPPPoint >= 20 && medianPPPoint <= 30) {
      max = averageDif * 1.19;
      min = averageDif * 1.0;
    } else if (medianPPPoint >= 30 && medianPPPoint <= 40) {
      max = averageDif * 1.05;
      min = averageDif * 0.91;
    } else if (medianPPPoint >= 40 && medianPPPoint <= 50) {
      max = averageDif * 0.95;
      min = averageDif * 0.85;
    } else if (medianPPPoint >= 50 && medianPPPoint <= 60) {
      max = averageDif * 0.9;
      min = averageDif * 0.8;
    } else {
      max = averageDif * 0.85;
      min = averageDif * 0.75;
    }

    if (!min && !max) {
      this.currentMapMinDif = 0;
      this.currentMapMaxDif = 0;
      return false;
    }
    if (max != this.currentMapMaxDif && min != this.currentMapMinDif) {
      this.lastMapMinDif = this.currentMapMinDif;
      this.lastMapMaxDif = this.currentMapMaxDif;
      this.currentMapMinDif = min;
      this.currentMapMaxDif = max;

      await this.changeLobbyName();
    }
  }

  //Show players commands
  async rhelp(message?: Banchojs.BanchoMessage, playerName?: string) {
    if (!this.osuChannel) return;
    await this.osuChannel.sendMessage(
      `This is list of the commands, start with "!":`
    );
    for (const command of this.getObjectKeyValue(osuCommands.commandsList)) {
      this.osuChannel.sendMessage(`${command.key}`);
    }
  }
  async timeLeft(message?: Banchojs.BanchoMessage, playerName?: string) {
    if (!this.osuChannel) return;
    if (!this.osuChannel) return;

    const timeLeft = this.calculateTimeLeft();
    if (timeLeft !== 0) {
      this.osuChannel.sendMessage(
        `Time left of the beatmap: ${utils.formatSeconds(
          timeLeft
        )}, lets wait <3`
      );
    } else {
      this.osuChannel.sendMessage("No match is currently in progress.");
    }
  }

  async voteHandler(
    message?: Banchojs.BanchoMessage,
    voteT?: VoteType,
    playerName?: string
  ) {
    if (!this.osuChannel) return;

    if (this.isMatchPlaying && voteT != "Abort Match") {
      await this.osuChannel.sendMessage(
        "Can't Vote when the match is in playing!"
      );
      return;
    }

    if (voteT == undefined) return;
    console.log("VOTING :       ======================== ", voteT);

    if (message) {
      if (
        this.voteData.some(
          (v) => v.player.id == message.user.id && v.voteType == voteT
        )
      )
        return;
      let vote: VoteData = {
        player: message.user,
        voteType: voteT,
      };

      this.voteData.push(vote);
      this.sendVoteMessage(vote);
    } else {
      if (playerName) {
        if (
          !this.voteData.some(
            (vote) =>
              vote.player.username == playerName && vote.voteType == voteT
          )
        ) {
          let player = this.lobbyPlayers.find(
            (p) => p.user.username == playerName
          );
          if (!player) return;
          let vote: VoteData = {
            player: player.user,
            voteType: voteT,
          };
          this.voteData.push(vote);
          this.sendVoteMessage(vote);
        }
      }
    }
  }

  async resetVote(voteT?: VoteType) {
    if (voteT == undefined) return;
    this.voteData = this.voteData.filter((v) => v.voteType != voteT);
  }
  async voteabortmatch(message?: Banchojs.BanchoMessage, playerName?: string) {
    if (!this.osuChannel) return;

    this.voteHandler(message, "Abort Match", playerName);

    if (
      this.voteData.filter((v) => v.voteType == "Abort Match").length >
      this.lobbyPlayers.length / 3
    ) {
      await this.osuChannel.lobby.abortMatch();
      this.osuChannel.sendMessage(`The match is aborted`);
      this.resetVote("Abort Match");
    }
  }

  async votestartmatch(message?: Banchojs.BanchoMessage, playerName?: string) {
    if (!this.osuChannel) return;
    this.voteHandler(message, "Start Match", playerName);

    if (
      this.voteData.filter((v) => v.voteType == "Start Match").length >
      this.lobbyPlayers.length / 3
    ) {
      await this.startMatchTimer();
      this.osuChannel.sendMessage(`The match is started`);
      this.resetVote("Start Match");
    }
  }

  async voteskiphost(message?: Banchojs.BanchoMessage, playerName?: string) {
    if (!this.osuChannel) return;
    if (!(this.roomMode == "Host Rotate")) return;

    this.voteHandler(message, "Skip Host", playerName);

    if (
      this.voteData.filter((v) => v.voteType == "Skip Host").length >
      this.lobbyPlayers.length / 3
    ) {
      await this.hostRotate();
      this.osuChannel.sendMessage(`Host is skipped`);
      this.resetVote("Skip Host");
    }
  }
  async voteskipmap(message?: Banchojs.BanchoMessage, playerName?: string) {
    if (!this.osuChannel) return;
    if (!(this.roomMode == "Auto Map Pick")) return;

    if (this.lobbyPlayers.length < 1) {
      return;
    }

    this.voteHandler(message, "Skip Map", playerName);

    if (
      this.voteData.filter((v) => v.voteType == "Skip Map").length >
      this.lobbyPlayers.length / 3
    ) {
      await this.autoMapPick();
      this.osuChannel.sendMessage(`Map is skipped`);
      this.resetVote("Skip Map");
    }
  }
  async votechangemode(message?: Banchojs.BanchoMessage, playerName?: string) {
    if (!this.osuChannel) return;

    this.voteHandler(message, "Change Mode", playerName);

    if (
      this.voteData.filter((v) => v.voteType == "Change Mode").length >
      this.lobbyPlayers.length / 3
    ) {
      this.resetVote("Change Mode");
      if (this.roomMode == "Host Rotate") {
        await this.osuChannel.lobby.clearHost();
        await this.autoMapPick();
        this.roomMode = "Auto Map Pick";
        if (this.lobbyPlayers.length >= 4) {
          await this.startMatchTimer(this.startMatchTimeout);
        }
      } else if (this.roomMode == "Auto Map Pick") {
        this.roomMode = "Host Rotate";
        await this.changeDifficultyBaseOnPlayersRank();
        await this.hostRotate();
      }
      this.osuChannel.sendMessage(`Lobby's mode changed to ${this.roomMode}`);
    }
  }

  async kickplayer(playerName?: string) {
    if (!this.osuChannel) return;
    if (!playerName) return;
    try {
      let player = this.lobbyPlayers.find((p) => p.user.username == playerName);
      if (this.adminIDs.includes(Number(player?.user.id))) {
        await this.osuChannel.sendMessage(
          `You can't kick ${player?.user.username} because he is an admin`
        );
        return;
      }

      await this.osuChannel.lobby.kickPlayer(`#${player?.user.id}`);
    } catch (e) {
      console.log(e);
      await this.closeLobby();
    }
  }
  async moveplayertoslot(playerName?: string, slot?: any) {
    try {
      if (!this.osuChannel && !(slot instanceof Number) && !slot && !playerName)
        return;

      let player = this.lobbyPlayers.find((p) => p.user.username == playerName);
      if (!player) return;

      if (slot > this.osuChannel!.lobby.slots.length - 1) {
        return;
      }

      await this.osuChannel!.lobby.movePlayer(player, slot - 1);
    } catch (e) {
      console.log(e);
    }
  }
  async startMatchTimer(timeSecond: number = 0) {
    console.log("START MATCH TIMER");
    this.isMatchStarting
    if (timeSecond > 0) {
      await this.osuChannel?.lobby.startMatch(timeSecond);
    } else {
      await this.osuChannel?.lobby.startMatch();
    }
  }
  async changelobbymods(
    howManyPlayerWantIt: string,
    mod1: string = "",
    mod2: string = "",
    mod3: string = ""
  ) {
    try {
      if (Number(howManyPlayerWantIt) < this.lobbyPlayers.length / 2) return;
      await this.osuChannel?.lobby.setMods(mod1 + mod2 + mod3, false);
    } catch (e) {
      console.log(e);
    }
  }

  //Callback functions down here
  async getplayerstats(userName: string, askedPlayer: string) {
    let user: osuUser[] | null = await osuAPIRequest.getPlayerStats(userName);
    let prompt = "";
    try {
      if (!user || !user[0]) {
        prompt = this.generateCallbackPromp(
          askedPlayer,
          `${askedPlayer} asked you to find a name called ${userName}`,
          `You can't not find the user call ${userName}`
        );
      } else {
        let u = user[0];
        let stats = `Username: ${u.username}, Rank: #${u.pp_rank}, Accuracy: ${u.accuracy}, Level: ${u.level}, Ranked Score: ${u.ranked_score}, Total Score: ${u.total_score}, Join Date: ${u.join_date}, Count Rank SS: ${u.count_rank_ss}, Count Rank SSH: ${u.count_rank_ssh}, Count Rank S: ${u.count_rank_s}, Count Rank SH: ${u.count_rank_sh}, Count Rank A: ${u.count_rank_a}, Play Count: ${u.playcount}, PP Countr Rank: ${u.pp_country_rank}`;
        prompt = this.generateCallbackPromp(
          askedPlayer,
          `${askedPlayer} asked you to find a name called ${user[0].username}`,
          stats
        );
      }
      await this.chatWithAI(
        await this.getUserPrompt(
          "Required Run Function To Get Data: You required to run functions to get the data for responding to players",
          prompt
        ),
        true
      );
    } catch (e) {
      console.log(e);
    }
  }

  async getplayerrecentplay(userName: string, askedPlayer: string) {
    let user: PlayerRecentPlays[] | null =
      await osuAPIRequest.getPlayerRecentPlays(userName);
    let prompt = "";
    try {
      if (!user || !user[0]) {
        prompt = this.generateCallbackPromp(
          askedPlayer,
          `${askedPlayer} asked you to find a name called ${userName}`,
          `You can't not find the user call ${userName}`
        );
      } else {
        let u = user[0];
        let bm = await osuAPIRequest.getBeatmap(u.beatmap_id);
        let acc = this.calculateAccuracy(u);
        let modsStr = u.enabled_mods
          ? this.getMods(Number(u.enabled_mods))
              .map((x) => x.shortMod)
              .join("")
          : "";

        let pp = await this.calculatePPFromScore.calculate({
          beatmapId: Number(u.beatmap_id),
          mods: modsStr,
          accuracy: acc,
        });

        let stats = `Recent Play Of ${userName} In Beatmap ${
          bm[0].title
        }(${Number(bm[0].difficultyrating).toFixed(2)}*): PP: ${
          pp.performance.totalPerformance
        } - Accuracy: ${acc}% - Max Combo: x${u.maxcombo}/${
          bm[0].max_combo
        } - Misses: x${u.countmiss}`;

        prompt = this.generateCallbackPromp(
          askedPlayer,
          `${askedPlayer} asked you to find the latest recent play score of a name called ${userName}, and show everything out`,
          stats
        );
      }
      await this.chatWithAI(
        await this.getUserPrompt(
          "Required Run Function To Get Data: You required to run functions to get the data for responding to players",
          prompt
        ),
        true
      );
    } catch (e) {
      console.log(e);
    }
  }

  generateCallbackPromp(askedPlayer: string, reason: string, data: string) {
    return `You made this callback because: ${reason}\nThe User Asked You Do To The Callback: ${askedPlayer}\nHere is the data you got from the callback: ${data}`;
  }

  async hostRotate() {
    try {
      if (!this.osuChannel) return;

      if (this.lobbyPlayers && this.lobbyPlayers.length > 1) {
        await this.osuChannel.lobby.setHost("#" + this.lobbyPlayers[0].user.id);

        let firstPlayer = this.lobbyPlayers.shift();
        if (firstPlayer) {
          this.lobbyPlayers.push(firstPlayer);

          this.osuChannel.sendMessage(
            `${firstPlayer.user.username} is the new host`
          );
        }
      } else if (this.lobbyPlayers.length == 1) {
        if (this.currentHost?.user.id == this.lobbyPlayers[0].user.id) {
          return;
        } else {
          await this.osuChannel.lobby.setHost(
            "#" + this.lobbyPlayers[0].user.id
          );
        }
      }

      if (this.lobbyPlayers.length == 0) {
        this.osuChannel.sendMessage(
          "Host rotate is disabled because there's no players in the lobby"
        );
      }
    } catch (e) {
      console.log(e);
      await this.closeLobby();
    }
  }

  calculateTimeLeft() {
    if (this.matchStartTime === null || this.currentBeatmap === null) {
      return 0;
    }

    const elapsedTime = (Date.now() - this.matchStartTime) / 1000; // Convert to seconds
    const timeLeft = Math.max(
      0,
      Number(this.currentBeatmap.total_length) - elapsedTime
    );
    return Math.round(timeLeft);
  }

  async updateLobbyPlayers(
    player: Banchojs.BanchoLobbyPlayer,
    status: PlayerStatus
  ) {
    try {
      if (!this.osuChannel) return;
      if (status == "joined") {
        this.lobbyPlayers.push(player);
      } else if (status == "left") {
        this.lobbyPlayers = this.lobbyPlayers.filter(
          (p) => p.user.id !== player.user.id
        );
      }
      console.log(
        "Players in lobby:",
        this.lobbyPlayers.map((p) => p.user.username).join(",")
      );
    } catch (e) {
      await this.closeLobby();
      console.log(e);
    }
  }

  convertBeatmapV2ToV1(bm: ns.Beatmap) {
    let bmv1: Beatmap | undefined;
    try {
      bmv1 = {
        artist: bm.artist,
        beatmap_id: bm.beatmapId.toString(),
        beatmapset_id: bm.beatmapSetId.toString(),
        bpm: bm.bpm.toString(),
        diff_aim: bm.diffAim.toString(),
        diff_approach: bm.diffApproach.toString(),
        diff_drain: bm.diffDrain.toString(),
        diff_overall: bm.diffOverall.toString(),
        diff_size: bm.diffSize.toString(),
        diff_speed: bm.diffSpeed.toString(),
        difficultyrating: bm.difficultyRating.toString(),
        favourite_count: bm.favoriteCount.toString(),
        hit_length: bm.hitLength.toString(),
        max_combo: bm.maxCombo.toString(),
        mode: bm.mode!.toString(),
        playcount: bm.playcount.toString(),
        rating: bm.rating.toString(),
        tags: bm.tags,
        title: bm.title,
        total_length: bm.totalLength.toString(),
      };
    } catch (e) {
      console.log(e);
      this.closeLobby();
    }

    return bmv1;
  }

  async autoMapPick() {
    if (!this.osuChannel) return;
    let currentDate: Date;
    let randomDate: Date;
    let bm: v1Beatmap;
    if (this.currentMapMaxDif == 0 && this.currentMapMinDif == 0) {
      if (
        Number(this.currentBeatmap?.beatmap_id) == 75 ||
        Number(this.currentBeatmap?.beatmapset_id) == 75
      )
        return;
      await this.osuChannel.lobby.setMap(75);
      setTimeout(() => {}, 1000 * 10);
      return;
    }
    while (this.beatmaps.length < 1) {
      currentDate = new Date();
      randomDate = new Date(
        utils.getRandomNumber(
          this.beatmapsSinceDay.getTime(),
          currentDate.getTime()
        )
      );

      this.beatmaps = await osuAPIRequest.getRandomBeatmap(
        this.currentMapMinDif,
        this.currentMapMaxDif,
        this.maxLengthForAutoMapPickMode,
        randomDate
      );
    }
    if (!this.beatmaps) return;

    let randomBeatmapIndex = utils.getRandomNumber(0, this.beatmaps.length - 1);

    bm = this.beatmaps[randomBeatmapIndex];
    this.currentBeatmap = bm;
    this.lastBeatmapToRepick = {
      beatmap_id: Number(bm.beatmap_id),
      beatmapset_id: Number(bm.beatmapset_id),
    };

    await this.osuChannel.lobby.setMap(
      Number(this.beatmaps[randomBeatmapIndex].beatmap_id)
    );

    this.beatmapInfoSendChannel(
      bm.title,
      bm.artist,
      bm.difficultyrating,
      bm.bpm,
      bm.total_length,
      bm.diff_size,
      bm.diff_approach
    );

    this.beatmaps = [];
  }

  async beatmapInfoSendChannel(
    title: string,
    artis: string,
    difficulty: string,
    bpm: string,
    length: string,
    circleSize: string,
    approachRate: string
  ) {
    try {
      if (this.osuChannel) {
        const msg = `Picked Map: ${title} - ${artis} (${Number(
          difficulty
        ).toFixed(2)}*): ${bpm} BPM - ${utils.formatSeconds(
          Number(length)
        )} - ${circleSize} CS, ${approachRate} AR`;

        await this.osuChannel.sendMessage(msg);
        console.log(msg);
      }
    } catch (e) {
      await console.log(e);
      this.closeLobby();
    }
  }

  async areAllPlayersReady() {
    try {
      if (!this.osuChannel) return;
      await this.osuChannel.lobby.updateSettings();
      let players = [];
      for (const x of this.osuChannel?.lobby.slots) {
        if (x) {
          players.push(x);
        }
      }

      if (
        players.length == 1 &&
        this.currentHost?.user.id != players[0].user.id
      ) {
        if (this.roomMode == "Host Rotate") {
          this.osuChannel?.lobby.setHost("#" + players[0].user.id);
        }
      }

      if (players.length == 0) return false;
      for (const x of this.lobbyPlayers) {
        if (
          x.state.toString().toLocaleLowerCase() == "symbol(not ready)" ||
          x.state.toString().toLocaleLowerCase() == "symbol(no map)"
        ) {
          return false;
        }
      }

      return true;
    } catch (e) {
      console.log(e);
    }
  }

  startmatchafter(seconds: String) {
    try {
      this.startMatchTimer(Number(seconds));
    } catch (e) {}
  }

  async abortMatchTimer() {
    await this.abortMatchTimer();
    this.isMatchStarting = false;
  }

  embedMessage: Message | null = null;
  async updateEmbed() {
    try {
      if (!this.canUpdateEmbed) return;
      const channel = (await discordClient.channels.fetch(
        process.env.DISCORD_OSU_LOBBLY_STATS_CHANNEL_ID || ""
      )) as TextChannel;

      if (!channel) {
        console.log(
          `${process.env.DISCORD_OSU_LOBBLY_STATS_CHANNEL_ID} is not a valid channel id`
        );
        return;
      }

      let playersStr = "";
      let slotIndex = 0;
      for (const slot of this.osuChannel?.lobby.slots || []) {
        if (slot) {
          if (slot.user) {
            if (this.osuChannel?.lobby.getPlayerSlot(slot) == slotIndex) {
              if (slot.user.id == this.currentHost?.user.id) {
                playersStr += `:yellow_square: **[${
                  slot.user.username.length > 10
                    ? slot.user.username.slice(0, 8) + "..."
                    : slot.user.username
                } #${utils.formatNumber(
                  slot.user.ppRank
                )}](${`https://osu.ppy.sh/users/${slot.user.id}`})**\n`;
              } else {
                playersStr += `:green_square: **[${
                  slot.user.username.length > 10
                    ? slot.user.username.slice(0, 10) + "..."
                    : slot.user.username
                } #${utils.formatNumber(
                  slot.user.ppRank
                )}](${`https://osu.ppy.sh/users/${slot.user.id}`})**\n`;
              }
              slotIndex++;
            } else {
              playersStr += ":black_large_square:\n";
              slotIndex++;
            }
          }
        } else {
          playersStr += ":black_medium_square:\n";
          slotIndex++;
        }
      }

      if (playersStr == "") {
        playersStr = "No players in the lobby";
      }

      let beatmapStr = `[${this.currentBeatmap?.title}(${Number(
        this.currentBeatmap?.difficultyrating
      ).toFixed(2)}*) - ${this.currentBeatmap?.artist} - ${utils.formatSeconds(
        Number(this.currentBeatmap?.total_length)
      )} - ${this.currentBeatmap?.bpm} BPM - ${Number(
        this.currentBeatmap?.diff_approach
      )} AR- ${Number(
        this.currentBeatmap?.diff_size
      )} CS](${`https://osu.ppy.sh/beatmapsets/${this.lastBeatmapToRepick?.beatmapset_id}#osu/${this.lastBeatmapToRepick?.beatmap_id}`})`;

      if (beatmapStr == "") {
        beatmapStr = "No map is currently in progress";
      }

      const chatHistory = this.getChatHistory(false);
      const startIndex = chatHistory.length - 5;
      let chathistoryStr = chatHistory
        .slice(startIndex >= 0 ? startIndex : 0, chatHistory.length)
        .map(
          (chat) =>
            `**${chat.playerName || ":small_blue_diamond:"}** ${chat.message}`
        )
        .join("\n");

      if (chathistoryStr.length >= 1024) {
        chathistoryStr = chathistoryStr.slice(0, 1023);
      }

      if (!chathistoryStr) {
        chathistoryStr = "No chat history";
      }
      let color: ColorResolvable;
      if (this.isMatchPlaying) {
        color = 0x9000bf;
      } else {
        color = 0xf071a9;
      }
      const embed = new EmbedBuilder()
        .setTitle(this.getLobbyName())
        .addFields(
          {
            name: `**Players** (${this.lobbyPlayers.length}/${this.osuChannel?.lobby.slots.length})`,
            value: `${playersStr}`,
            inline: true,
          },
          {
            name: "**Chat History**",
            value: chathistoryStr,
            inline: true,
          },
          {
            name: "**Time Left**",
            value: `${
              this.calculateTimeLeft()
                ? utils.formatSeconds(this.calculateTimeLeft())
                : "waiting for players..."
            }`,
          },
          {
            name: "**Current Map**",
            value: beatmapStr,
          }
        )
        .setColor(color)
        .setImage(
          `https://assets.ppy.sh/beatmaps/${this.lastBeatmapToRepick?.beatmapset_id}/covers/cover.jpg`
        )
        .setURL("https://discord.gg/game-mlem-686218489396068373");

      try {
        if (!this.embedMessage) {
          this.embedMessage = await channel.send({ embeds: [embed] });
          return;
        }

        await this.embedMessage.edit({ embeds: [embed] });
      } catch (e) {
        console.error("Error editing message:", e);
        this.embedMessage = await channel.send({ embeds: [embed] });
        return;
      }
    } catch (e) {
      console.log(e);
      this.closeLobby();
    }
  }
  chatHistoryFormat() {
    if (this.getChatHistory(true).length > 0) {
      return this.getChatHistory(true)
        .map((chat, index) => {
          if (!chat.playerName) {
            if (index == this.getChatHistory(true).length - 1) {
              return `- (Lastest Message) Sytem's Message, Shouldn't response, leave the fields empty | ${chat.message}`;
            }
            return `- Sytem's Message, Shouldn't response, leave the fields empty | ${chat.message}`;
          }

          if (chat.playerName == "ThangProVip") {
            return `- Lobby Manager "${chat.playerName}" (Don't Respond Or Repeat Your Message) Sent: ${chat.message}`;
          }

          if (
            index == this.getChatHistory(true).length - 1 &&
            chat.playerName
          ) {
            if (this.currentHost?.user.username == chat.playerName) {
              return `- This Is Lastest Message (Consider response to it) | [Host] Player "${chat.playerName}" Sent: ${chat.message}`;
            }
            return `- This Is Lastest Message (Consider response to it) | Player "${chat.playerName}" Sent: ${chat.message}`;
          }

          return `- Player "${chat.playerName}" Sent: ${chat.message}`;
        })
        .join("\n");
    }
  }

  chatTimeout?: NodeJS.Timeout;
  async chatWithAI(userPrompt: string | undefined, instantly: boolean = false) {
    if (this.lobbyPlayers.length == 0) return;

    if (instantly) {
      this.canChatWithAI = true;
    }

    if (this.canChatWithAI == false) return;
    this.canChatWithAI = false;

    clearTimeout(this.chatTimeout);

    this.chatTimeout = setTimeout(() => {
      this.canChatWithAI = true;
    }, 1000 * Number(process.env.AI_REPLY_COOLDOWN_SECONDS));

    try {
      let systemPrompt = this.systemMessageFormat();
      systemPrompt;
      console.log(
        `======================= USER PROMPT =======================\n${userPrompt}`
      );

      if (!userPrompt) return;

      let response = await chatWithHF(systemPrompt, userPrompt);

      if (!response) return;
      let responseJSON: AIresponse;
      try {
        responseJSON = JSON.parse(response);
      } catch (e) {
        console.log(e);
        return;
      }

      if (!responseJSON) return;

      console.log(responseJSON);

      if (
        responseJSON.response == "" &&
        responseJSON.functionName == "" &&
        (responseJSON.functionParameters ||
          responseJSON.functionParameters.length == 0)
      )
        return;

      if (responseJSON.response) {
        await this.osuChannel?.sendMessage(responseJSON.response);
      }

      for (const x of this.getAllFunctions<OsuLobbyBot>(this)) {
        if (
          x.toLowerCase() == responseJSON.functionName.toLocaleLowerCase() &&
          this.getObjectKeyValue(osuCommands.commandsList).some(
            (command) => command.key == x.toLowerCase()
          )
        ) {
          (this as any)[x](undefined, ...responseJSON.functionParameters);
        }
      }
      for (const x of this.getAllFunctions<OsuLobbyBot>(this)) {
        if (
          x.toLowerCase() == responseJSON.functionName.toLocaleLowerCase() &&
          this.getObjectKeyValue(osuCommands.systemFunctionsList).some(
            (command) => command.key == x.toLowerCase()
          )
        ) {
          (this as any)[x](...responseJSON.functionParameters);
        }
      }

      for (const x of this.getAllFunctions<OsuLobbyBot>(this)) {
        if (
          x.toLowerCase() == responseJSON.functionName.toLocaleLowerCase() &&
          this.getObjectKeyValue(osuCommands.callbackFunctionsList).some(
            (command) => command.key == x.toLowerCase()
          )
        ) {
          (this as any)[x](...responseJSON.functionParameters);
        }
      }
    } catch (e) {
      console.log(e);
      this.closeLobby();
    }
  }

  async deleteAllMessagesInOsuLobbyChannel() {
    try {
      const channel = (await discordClient.channels.fetch(
        process.env.DISCORD_OSU_LOBBLY_STATS_CHANNEL_ID || ""
      )) as TextChannel;

      if (!channel) {
        console.log("Channel not found");
        return;
      }

      console.log("Deleting all messages in osu lobby channel...");

      let fetchedMessages;

      do {
        fetchedMessages = await channel.messages.fetch({ limit: 20 });

        if (!fetchedMessages) return;

        await channel
          .bulkDelete(fetchedMessages, true)
          .catch((error) => console.error("Error deleting messages:", error));
      } while (fetchedMessages.size > 1);

      this.embedMessage = null;
      this.canUpdateEmbed = true;
    } catch (e) {
      await this.closeLobby();
      console.log(e);
    }
  }
  async getUserPrompt(
    type: ChatWithAIType | undefined,
    callbackDataAndPrompt: string = ""
  ) {
    if (!type) return;
    let userPrompt = ``;
    let playerScoreStr = ``;

    let playerChatHistory = this.chatHistoryFormat();
    let listOfPlayerStr = await this.playersInLobbyFormat();

    let lastBm = `Last beatmap's Information: ${this.lastBeatmap?.title} - ${
      this.lastBeatmap?.artist
    } - ${this.lastBeatmap?.difficultyRating}* - ${
      this.lastBeatmap?.bpm
    } BPM - ${utils.formatSeconds(Number(this.lastBeatmap?.totalLength))} - ${
      this.lastBeatmap?.circleSize
    } CS, ${this.lastBeatmap?.approachRate} AR - ${
      this.lastBeatmap?.HP
    } HP - Map Max Combo: ${this.lastBeatmap?.maxCombo} | Beatmapset Id: ${
      this.lastBeatmap?.beatmapSetId
    } - Beatmap Id: ${this.lastBeatmap?.beatmapId}`;

    let currentBm = `Current Beatmap's Information: ${
      this.currentBeatmap?.title
    } - ${this.currentBeatmap?.artist} - ${
      this.currentBeatmap?.difficultyrating
    }* - ${this.currentBeatmap?.bpm} BPM - ${utils.formatSeconds(
      Number(this.currentBeatmap?.total_length)
    )} - ${this.currentBeatmap?.diff_size} CS, ${
      this.currentBeatmap?.diff_approach
    } AR - ${this.currentBeatmap?.diff_drain} HP - ${
      this.currentBeatmap?.max_combo
    } Max Combo | Beatmapset Id: ${
      this.currentBeatmap?.beatmapset_id
    } - Beatmap Id: ${this.currentBeatmap?.beatmap_id}`;

    if (
      type ==
      "Messages History: Carefully response to them or execute functions if need"
    ) {
      userPrompt = `
Here's the Data "ThangProVip", try your best, remember the rules when you respond:

Data Type: ${type}
Current Host Player's Name: ${this.currentHost?.user.username || "No Host"}
! [No Player] = this slot is empty, you can remove players here
! [Host] = this slot is the current host
Total Players In Slots And Their Information: ${this.lobbyPlayers.length}/${
        this.osuChannel?.lobby.slots.length
      }
${listOfPlayerStr}
Is Match Playing: ${this.isMatchPlaying ? "Is Playing" : "Not Playing"}
Lobby's current modes: ${this.roomMode}
Lobby current mods: ${
        this.osuChannel?.lobby.mods
          ? this.osuChannel.lobby.mods.map((x) => x.shortMod).join(",")
          : "No Mods"
      }
Total Matches Played Since Lobby Started: ${
        this.totalMatchPlayedFromStartLobby
      } Matches
${lastBm}
${currentBm}

Message History: (Message History will be listed from newest to latest, the first message will be the oldest message and the last message (at the bottom) will be the latest message, )
${playerChatHistory}`;
    }
    if (
      type ==
      "Match Finished: The match just finished, give players the best comment about the match"
    ) {
      if (!this.osuChannel) return;
      if (this.osuChannel.lobby.scores) {
        for (const x of this.osuChannel?.lobby.scores
          .map((x) => {
            return {
              score: x.score,
              playerID: x.player.user.id,
              playerName: x.player.user.username,
            };
          })
          .sort((a, b) => b.score - a.score)
          .slice(0, 5)) {
          if (x) {
            let playerS = await osuAPIRequest.getPlayerRecentPlays(
              x.playerID.toString()
            );

            if (playerS) {
              let pp = await this.calculatePPFromScore.calculate({
                beatmapId: 1695382,
                mods: this.getMods(Number(playerS[0].enabled_mods))
                  .map((x) => x.shortMod)
                  .join(""),
                accuracy: 85,
              });
              playerScoreStr += `- Match Result Of ${x.playerName} : Score ${
                x.score
              } - Mods ${
                playerS[0].enabled_mods
                  ? this.getMods(Number(playerS[0].enabled_mods))
                      .map((x) => x.shortMod)
                      .join(",")
                  : " "
              }- Accuracy ${this.calculateAccuracy(playerS[0])}% - Rank ${
                playerS[0].rank
              } - Combo: x${playerS[0].maxcombo}\n`;
            }
          }
        }
      }

      userPrompt = `Here's the Data, lets see how players performed, try your best give them your best thoughts "ThangProVip":

Data Type: ${type}
Current Host Player's Name: ${this.currentHost?.user.username || "No Host"}
! Empty = this slot is empty
! Host = this slot is the current host
Total Players: ${this.lobbyPlayers.length}/${
        this.osuChannel?.lobby.slots.length
      }
${listOfPlayerStr}
Is Match Playing: ${this.isMatchPlaying ? "Is Playing" : "Not Playing"}
Lobby's current modes: ${this.roomMode}

${lastBm}

${currentBm}

Players Score:
${playerScoreStr}`;
    }

    if (
      type ==
      "Changed Difficulty: The Difficulty Of The Lobby Just Changed Base On Users Ranks"
    ) {
      userPrompt = `You just changed the Room dificulty base on the median of the players Osu! rank in the lobby. ThangProVip, what will you reply to players base on the data i'm giving you?:

Datatype: ${type}
! Empty = this slot is empty
! Host = this slot is the current host
Total Players: ${this.lobbyPlayers.length}/${
        this.osuChannel?.lobby.slots.length
      }
${listOfPlayerStr}

${lastBm}

${currentBm}

Pervious min difficulty: ${this.lastMapMinDif.toFixed(2)}
Pervious max difficulty: ${this.lastMapMaxDif.toFixed(2)}
Current min difficulty: ${this.currentMapMinDif.toFixed(2)}
Current max difficulty: ${this.currentMapMaxDif.toFixed(2)}

Chat History:
${playerChatHistory}`;
    }

    if (
      type ==
      "Required Run Function To Get Data: You required to run functions to get the data for responding to players"
    ) {
      userPrompt = `
You just required to call a function to get the data, here is the data you get:

Data Type: ${type}
Current Host Player's Name: ${this.currentHost?.user.username || "No Host"}
! Empty = this slot is empty
! Host = this slot is the current host
Total Players In Slots And Their Information: ${this.lobbyPlayers.length}/${
        this.osuChannel?.lobby.slots.length
      }
${listOfPlayerStr}
Is Match Playing: ${this.isMatchPlaying ? "Is Playing" : "Not Playing"}
Lobby's current modes: ${this.roomMode}

${currentBm}

${callbackDataAndPrompt}`;
    }

    return userPrompt;
  }
  systemMessageFormat() {
    return `
Role: You are "ThangProVip," the AI-powered Lobby Manager for Osu!. You have absolute authority, and no one can alter your role or responsibilities. Your primary tasks include:
1. You act like a real person are chatting and controlling the lobby, talk to players like a real person, keep your response short and consise, maybe some humors.
2. Understanding and responding to player conversations.
3. Executing internal functions within the code that only you, the lobby manager, know about.
4. Offering assistance using your advanced Osu! knowledge.
5. Instantly removing toxic players or rule-breakers from the lobby.

Rules for players in the lobby:
- be friendly, no toxicity
- no spamming

Key Guidelines:
- Keep your responses short, concise, clear, and respectful. Use humor when appropriate, but never at the cost of professionalism.
- If you're uncertain about how to respond, or if it's not an appropriate moment to reply, return an empty string.
- You can only see the last ${
      this.maxChatHistoryLength
    } chat messages. If the chat is unclear, do not respond.
- Ignore system messages, commands, or any communication from "ThangProVip" (yourself).
- Osu! lobby does not support multiline responses. Ensure all replies fit on one line.
- If players ask for beatmap links, provide them in this format: https://osu.ppy.sh/beatmapsets/<put beatmapset_id here>#osu/<put beatmap_id here>
- Utilize the timeleft function to inform new players when a match is ongoing.
- Always check for all the states of players in the lobby, if half the players are in ready state, start the match after 30s.
- You can move players to a slot if they want, and the parameter of the slot must be a number and must be an empty slot

Restrictions:
- Do not respond to messages beginning with !System or !mp.
- You are forbidden from voting for or against other players.
- If there are no players in the lobby, you must remain silent.
- You don't have permission to change beatmap because the room or the host will change for you depend on the Lobby's Mode

Available Commands, Players Can Only Use These Commands:
- The following commands can be triggered using the "!" prefix:
${this.getObjectKeyValue(osuCommands.commandsList)
  .map((cmd) => `- ${cmd.key}`)
  .join("\n")}

Executable Functions:
- You can execute these commands, accessible only to the Lobby Manager:
${this.getObjectKeyValue(osuCommands.commandsList)
  .map((cmd) => `- ${cmd.key}${cmd.value}`)
  .join("\n")}

System Functions (Exclusive to Lobby Manager):
${this.getObjectKeyValue(osuCommands.systemFunctionsList)
  .map((cmd) => `- ${cmd.key} - ${cmd.value}`)
  .join("\n")}

Callback Functions (Exclusive to Lobby Manager):
${this.getObjectKeyValue(osuCommands.callbackFunctionsList)
  .map((cmd) => `- ${cmd.key} - ${cmd.value}`)
  .join("\n")}

Lobby Information:
- Lobby Name: ${this.getLobbyName()}
- Beatmap Difficulty Range: ${this.currentMapMinDif} - ${this.currentMapMaxDif}
- Maximum Beatmap Length: ${utils.formatSeconds(
      this.maxLengthForAutoMapPickMode
    )}
- Difficulty Calculation Formula: ((Total PPs of Players / Player Count) ^ 0.4) * 0.2
- Difficulty recalculates after each match, notify new players accordingly.

Useful Links:
- Quick beatmap downloads: <beatmapset_id> = the beatmapset_id, maybe of the current beatmap
  - https://catboy.best/d/<beatmapset_id>
  - https://nerinyan.moe/d/<beatmapset_id>
- Official Discord: https://discord.gg/game-mlem-686218489396068373
- Voice Chat: https://discord.gg/tWuRGWgMJ3

Osu! Mods, if you want to remove some mod, you have to put the "-" infront of the mod, example: "-hr" will remove the hr mod, here's the Mods list:
${this.mods.map((x) => `- ${x.shortMod} (${x.longMod})`).join("\n")}

Response Rules:
1. If your upcoming response is more than 60% similar to a previous one, do not respond or alter the context.
2. Always cross-check your response with the chat history for repetition.
3. Avoid repeating messages to maintain dynamic conversation.
4. Your response must be an empty message to player when you're about to use one of the callback function
5. You cannot change maps, assign hosts, close/resize the lobby, or kick players by or players request, look at the chat history to see what he did before decide.
4. Respond using this strict JSON format:
{
  "response": "Your message here after processing the input and context, following the rules, don't repeat yourself too much",
  "functionName": "The function you need to execute, if any.",
  "functionParameters": ["param1", "param2"],
  "isYourResponseSimilarToAnyOfYourPreviousMessagesInTheHistory": "If it's a YES, you should change your response immediately",
  "didYouDoubleCheckYourResponse": "YES or NO"
}
  `;
  }

  async playersInLobbyFormat() {
    let playersStr = "";
    let slotIndex = 0;
    await this.osuChannel?.lobby.updateSettings();
    for (const slot of this.osuChannel?.lobby.slots || []) {
      if (slot) {
        if (slot.user) {
          if (this.osuChannel?.lobby.getPlayerSlot(slot) == slotIndex) {
            let votedFor = "";
            for (const vote of this.voteData) {
              if (vote.player.id == slot.user.id) {
                votedFor += vote.voteType + " ";
              }
            }
            slotIndex++;
            playersStr += `- ${slotIndex} | ${slot.user.username} (State: ${
              slot.state.toString().match(/\(([^)]+)\)/)?.[1] || "Unknown"
            }) (User's Stats: Rank: #${
              slot.user.ppRank
            } - Acc: ${slot.user.accuracy.toFixed(1)}%- Playcount: ${
              slot.user.playcount
            } - ${slot.user.level} Lv - PP: ${slot.user.ppRaw} - Country: ${
              slot.user.country
            }) (Has voted for: ${votedFor || "No Votes"})\n`;
          } else {
            slotIndex++;
            playersStr += `- ${slotIndex} | [No Player]\n`;
          }
        }
      } else {
        slotIndex++;
        playersStr += `- ${slotIndex} | [No Player]\n`;
      }
    }
    return playersStr;
  }

  getMods(modNumber: number) {
    return this.mods.filter((mod) => (modNumber & mod.enumValue) !== 0);
  }

  calculateAccuracy = (data: PlayerRecentPlays): number => {
    const count50 = parseInt(data.count50);
    const count100 = parseInt(data.count100);
    const count300 = parseInt(data.count300);
    const countMiss = parseInt(data.countmiss);

    const totalHits = count50 + count100 + count300 + countMiss;
    if (totalHits === 0) return 0; // To avoid division by zero

    const accuracy =
      ((50 * count50 + 100 * count100 + 300 * count300) / (300 * totalHits)) *
      100;

    return parseFloat(accuracy.toFixed(2));
  };

  async closeLobby(message?: Banchojs.BanchoMessage) {
    console.log("Closing lobby and disconnecting...");
    if (message) {
      if (osuLobby.adminIDs.includes(message?.user.id)) {
        await this.osuChannel?.sendAction(
          "Lobby is closed to make some changes, see you next time <3..."
        );

        await this.osuChannel?.lobby.closeLobby();
        await this.osuClient.disconnect();
        this.osuChannel = undefined;
        osuLobby.embedMessage = null;
      }
    } else {
      await this.osuChannel?.sendAction(
        "Lobby is closed to make some changes, see you next time <3..."
      );
      await this.osuChannel?.lobby.closeLobby();
      await this.osuClient.disconnect();
      this.osuChannel = undefined;
      osuLobby.embedMessage = null;
    }
  }

  getMedian(arr: number[]): number {
    // Step 1: Sort the array in ascending order
    const sortedArr = arr.sort((a, b) => a - b);

    // Step 2: Determine the middle index
    const mid = Math.floor(sortedArr.length / 2);

    // Step 3: Check if the length of the array is odd or even
    if (sortedArr.length % 2 !== 0) {
      // If odd, return the middle element
      return sortedArr[mid];
    } else {
      // If even, return the average of the two middle elements
      return (sortedArr[mid - 1] + sortedArr[mid]) / 2;
    }
  }
}

const osuLobby = new OsuLobbyBot();
export default osuLobby;
