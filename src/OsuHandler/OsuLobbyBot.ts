//TODO CHECK IF A HOST PICK DT, REMOVE IT OR THE MAP IS TOO EASY THEN DT IT
//TODO MAKE BAN FUNCTION

//TODO KHI THAY ĐỔI ĐỘ KHÓ, CHECK NẾU MAP HIỆN TẠI CHƯA ĐƯỢC CHƠI VÀ ĐÁP ỨNG ĐIỀU KIỆN CỦA ĐỘ KHÓ VỪA ĐỔI THÌ VẪN GIỮ NGUYÊN MAP
// Load environment variables before anything else for security and proper configuration
import dotenv from "dotenv";
dotenv.config();

// Set default max listeners to avoid potential mem. overflow
require('events').defaultMaxListeners = 15;

// External libraries
import * as Bancho from "bancho.js";
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


type lobbyMode = "Auto Map Pick" | "Host Rotate";
type PlayerStatus = "joined" | "left";

type BeatmapIDs = {
  beatmapID: number;
  beatmapSetID: number;
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
  player: Bancho.BanchoLobbyPlayer;
  voteMapSkip: number;
  voteHostSkip: number;
  VoteMatchAbort: number;
  VoteMatchStart: number;
};


// All different types of votes that can be chosed by the LLM model
type voteType =
  | "Skip Map"
  | "Skip Host"
  | "Abort Match"
  | "Start Match"
  | "Change Mode";


type VoteData = {
  player: Bancho.BanchoUser;
  vote_type: voteType;
};

type ChatWithAIType =
  | "Normal Chat Based On Chat History"
  | "Match Finished"
  | "Change Difficulty Based On Users Rank";

class OsuLobbyBot {
  // constants
  const ROOM_MODE_HOST_ROTATE = "Host Rotate";
  const ROOM_MODE_AUTO_MAP_PICK = "Auto Map Pick";
  const MIN_PLAYERS_FOR_AUTO_MAP_PICK = 4;
  const MAX_PLAYERS_FOR_AUTO_MAP_PICK = 5;



   // Initialize osu! client
   osuClient = new Bancho.BanchoClient({
    username: process.env.OSU_IRC_USERNAME!,
    password: process.env.OSU_IRC_PASSWORD!,
    apiKey: process.env.OSU_API_KEY,
  });

  // Channel and admin details
  osuChannel?: Bancho.BanchoMultiplayerChannel;
  adminUserIds: number[] = [];

  // Lobby settings
  lobbyMode: lobbyMode = "Auto Map Pick";
  lobbyPlayers: Bancho.BanchoLobbyPlayer[] = [];
  currentHost?: Bancho.BanchoLobbyPlayer;

  // Game settings
  medianPlayerPerformance = 0;
  currentMapDifficultyRange = { min: 0, max: 0 };
  lastMapDifficultyRange = { min: 0, max: 0 };
  autoMapPickMaxLength = 240;
  hostRotateMaxLength = 400;
  matchStartTime: number | null = null;
  currentBeatmap: v1Beatmap | null = null;
  lastBeatmap: ns.Beatmap | undefined = undefined;
  lastBeatmapRepick: BeatmapIDs | null = null;
  beatmapsSinceDate = new Date(2018, 1, 1);
  beatmaps: v1Beatmap[] = [];

  // Chat history and voting
  chatHistory: PlayerChatHistory[] = [];
  maxChatHistoryLength = 44;
  voteData: VoteData[] = [];
  playerVotesData: PlayersVotesData[] = [];

  // Voting settings
  skipVotesCount = 0;

  // Cooldowns and timeouts
  canUpdateEmbed = false;
  canChatWithAI = true;
  matchStartReadyTimeout = 10;
  autoPickModeChangeTimeout = 20;
  matchStartTimeout = 60;

