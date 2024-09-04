//TODO CHECK IF A HOST PICK DT, REMOVE IT OR THE MAP IS TOO EASY THEN DT IT
//TODO MAKE BAN FUNCTION

import dotenv from "dotenv";

require("events").defaultMaxListeners = 60;
dotenv.config();

import * as Banchojs from "bancho.js";
import osuAPIRequest, {
  Beatmap,
  PlayerRecentPlays,
  Beatmap as v1Beatmap,
} from "./OsuAPIRequest";
import utils from "../Utils";
import { EmbedBuilder, Message, TextChannel } from "discord.js";
import { discordClient } from "../index";
import groqRequestAI from "../GroqcloudAIRequest";
import * as ns from "nodesu";

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
  | "Normal Chat Based On Chat History"
  | "Match Finished"
  | "Change Difficulty Based On Users Rank";

class OsuLobbyBot {
  osuClient = new Banchojs.BanchoClient({
    username: process.env.OSU_IRC_USERNAME!,
    password: process.env.OSU_IRC_PASSWORD!,
    apiKey: process.env.OSU_API_KEY,
  });

  osuChannel: Banchojs.BanchoMultiplayerChannel | undefined;

  adminIDs: number[] = [];

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

  commandsList = {
    rhelp: "//Use it to get all the commands for players",
    votechangemode: `(player_name: string) //Use it to switch the lobby's mode between "Host Rotate" and "Random Map", the parameter must be the playerName`,
    voteskipmap: "(player_name: string) //Use it to skip the current map",
    voteskiphost: "(player_name: string) //Use it to skip the current host",
    voteabortmatch: "(player_name: string) //Use it to abort the match",
    votestartmatch: "(player_name: string) //Use it to start the match",
    timeleft:
      "//Player can use it to get the time left of the match if it's in progress",
  };

  systemFunctionsList = {
    kickplayer:
      "kick a player from the lobby, with the function's parameters: playerName: string",
    moveplayertoslot:
      "move a player to a specific slot from 1 to 16, with the function's parameters: playerName: string, slot: number",
  };

  adminFunctionList = {
    closelobby: "close the lobby",
    kickplayer:
      "kick a player from the lobby, with the function's parameters: playerName: string",
  };

  lobbyPlayers: Banchojs.BanchoLobbyPlayer[];

  playersChatHistory: PlayerChatHistory[] = [];

  maxChatHistoryLength = 44;

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
  lastBeatmap: ns.Beatmap | undefined = undefined;

  skipVotesTotal = 0;

  startMatchAllPlayersReadyTimeout = 10;
  timeoutAfterRoomModeChangeToAutoPick = 20;
  startMatchTimeout = 60;

  beatmapsSinceDay = new Date(2018, 1, 1);
  beatmaps: v1Beatmap[] = [];

  currentHost?: Banchojs.BanchoLobbyPlayer;

  lastBeatmapToRepick: BeatmapIDs | null = null;
  matchIsPlaying: boolean = false;
  matchIsStarting = false;

  lobbyName = "";
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

    setInterval(async () => {
      this.updateEmbed();
      if (!this.matchIsPlaying) return;
      if (await this.areAllPlayersReady()) {
        this.startMatchTimer();
      }
    }, 1000 * 7);

    setInterval(async () => {
      await this.changeDifficultyBaseOnPlayersRank();
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
    this.lobbyName = `${this.currentMapMinDif}* - ${this.currentMapMaxDif}* | Auto - !rhelp - DC: Game Mlem`;
    try {
      this.osuChannel = await this.osuClient.createLobby(this.lobbyName, false);

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

        if (this.roomMode == "Auto Map Pick") {
          if (this.lobbyPlayers.length >= 4) {
            if (await this.areAllPlayersReady())
              await this.startMatchTimer(this.startMatchTimeout);
          }
        }
      });

      this.osuChannel.lobby.on("playerLeft", async (lobbyPlayer) => {
        try {
          await this.updateLobbyPlayers(lobbyPlayer, "left");
          console.log(`- ${lobbyPlayer.user.username} left the lobby`);

          if (
            lobbyPlayer.user.id == this.currentHost?.user.id &&
            this.roomMode == "Host Rotate"
          ) {
            if (this.matchIsPlaying == false && this.lobbyPlayers.length > 0) {
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
        this.chatWithAI("Normal Chat Based On Chat History");

        let msg = message.message;
        console.log(`${message.user.username}: ${msg}`);
        if (msg.startsWith("!")) {
          let args = msg.substring(1, msg.length).toLowerCase().split(" ");
          if (this.adminIDs.includes(message.user.id)) {
            for (const x of this.getAllFunctions<OsuLobbyBot>(this)) {
              if (
                x.toLowerCase() == args[0] &&
                this.getObjectKeyValue(this.adminFunctionList).some(
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
              this.getObjectKeyValue(this.commandsList).some(
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
        //Changing Beatmap
        try {
          if (this.roomMode == "Auto Map Pick") {
            await this.autoMapPick();

            if (this.lobbyPlayers.length >= 4) {
              this.osuChannel?.lobby.startMatch(this.startMatchTimeout);
            }
          }

          if (this.roomMode == "Host Rotate") {
            //Host Rotation
            await this.hostRotate();
          }
          this.matchStartTime = null;
          setTimeout(async () => {
            if (!this.osuChannel) return;
            try {
              await this.chatWithAI("Match Finished", 2);
            } catch (e) {
              console.error("ERROR: ", e);
              this.closeLobby();
            }
          }, 1000 * 2);
        } catch (e) {
          console.error("ERROR: ", e);
          this.closeLobby();
        }
      });

      this.osuChannel.lobby.on("matchAborted", async () => {
        console.log("MATCH ABORTED");
        if (this.roomMode == "Auto Map Pick" && this.lobbyPlayers.length > 0) {
          if (this.lobbyPlayers.length >= 4) {
            this.osuChannel?.lobby.startMatch(
              this.timeoutAfterRoomModeChangeToAutoPick
            );
          }
        }
      });

      this.osuChannel.lobby.on("beatmap", async (b) => {
        this.osuClient.osuApi.multi.getMatch(Number(this.osuChannel?.lobby.id));
        if (this.roomMode == "Host Rotate") {
          console.log("Host Pick Map");

          // Check if the beatmap is valid
          try {
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
          } catch (e) {
            await this.closeLobby();
            console.log(e);
          }
        }
      });

      this.osuChannel.lobby.on("matchStarted", async () => {
        this.matchStartTime = Date.now();
        this.voteData = [];
        this.lastBeatmap = this.osuChannel?.lobby.beatmap;
      });

      this.osuChannel.lobby.on("playing", async (state) => {
        this.matchIsPlaying = state;
        if (this.osuChannel)
          if (state) {
            this.matchIsStarting = false;
          }
        if (this.lobbyPlayers.length === 0 && state) {
          this.osuChannel?.sendMessage("Match aborted because no players");
          this.osuChannel?.lobby.abortMatch();
          this.matchAbortTimer();
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
          !message.message.startsWith("!") &&
          !this.getObjectKeyValue(this.commandsList).some(
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
      this.playersChatHistory.shift();
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

  async changeLobbyName() {
    if (this.osuChannel) {
      if (!(this.currentMapMaxDif && this.currentMapMinDif)) {
        this.currentMapMinDif = 0;
        this.currentMapMaxDif = 0;
      }

      this.lobbyName = `${this.currentMapMinDif.toFixed(
        1
      )}* - ${this.currentMapMaxDif.toFixed(
        1
      )}* | Auto - !rhelp - DC: Game Mlem`;
      if (this.lastLobbyName == this.lobbyName) return;
      this.lastLobbyName = this.lobbyName;
      await this.osuChannel.lobby.setName(this.lobbyName);
    }
  }

  async changeDifficultyBaseOnPlayersRank() {
    if (this.matchIsPlaying) return;
    let ranks: number[] = [];

    if (!this.osuChannel) return;

    for (const slot of this.osuChannel.lobby.slots) {
      if (slot) {
        if (slot.user) {
          ranks.push(slot.user.ppRaw);
        }
      }
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

    if (max != this.currentMapMaxDif && min != this.currentMapMinDif) {
      this.lastMapMinDif = this.currentMapMinDif;
      this.lastMapMaxDif = this.currentMapMaxDif;
      this.currentMapMinDif = min;
      this.currentMapMaxDif = max;
      await this.changeLobbyName();
      await this.chatWithAI("Change Difficulty Based On Users Rank", 1);
      await this.autoMapPick();
    }
  }

  //Show players commands
  async rhelp(message?: Banchojs.BanchoMessage, playerName?: string) {
    if (!this.osuChannel) return;
    await this.osuChannel.sendMessage(
      `This is list of the commands, start with "!":`
    );
    for (const command of this.getObjectKeyValue(this.commandsList)) {
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

    if (this.matchIsPlaying) {
      await this.osuChannel.sendMessage(
        "Can't host when the match is in playing!"
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
      await this.matchAbortTimer();
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
      await this.closeLobby();
    }
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

  covertBeatmapV2ToV1(bm: ns.Beatmap) {
    let bmv1: Beatmap | null = null;
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
      await this.osuChannel.lobby.setMap(75);
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

    this.currentBeatmap = this.beatmaps[randomBeatmapIndex];
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

  async startMatchTimer(timeSecond: number = 0) {
    console.log("START MATCH TIMER");
    if (this.matchIsStarting) return;
    if (timeSecond > 0) {
      this.osuChannel?.lobby.startMatch(timeSecond);
    } else {
      this.osuChannel?.lobby.startMatch();
    }

    this.matchIsStarting = true;
  }

  async matchAbortTimer() {
    await this.osuChannel?.lobby.abortTimer();
    this.matchIsStarting = false;
  }

  embedMessage: Message | null = null;
  //Create an embed for the match using the client variable in index.ts, send it to this channel id "967479977979297862", it'll contain the lobby's name, players info, the current map, and start updating it when there's player in the lobby, update it every 10 seconds
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
      )} - ${
        this.currentBeatmap?.bpm
      } BPM](${`https://osu.ppy.sh/beatmapsets/${this.lastBeatmapToRepick?.beatmapset_id}#osu/${this.lastBeatmapToRepick?.beatmap_id}`})`;

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

      const embed = new EmbedBuilder()
        .setTitle(this.lobbyName)
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
        .setColor(0xf071a9)
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
              return `- (${utils.formattedDate(
                chat.timestamp
              )}) (Lastest Message) Sytem's Message, Don't response, Leave All The Fields Empty | ${
                chat.message
              }`;
            }
            return `- (${utils.formattedDate(
              chat.timestamp
            )}) Sytem's Message, Don't response, Leave All The Fields Empty | ${
              chat.message
            }`;
          }

          if (chat.playerName == "ThangProVip") {
            if (index == this.getChatHistory(true).length - 1) {
              return `- (${utils.formattedDate(
                chat.timestamp
              )}) (Lastest Message) Lobby Manager "${
                chat.playerName
              }" (You) Sent: ${chat.message}`;
            }
            return `- (${utils.formattedDate(chat.timestamp)}) Lobby Manager "${
              chat.playerName
            }" (You) Sent: ${chat.message}`;
          }

          if (
            index == this.getChatHistory(true).length - 1 &&
            chat.playerName
          ) {
            if (this.currentHost?.user.username == chat.playerName) {
              return `- (${utils.formattedDate(
                chat.timestamp
              )}) This Is Lastest Message (Consider response to it) | [Host] Player "${
                chat.playerName
              }" Sent: ${chat.message}`;
            }
            return `- (${utils.formattedDate(
              chat.timestamp
            )}) This Is Lastest Message (Consider response to it) | Player "${
              chat.playerName
            }" Sent: ${chat.message}`;
          }

          return `- (${utils.formattedDate(chat.timestamp)}) Player "${
            chat.playerName
          }" Sent: ${chat.message}`;
        })
        .join("\n");
    }
  }

  //This function will be updated using setInterval, it'll send the chat history of the latest 100 message to the cohereAI to get the response, and send the response to the channel or maybe use it to execute some function in the future
  async chatWithAI(
    type: ChatWithAIType,
    cooldown: number = Number(process.env.AI_REPLY_COOLDOWN_SECONDS)
  ) {
    if (this.lobbyPlayers.length == 0) return;

    if (cooldown == 0) {
      this.canChatWithAI = true;
    }
    if (this.canChatWithAI == false) return;
    this.canChatWithAI = false;
    setTimeout(() => {
      this.canChatWithAI = true;
    }, 1000 * cooldown);

    if (type == "Normal Chat Based On Chat History") {
      if (!this.playersChatHistory) return;
    }

    try {
      let playerChatHistory = this.chatHistoryFormat();

      let listOfPlayerStr = this.playerStrFormat();
      let systemPrompt = this.systemMessageFormat();

      let userPrompt = await this.userPromptFormat(
        type,
        listOfPlayerStr,
        playerChatHistory
      );
      if (!userPrompt) return;

      let response = await groqRequestAI.chat(systemPrompt, userPrompt);

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

      if (responseJSON.response) {
        await this.osuChannel?.sendMessage(responseJSON.response);
      }

      for (const x of this.getAllFunctions<OsuLobbyBot>(this)) {
        if (
          x.toLowerCase() == responseJSON.functionName.toLocaleLowerCase() &&
          this.getObjectKeyValue(this.commandsList).some(
            (command) => command.key == x.toLowerCase()
          )
        ) {
          (this as any)[x](undefined, ...responseJSON.functionParameters);
        }
      }
      for (const x of this.getAllFunctions<OsuLobbyBot>(this)) {
        if (
          x.toLowerCase() == responseJSON.functionName.toLocaleLowerCase() &&
          this.getObjectKeyValue(this.systemFunctionsList).some(
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
        fetchedMessages = await channel.messages.fetch({ limit: 10 });

        if (!fetchedMessages) return;

        await channel
          .bulkDelete(fetchedMessages, true)
          .catch((error) => console.error("Error deleting messages:", error));
      } while (fetchedMessages.size >= 2);

      this.embedMessage = null;
      this.canUpdateEmbed = true;
    } catch (e) {
      await this.closeLobby();
      console.log(e);
    }
  }
  async userPromptFormat(
    type: ChatWithAIType,
    listOfPlayerStr: string,
    playerChatHistory: string | undefined = ""
  ) {
    let userPrompt = ``;
    let playerScoreStr = ``;
    console.log("TYPE: ", type);

    if (type == "Normal Chat Based On Chat History") {
      userPrompt = `
Here's the Data "ThangProVip", try your best, remember the rules when you respond:

Data Type: ${type}
Current Host Player's Name: ${this.currentHost?.user.username || "No Host"}
Discord Link: https://discord.gg/game-mlem-686218489396068373
! Empty = this slot is empty
! Host = this slot is the current host
Total Players: ${this.lobbyPlayers.length}/${
        this.osuChannel?.lobby.slots.length
      }
${listOfPlayerStr}
Is Match Playing: ${this.matchIsPlaying ? "Is Playing" : "Not Playing"}
Lobby's current modes: ${this.roomMode}
Map's Information: ${this.currentBeatmap?.title} - ${
        this.currentBeatmap?.artist
      } - ${this.currentBeatmap?.difficultyrating}* - ${
        this.currentBeatmap?.bpm
      } BPM - ${utils.formatSeconds(
        Number(this.currentBeatmap?.total_length)
      )} - ${this.currentBeatmap?.diff_size} CS, ${
        this.currentBeatmap?.diff_approach
      } AR - ${this.currentBeatmap?.diff_drain} HP | Beatmapset Id: ${
        this.currentBeatmap?.beatmapset_id
      } - Beatmap Id: ${this.currentBeatmap?.beatmap_id}

Message History:
${playerChatHistory}`;
    }

    if (type == "Match Finished") {
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
          .slice(0, 3)) {
          if (x) {
            let playerS = await osuAPIRequest.getPlayerRecentPlays(
              x.playerID.toString()
            );

            if (playerS) {
              playerScoreStr += `- Match Result Of ${x.playerName} : Score ${
                x.score
              } - Mods ${this.getMods(Number(playerS[0].enabled_mods))
                .map((x) => x.shortMod)
                .join(",")} - Accuracy ${this.calculateAccuracy(
                playerS[0]
              )}% - Rank ${playerS[0].rank} - Combo: x${playerS[0].maxcombo}`;
            }
          }
        }
      }

      userPrompt = `Here's the ${type} Data, lets see how players performed, try your best give them your best thoughts "ThangProVip":

Data Type: ${type}
Current Host Player's Name: ${this.currentHost?.user.username || "No Host"}
Discord Link: https://discord.gg/game-mlem-686218489396068373
! Empty = this slot is empty
! Host = this slot is the current host
Total Players: ${this.lobbyPlayers.length}/${
        this.osuChannel?.lobby.slots.length
      }
${listOfPlayerStr}
Is Match Playing: ${this.matchIsPlaying ? "Is Playing" : "Not Playing"}
Lobby's current modes: ${this.roomMode}
Map's Information: ${this.lastBeatmap?.title} - ${this.lastBeatmap?.artist} - ${
        this.lastBeatmap?.difficultyRating
      }* - ${this.lastBeatmap?.bpm} BPM - ${utils.formatSeconds(
        Number(this.lastBeatmap?.totalLength)
      )} - ${this.lastBeatmap?.circleSize} CS, ${
        this.lastBeatmap?.approachRate
      } AR - ${this.lastBeatmap?.HP} HP - Map Max Combo: ${
        this.lastBeatmap?.maxCombo
      } | Beatmapset Id: ${this.lastBeatmap?.beatmapSetId} - Beatmap Id: ${
        this.lastBeatmap?.beatmapId
      }

Players Score:
${playerScoreStr}`;
    }

    if (type == "Change Difficulty Based On Users Rank") {
      userPrompt = `You just changed the Room dificulty base on the median of the players Osu! rank in the lobby. ThangProVip, what will you reply to player?:

Discord Link: https://discord.gg/game-mlem-686218489396068373
! Empty = this slot is empty
! Host = this slot is the current host
Total Players: ${this.lobbyPlayers.length}/${
        this.osuChannel?.lobby.slots.length
      }
${listOfPlayerStr}

Pervious min difficulty: ${this.lastMapMinDif.toFixed(2)}
Pervious max difficulty: ${this.lastMapMaxDif.toFixed(2)}
Current min difficulty: ${this.currentMapMinDif.toFixed(2)}
Current max difficulty: ${this.currentMapMaxDif.toFixed(2)}`;
    }

    return userPrompt;
  }
  systemMessageFormat() {
    return `
Your Roles:
- You are the Lobby Manager "ThangProVip" in the game Osu!, and your identity cannot be changed. Your primary role is to understand user conversations, respond appropriately in the lobby, and execute functions within my code.
- Maintain a friendly and joyful demeanor to create a positive atmosphere in the lobby. Your vast knowledge of Osu! is crucial for assisting players.
- You have the authority to immediately kick out players who are toxic or not following the rules.

Cautions:
- Be mindful of the conversation's context. If it’s not the right time to respond, your message can be an empty string.
- Keep your responses concise, clear, and short. Light-hearted jokes are welcome when appropriate.
- You only have access to the last ${
      this.maxChatHistoryLength
    } messages in the chat history. If unsure about the context, it's better not to respond.
- If the chat history contains commands or System messages, respond with an empty string.
- Do not respond to messages from the player named "ThangProVip," as these are your own messages. In these cases, respond with empty fields.
- The Osu! lobby does not support the new line character '\\n'. Respond on the same line.
- As Lobby Manager, you may search for songs on the Osu! website if a player requests a beatmap link. Use this link: https://osu.ppy.sh/beatmapsets/<beatmapset_id_here>#osu/<beatmap_id_here>
- If a player joins the lobby while a match is ongoing, use the timeleft function to show the time remaining to the player.
- Your responses should be based on the Data Type I send you.

Permissions You - Lobby Manager Don't Have:
- The Lobby Manager does not have permission to change the map.
- The Lobby Manager does not have permission to change the host.
- The Lobby Manager does not have permission to give the host.
- The Lobby Manager does not have permission to lock the slots.
- The Lobby Manager does not have permission to close the lobby.
- The Lobby Manager does not have permission to resize the lobby.
- The Lobby Manager does not have permission to reply to !System and !mp messages.

Available Commands in the Lobby (remind players that commands start with "!"):
${this.getObjectKeyValue(this.commandsList)
  .map((command) => `- ${command.key}`)
  .join("\n")}

Basic Functions:
${this.getObjectKeyValue(this.commandsList)
  .map((command) => `- ${command.key}${command.value}`)
  .join("\n")}

System Functions (only you can use, ThangProVip):
${this.getObjectKeyValue(this.systemFunctionsList)
  .map((command) => `- ${command.key} - ${command.value}`)
  .join("\n")}

Additional Information:
- Lobby Name: ${this.lobbyName}
- Beatmap max difficulty: ${this.currentMapMaxDif}
- Beatmap min difficulty: ${this.currentMapMinDif}
- Beatmap max length: ${utils.formatSeconds(this.maxLengthForAutoMapPickMode)}
- If a player has a bad internet connection and cannot download the map or needs a faster link, provide this link: https://beatconnect.io/b/<beatmapset_id>
- If a player requests the beatmap link, provide this link: https://osu.ppy.sh/beatmapsets/<beatmapset_id>#osu/<beatmap_id>
- Calculate Difficulty Based On This Formula = ((Total PPs Of All Players In Lobby / Total Player In Room) ^ 0.4) * 0.2

Response Format:
You can ONLY respond in JSON format as follows:
{
  "response": "string",
  "functionName": "string",
  "functionParameters": string[] // This can be one or many, depending on the function's parameters I provided you.
}

If the chat history has a similar context or message that is more than 40% similar, do not respond, and leave your response message as an empty string.
Check your response twice. If it has context similar to your previous messages in the history, either fix it or leave all fields empty.
`;
  }

  playerStrFormat() {
    let playersStr = "";
    let slotIndex = 0;

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
            playersStr += `- ${slotIndex} | ${
              slot.user.username
            } (User's Stats: Rank: #${
              slot.user.ppRank
            } - ${slot.user.accuracy.toFixed(1)}% Acc - ${
              slot.user.playcount
            } Playcount - ${slot.user.level} Lv - PP: ${
              slot.user.ppRaw
            }) (Has voted for: ${votedFor || "No Votes"})\n`;
          } else {
            slotIndex++;
            playersStr += `- ${slotIndex} | [Empty]\n`;
          }
        }
      } else {
        slotIndex++;
        playersStr += `- ${slotIndex} | [Empty]\n`;
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