  // Mods available in the lobby
  availableMods = [
    { value: 1, shortName: "nf", fullName: "NoFail" },
    { value: 2, shortName: "ez", fullName: "Easy" },
    { value: 8, shortName: "hd", fullName: "Hidden" },
    { value: 16, shortName: "hr", fullName: "HardRock" },
    { value: 32, shortName: "sd", fullName: "SuddenDeath" },
    { value: 64, shortName: "dt", fullName: "DoubleTime" },
    { value: 128, shortName: "rx", fullName: "Relax" },
    { value: 256, shortName: "ht", fullName: "HalfTime" },
    { value: 512, shortName: "nc", fullName: "Nightcore" },
    { value: 1024, shortName: "fl", fullName: "Flashlight" },
    // Add more mods as needed
  ];

  // Command definitions
  commands = {
    rhelp: "//Use it to get all the commands for players",
    changemode: "(player_name: string) //Switch the lobby's mode between 'Host Rotate' and 'Auto Map Pick'",
    skipmap: "(player_name: string) //Vote to skip the current map",
    skiphost: "(player_name: string) //Vote to skip the current host",
    abortmatch: "(player_name: string) //Vote to abort the current match",
    startmatch: "(player_name: string) //Vote to start the match",
    timeleft: "//Get the remaining time for the current match if in progress",
  };

  // System function definitions
  systemFunctions = {
    kickplayer: "(player_name: string) //Kick a player from the lobby.",
    moveplayertoslot: "(player_name: string, slot: number) //Move a player to a specific slot (1-16).",
    schedulematchstart: "(seconds: number) //Start the match after a specified number of seconds. Typically used in Auto Map Pick mode when at least half the players are ready.",
  };

  // Admin function definitions
  adminFunctions = {
    closelobby: "Close the lobby",
    kickplayer: "(player_name: string) //Kick a player from the lobby.",
  };

  // Match status
  isMatchInProgress: boolean = false;
  isMatchStarting: boolean = false;
  previousLobbyName = "";

  constructor() {
    // Initialize the list of lobby players
    this.lobbyPlayers = [];

    // Handle process termination
    process.on("SIGINT", async () => {
      try {
        console.log("Disconnecting from lobby...");

        // Close the lobby and disconnect the osu! client
        if (this.osuChannel) {
          await this.osuChannel.lobby.closeLobby();
        }
        await this.osuClient.disconnect();
      } catch (error) {
        console.error("Error during shutdown:", error);
      }
    });

    // Load and parse admin IDs from environment variables
    const adminIds = process.env.OSU_ADMIN_IDs?.split(" ") || [];

    this.adminUserIds = adminIds.map(id=> Number(id)).filter(id => !isNaN(id));
  }


  // Initializes the osu! client connection
  async init() {
    try {
      await this.osuClient.connect();
      console.log("osu! client connected successfully.");
    } catch (error) {
      console.error("Error connecting osu! client:", error);
    }
  }

  // Starts the bot and sets up periodic tasks
  async start() {
    try {
      console.log("Creating osu! Lobby...");

      // Initialize the client and create the lobby
      await this.init();
      await this.createAndHandleLobby();

      // Set up periodic tasks
      this.setupPeriodicTasks();
    } catch (error) {
      console.error("Error starting osu! Lobby Bot:", error);
    }
  }

  // Sets up the periodic tasks
  private setupPeriodicTasks() {
    // Update embed and start match if all players are ready every 10 seconds
    setInterval(async () => {
      try {
        await this.updateEmbed();
        if (!this.isMatchInProgress) return;

        const allPlayersReady = await this.areAllPlayersReady();
        if (allPlayersReady) {
          this.startMatchTimer();
        }
      } catch (error) {
        console.error("Error during periodic embed update or match start check:", error);
      }
    }, 1000 * 10); // 10 Seconds

    // Adjust lobby name and difficulty based on players' rank every 30 seconds
    setInterval(async () => {
      try {
        if (this.lobbyPlayers.length === 0) {
          await this.changeLobbyName(true);
        }
        await this.changeDifficultyBasedOnPlayersRank();
      } catch (error) {
        console.error("Error during periodic difficulty adjustment:", error);
      }
    }, 1000 * 30); // 30 Seconds

    // Check client connection and reconnect or recreate lobby every 30 minutes
    setInterval(async () => {
      try {
        if (this.osuChannel) {
          await this.osuChannel.lobby.setSize(16);
        }

        if (!this.osuClient.isConnected() && !this.osuChannel) {
          console.log("Reconnecting to the lobby...");
          await this.start();  // Restart the bot
        } else if (this.osuClient.isConnected() && !this.osuChannel) {
          await this.createAndHandleLobby();  // Recreate the lobby if needed
        }
      } catch (error) {
        console.error("Error during periodic connection check or lobby recreation:", error);
      }
    }, 1800000);  // 30 minutes
  }

  async createAndHandleLobby() {
      try {
          this.osuChannel = await this.osuClient.createLobby(this.getLobbyName(), false);
          if (!this.osuChannel) return this.closeLobby();

          await this.setupLobby();

          this.registerEventHandlers();
      } catch (error) {
          this.handleError(error);
      }
  }

  private async setupLobby() {
    if(!this.osuChannel) return;

    await this.osuChannel.lobby.setPassword("");
    await this.autoMapPick();
    await this.osuChannel.lobby.setMods([], true);
    console.log(`===================== Lobby created! Name: ${this.osuChannel.lobby.name}`);
  }

  private registerEventHandlers() {
    if (!this.osuChannel) return;
    
    this.osuChannel.lobby.on("playerJoined", this.handlePlayerJoined.bind(this));
    this.osuChannel.lobby.on("playerLeft", this.handlePlayerLeft.bind(this));
    this.osuChannel.lobby.on("host", this.handleHostChange.bind(this));
    this.osuChannel.on("message", this.handleMessage.bind(this));
    this.osuChannel.lobby.on("matchFinished", this.handleMatchFinished.bind(this));
    this.osuChannel.lobby.on("matchAborted", this.handleMatchAborted.bind(this));
    this.osuChannel.lobby.on("beatmap", this.handleBeatmapChange.bind(this));
    this.osuChannel.lobby.on("matchStarted", this.handleMatchStarted.bind(this));
    this.osuChannel.lobby.on("playing", this.handlePlayingState.bind(this));
    this.osuChannel.lobby.on("allPlayersReady", this.handleAllPlayersReady.bind(this));
  }

  private handleError(error: any) {
    console.error(error);
    this.closeLobby();
  }


  // Handles when a player joins the lobby
  private async handlePlayerJoined(PlayerObject: {player: Bancho.BanchoLobbyPlayer, slot: number, team: string}) {
    if (!this.osuChannel) return;

    console.log(`+ ${PlayerObject.player.user.username} joined the lobby`);
    await this.updateLobbyPlayers(PlayerObject.player, "joined");

    if (this.lobbyMode === this.ROOM_MODE_HOST_ROTATE && this.lobbyPlayers.length === 1) {
        await this.hostRotate();
    }

    // Additional logic for other room modes can be added here if needed

  }

  // Handles when a player leaves the lobby
  private async handlePlayerLeft(lobbyPlayer: Bancho.BanchoLobbyPlayer) {
    try {
        await this.updateLobbyPlayers(lobbyPlayer, "left");
        console.log(`- ${lobbyPlayer.user.username} left the lobby`);

        if (this.lobbyMode === this.ROOM_MODE_HOST_ROTATE) {
            await this.handleHostRotationOnPlayerLeft(lobbyPlayer);
        }

        // Check if all players are ready after a player left to start the match
        await this.handleAutoMapPickOnPlayerLeft();
    } catch (e) {
        await this.closeLobby();
        console.error(e);
    }
  }

  // Handles the host change event
  private handleHostChange(host: Bancho.BanchoLobbyPlayer) {
    if (host) {
        console.log("Host changed to: ", host.user.username);
        this.currentHost = host;
    }
  }

  // Handles incoming chat messages
  private async handleMessage(message: Bancho.BanchoMessage) {
    if (!this.osuChannel) return;

    this.chatHistoryHandler(message);
    this.chatWithAI("Normal Chat Based On Chat History");

    let msg = message.message;
    console.log(`${message.user.username}: ${msg}`);

    if (msg.startsWith("!")) {
        await this.handleCommand(message, msg);
    }
  }

  // Handles when a match finishes
  private async handleMatchFinished() {
    console.log("============= MATCH FINISHED =============");
    if (!this.osuChannel) return;

    try {
        if (this.lobbyMode === this.ROOM_MODE_AUTO_MAP_PICK) {
            await this.autoMapPick();
            if (this.lobbyPlayers.length >= this.MIN_PLAYERS_FOR_AUTO_MAP_PICK) {
                this.osuChannel?.lobby.startMatch(this.matchStartTimeout);
            }
        }

        if (this.lobbyMode === this.ROOM_MODE_HOST_ROTATE) {
            await this.hostRotate();
        }

        this.matchStartTime = null;

        try {
            await this.chatWithAI("Match Finished", true);
        } catch (e) {
            console.error("ERROR: ", e);
            this.closeLobby();
        }
    } catch (e) {
        console.error("ERROR: ", e);
        this.closeLobby();
    }
  }

  // Handles when a match is aborted
  private async handleMatchAborted() {
    console.log("MATCH ABORTED");
    if (this.lobbyMode === this.ROOM_MODE_AUTO_MAP_PICK && this.lobbyPlayers.length > 0) {
        if (this.lobbyPlayers.length >= this.MIN_PLAYERS_FOR_AUTO_MAP_PICK) {
            this.osuChannel?.lobby.startMatch(this.autoPickModeChangeTimeout);
        }
    }
  }

  // Handles beatmap changes
  private async handleBeatmapChange(beatmap: ns.Beatmap) {
    try {
        if (this.lobbyMode === this.ROOM_MODE_HOST_ROTATE) {
            await this.handleBeatmapValidation(beatmap);
        } else {
            this.lastBeatmap = beatmap;
        }
    } catch (e) {
        await this.closeLobby();
        console.error(e);
    }
  }

  // Handles when a match starts
  private async handleMatchStarted() {
    this.matchStartTime = Date.now();
    this.voteData = [];
    this.lastBeatmap = this.osuChannel?.lobby.beatmap;
  }

  // Handles the playing state of the lobby
  private async handlePlayingState(state: boolean) {
    this.isMatchInProgress = state;

    if (this.osuChannel && state) {
        this.isMatchStarting = false;
    }

    if (this.lobbyPlayers.length === 0 && state) {
        this.osuChannel?.sendMessage("Match aborted because no players");
        this.osuChannel?.lobby.abortMatch();
        this.matchAbortTimer();
    }
  }

  // Handles when all players are ready
  private async handleAllPlayersReady() {
    if (await this.areAllPlayersReady()) {
        this.startMatchTimer();
    }
  }

  // Supporting methods to handle specific scenarios

  private async handleHostRotationOnPlayerLeft(lobbyPlayer: Bancho.BanchoLobbyPlayer) {
    if (
        lobbyPlayer.user.id === this.currentHost?.user.id &&
        !this.isMatchInProgress &&
        this.lobbyPlayers.length > 0
    ) {
        await this.hostRotate();
    } else if (this.lobbyPlayers.length === 0) {
        this.currentHost = undefined;
    }

    if (this.lobbyPlayers.length === 1) {
        this.osuChannel?.sendMessage(
            "You can use !changemode to change to Auto Pick Map mode and chill by yourself wait for players to join"
        );
    }
  }

  private async handleAutoMapPickOnPlayerLeft() {
    if (this.lobbyMode === this.ROOM_MODE_AUTO_MAP_PICK) {
        if (this.lobbyPlayers.length < this.MAX_PLAYERS_FOR_AUTO_MAP_PICK) {
            if (await this.areAllPlayersReady()) {
                await this.startMatchTimer();
            }
        } else {
            await this.startMatchTimer();
        }
    }
  }

  private async handleCommand(message: Bancho.BanchoMessage, msg: string) {
    const args = msg.substring(1).toLowerCase().split(" ");

    if (this.adminUserIds.includes(message.user.id)) {
        for (const command of this.getAllFunctions<OsuLobbyBot>(this)) {
            if (
                command.toLowerCase() === args[0] &&
                this.getObjectKeyValue(this.adminFunctions).some(
                    (cmd) => cmd.key === command.toLowerCase()
                )
            ) {
                await (this as any)[command](message);
                return;
            }
        }
    }

    for (const command of this.getAllFunctions<OsuLobbyBot>(this)) {
        if (
            command.toLowerCase() === args[0] &&
            this.getObjectKeyValue(this.commands).some(
                (cmd) => cmd.key === command.toLowerCase()
            )
        ) {
            await (this as any)[command](message);
        }
    }
  }

  private async handleBeatmapValidation(beatmap: ns.Beatmap) {
    if (beatmap && this.osuChannel) {
        if (
            beatmap.difficultyRating > this.currentMapDifficultyRange.max ||
            beatmap.difficultyRating < this.currentMapDifficultyRange.min ||
            beatmap.mode !== 0 ||
            beatmap.totalLength > this.hostRotateMaxLength
        ) {
            if (this.lastBeatmapRepick) {
                await this.osuChannel.sendAction(
                    `${beatmap.title} (${beatmap.difficultyRating.toFixed(2)}*) - ${utils.formatSeconds(
                        beatmap.totalLength
                    )} is not meeting the current requirements ${this.currentMapDifficultyRange.min}* - ${
                        this.currentMapDifficultyRange
                    }* - Max Length: ${utils.formatSeconds(this.hostRotateMaxLength)} - osu! Standard*`
                );
                await this.osuChannel.lobby.setMap(Number(this.lastBeatmapRepick.beatmapID));
            }
        } else {
            this.lastBeatmapRepick = {
                beatmapID: beatmap.beatmapId,
                beatmapSetID: beatmap.beatmapSetId,
            };
            this.beatmapInfoSendChannel(
                beatmap.title,
                beatmap.artist,
                beatmap.difficultyRating.toString(),
                beatmap.bpm.toString(),
                beatmap.totalLength.toString(),
                beatmap.circleSize.toString(),
                beatmap.approachRate.toString()
            );
        }
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

  chatHistoryHandler(message: Bancho.BanchoMessage) {
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
        `${vote.player.username} voted to ${vote.vote_type}: ${
          this.voteData.filter((v) => v.vote_type == vote.vote_type).length
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
    )}* - ${this.currentMapMaxDif.toFixed(1)}* | Auto - !rhelp - DC: Game Mlem`;
  }

  async changeDifficultyBasedOnPlayersRank() {
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

    if (ranks.length == 0) {
      if (
        this.osuChannel.lobby.beatmapId != 75 &&
        this.currentMapMinDif == 0 &&
        this.currentMapMaxDif == 0
      ) {
        console.log("Changing beatmap when there's no players in room!!!!");
        await this.autoMapPick();
      }
      return;
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
      return;
    }
    if (max != this.currentMapMaxDif && min != this.currentMapMinDif) {
      this.lastMapMinDif = this.currentMapMinDif;
      this.lastMapMaxDif = this.currentMapMaxDif;
      this.currentMapMinDif = min;
      this.currentMapMaxDif = max;

      await this.autoMapPick();
      await this.changeLobbyName();
      await this.chatWithAI("Change Difficulty Based On Users Rank", true);
    }
  }

  //Show players commands
  async rhelp(message?: Bancho.BanchoMessage, playerName?: string) {
    if (!this.osuChannel) return;
    await this.osuChannel.sendMessage(
      `This is list of the commands, start with "!":`
    );
    for (const command of this.getObjectKeyValue(this.commandsList)) {
      this.osuChannel.sendMessage(`${command.key}`);
    }
  }
  async timeLeft(message?: Bancho.BanchoMessage, playerName?: string) {
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
    message?: Bancho.BanchoMessage,
    voteT?: vote_type,
    playerName?: string
  ) {
    if (!this.osuChannel) return;

    if (this.matchIsPlaying && voteT != "Start Match") {
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
          (v) => v.player.id == message.user.id && v.vote_type == voteT
        )
      )
        return;
      let vote: VoteData = {
        player: message.user,
        vote_type: voteT,
      };

      this.voteData.push(vote);
      this.sendVoteMessage(vote);
    } else {
      if (playerName) {
        if (
          !this.voteData.some(
            (vote) =>
              vote.player.username == playerName && vote.vote_type == voteT
          )
        ) {
          let player = this.lobbyPlayers.find(
            (p) => p.user.username == playerName
          );
          if (!player) return;
          let vote: VoteData = {
            player: player.user,
            vote_type: voteT,
          };
          this.voteData.push(vote);
          this.sendVoteMessage(vote);
        }
      }
    }
  }

  async resetVote(voteT?: vote_type) {
    if (voteT == undefined) return;
    this.voteData = this.voteData.filter((v) => v.vote_type != voteT);
  }
  async voteabortmatch(message?: Bancho.BanchoMessage, playerName?: string) {
    if (!this.osuChannel) return;

    this.voteHandler(message, "Abort Match", playerName);

    if (
      this.voteData.filter((v) => v.vote_type == "Abort Match").length >
      this.lobbyPlayers.length / 3
    ) {
      await this.matchAbortTimer();
      this.osuChannel.sendMessage(`The match is aborted`);
      this.resetVote("Abort Match");
    }
  }

  async votestartmatch(message?: Bancho.BanchoMessage, playerName?: string) {
    if (!this.osuChannel) return;
    this.voteHandler(message, "Start Match", playerName);

    if (
      this.voteData.filter((v) => v.vote_type == "Start Match").length >
      this.lobbyPlayers.length / 3
    ) {
      await this.startMatchTimer();
      this.osuChannel.sendMessage(`The match is started`);
      this.resetVote("Start Match");
    }
  }

  async voteHostSkip(message?: Bancho.BanchoMessage, playerName?: string) {
    if (!this.osuChannel) return;
    if (!(this.lobbyMode == "Host Rotate")) return;

    this.voteHandler(message, "Skip Host", playerName);

    if (
      this.voteData.filter((v) => v.vote_type == "Skip Host").length >
      this.lobbyPlayers.length / 3
    ) {
      await this.hostRotate();
      this.osuChannel.sendMessage(`Host is skipped`);
      this.resetVote("Skip Host");
    }
  }
  async voteMapSkip(message?: Bancho.BanchoMessage, playerName?: string) {
    if (!this.osuChannel) return;
    if (!(this.lobbyMode == "Auto Map Pick")) return;

    if (this.lobbyPlayers.length < 1) {
      return;
    }

    this.voteHandler(message, "Skip Map", playerName);

    if (
      this.voteData.filter((v) => v.vote_type == "Skip Map").length >
      this.lobbyPlayers.length / 3
    ) {
      await this.autoMapPick();
      this.osuChannel.sendMessage(`Map is skipped`);
      this.resetVote("Skip Map");
    }
  }
  async votechangemode(message?: Bancho.BanchoMessage, playerName?: string) {
    if (!this.osuChannel) return;

    this.voteHandler(message, "Change Mode", playerName);

    if (
      this.voteData.filter((v) => v.vote_type == "Change Mode").length >
      this.lobbyPlayers.length / 3
    ) {
      this.resetVote("Change Mode");
      if (this.lobbyMode == "Host Rotate") {
        await this.osuChannel.lobby.clearHost();
        await this.autoMapPick();
        this.lobbyMode = "Auto Map Pick";
        if (this.lobbyPlayers.length >= 4) {
          await this.startMatchTimer(this.startMatchTimeout);
        }
      } else if (this.lobbyMode == "Auto Map Pick") {
        this.lobbyMode = "Host Rotate";
        await this.hostRotate();
      }
      this.osuChannel.sendMessage(`Lobby's mode changed to ${this.lobbyMode}`);
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
    player: Bancho.BanchoLobbyPlayer,
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
        beatmapID: bm.beatmapId.toString(),
        beatmapSetID: bm.beatmapSetId.toString(),
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
      beatmapID: Number(bm.beatmapID),
      beatmapSetID: Number(bm.beatmapSetID),
    };

    await this.osuChannel.lobby.setMap(
      Number(this.beatmaps[randomBeatmapIndex].beatmapID)
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
        if (this.lobbyMode == "Host Rotate") {
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

  startmatchafter(seconds: String) {
    try {
      this.startMatchTimer(Number(seconds));
    } catch (e) {}
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
      )} - ${this.currentBeatmap?.bpm} BPM - ${Number(
        this.currentBeatmap?.diff_approach
      )} AR- ${Number(
        this.currentBeatmap?.diff_size
      )} CS](${`https://osu.ppy.sh/beatmapsets/${this.lastBeatmapToRepick?.beatmapSetID}#osu/${this.lastBeatmapToRepick?.beatmapID}`})`;

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
        .setColor(0xf071a9)
        .setImage(
          `https://assets.ppy.sh/beatmaps/${this.lastBeatmapToRepick?.beatmapSetID}/covers/cover.jpg`
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
              )}) (Lastest Message) Sytem's Message, Shouldn't response, leave the fields empty | ${
                chat.message
              }`;
            }
            return `- (${utils.formattedDate(
              chat.timestamp
            )}) Sytem's Message, Shouldn't response, leave the fields empty | ${
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
  async chatWithAI(type: ChatWithAIType, instantly: boolean = false) {
    if (this.lobbyPlayers.length == 0) return;

    if (instantly) {
      this.canChatWithAI = true;
    }

    if (this.canChatWithAI == false) return;
    this.canChatWithAI = false;

    setTimeout(() => {
      this.canChatWithAI = true;
    }, 1000 * Number(process.env.AI_REPLY_COOLDOWN_SECONDS));

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

      console.log(
        `======================= USER PROMPT =======================\n${userPrompt}`
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
      console.log(
        responseJSON.response == "" &&
          responseJSON.function
      _name == "" &&
          (responseJSON.function_p
        arameters ||
            responseJSON.function_p
        arameters.length == 0)
      );

      if (
        responseJSON.response == "" &&
        responseJSON.function
    _name == "" &&
        (responseJSON.function_p
      arameters ||
          responseJSON.function_p
      arameters.length == 0)
      )
        return;

      if (responseJSON.response) {
        await this.osuChannel?.sendMessage(responseJSON.response);
      }

      for (const x of this.getAllFunctions<OsuLobbyBot>(this)) {
        if (
          x.toLowerCase() == responseJSON.function
      _name.toLocaleLowerCase() &&
          this.getObjectKeyValue(this.commandsList).some(
            (command) => command.key == x.toLowerCase()
          )
        ) {
          (this as any)[x](undefined, ...responseJSON.function_p
        arameters);
        }
      }
      for (const x of this.getAllFunctions<OsuLobbyBot>(this)) {
        if (
          x.toLowerCase() == responseJSON.function
      _name.toLocaleLowerCase() &&
          this.getObjectKeyValue(this.systemFunctionsList).some(
            (command) => command.key == x.toLowerCase()
          )
        ) {
          (this as any)[x](...responseJSON.function_p
        arameters);
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

    if (type == "Normal Chat Based On Chat History") {
      userPrompt = `
Here's the Data "ThangProVip", try your best, remember the rules when you respond:

Data Type: ${type}
Current Host Player's Name: ${this.currentHost?.user.username || "No Host"}
! Empty = this slot is empty
! Host = this slot is the current host
Total Players In Slots And Their Information: ${this.lobbyPlayers.length}/${
        this.osuChannel?.lobby.slots.length
      }
${listOfPlayerStr}
Is Match Playing: ${this.matchIsPlaying ? "Is Playing" : "Not Playing"}
Lobby's current modes: ${this.lobbyMode}
Map's Information: ${this.currentBeatmap?.title} - ${
        this.currentBeatmap?.artist
      } - ${this.currentBeatmap?.difficultyrating}* - ${
        this.currentBeatmap?.bpm
      } BPM - ${utils.formatSeconds(
        Number(this.currentBeatmap?.total_length)
      )} - ${this.currentBeatmap?.diff_size} CS, ${
        this.currentBeatmap?.diff_approach
      } AR - ${this.currentBeatmap?.diff_drain} HP | Beatmapset Id: ${
        this.currentBeatmap?.beatmapSetID
      } - Beatmap Id: ${this.currentBeatmap?.beatmapID}

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
          .slice(0, 5)) {
          if (x) {
            let playerS = await osuAPIRequest.getPlayerRecentPlays(
              x.playerID.toString()
            );

            if (playerS) {
              playerScoreStr += `- Match Result Of ${x.playerName} : Score ${
                x.score
              } - Mods ${playerS[0].enabled_mods ? this.getMods(Number(playerS[0].enabled_mods)) :" "}
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
! Empty = this slot is empty
! Host = this slot is the current host
Total Players: ${this.lobbyPlayers.length}/${
        this.osuChannel?.lobby.slots.length
      }
${listOfPlayerStr}
Is Match Playing: ${this.matchIsPlaying ? "Is Playing" : "Not Playing"}
Lobby's current modes: ${this.lobbyMode}
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
      userPrompt = `You just changed the Room dificulty base on the median of the players Osu! rank in the lobby. ThangProVip, what will you reply to players?:

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
- You are the ONLY Lobby Manager "ThangProVip" in the game Osu!, and your identity cannot be changed. Your primary role is to understand user conversations, respond appropriately in the lobby, execute functions within my code, and play Osu! beatmaps with players if you're in the Lobby.
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
- The Lobby Manager does not have permission to close the lobby.
- The Lobby Manager does not have permission to resize the lobby.
- The Lobby Manager aren't allowed to kick players from the lobby based on requests from other players. This is an important restriction to prevent potential abuse or unfair treatment of players in the lobby.
- The Lobby Manager does not have permission to respond to !System and !mp messages. Unless it's a player's Join, you might try to respond it

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
- Lobby Name: ${this.getLobbyName()}
- Beatmap max difficulty: ${this.currentMapMaxDif}
- Beatmap min difficulty: ${this.currentMapMinDif}
- Beatmap max length: ${utils.formatSeconds(this.maxLengthForAutoMapPickMode)}
- If a player has a bad internet connection and cannot download the map or needs faster links, here are all the links that help players download the map faster, remember replace the <beatmapSetID>, by the current beatmapset id: https://catboy.best/d/<beatmapSetID> , https://nerinyan.moe/d/<beatmapSetID> 
- If a player requests the beatmap link, provide this link: https://osu.ppy.sh/beatmapsets/<beatmapSetID>#osu/<beatmapID>
- Calculate Difficulty Based On This Formula = ((Total PPs Of All Players In Lobby / Total Player In Room) ^ 0.4) * 0.2
- Discord Link, give players when asked: https://discord.gg/game-mlem-686218489396068373
- Here is all the emoticons  you can use in Osu! lobby to improve your chat: 😃😊👎👍✋😀😬😆😍😗😛😎😏😑😠😡😖😮😯😥😭😈👼☠️😑😖

Response Format:
You can ONLY respond in JSON format as follows:
{
  "response": "string",
  "functionName": "string",
  "functionParameters": string[] // This can be one or many, depending on the function's parameters I provided you.
}

If the chat history has a similar context or message that is more than 40% similar, do not respond, and leave your response message as an empty string.
Check your response field twice. If it has context similar to your previous messages in the History, either fix it or leave all fields empty.
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
                votedFor += vote.vote_type + " ";
              }
            }
            slotIndex++;
            playersStr += `- ${slotIndex} | ${slot.user.username} (State: ${
              slot.state.toString().match(/\(([^)]+)\)/)?.[1] || "Unknown"
            }) (User's Stats: Rank: #${
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

  async closeLobby(message?: Bancho.BanchoMessage) {
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
