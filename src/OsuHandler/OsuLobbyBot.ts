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
  isYourResponseSimilarToAnyOfYourPreviousMessagesInTheHistory: string; // TODO Please for the love of god, do not name your variables like that.
  howDidYouKnowYourResponseIsNotSimilarToYourPreviousMessages: string;
  didYouDoubleCheckYourResponse: string;
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
  voteType: voteType;
};

type ChatWithAIType =
  | "Normal Chat Based On Chat History"
  | "Match Finished"
  | "Change Difficulty Based On Users Rank";


// Some constants that i saw while refactoring
const ROOM_MODE_HOST_ROTATE = "Host Rotate";
const ROOM_MODE_AUTO_MAP_PICK = "Auto Map Pick";
const MIN_PLAYERS_FOR_AUTO_MAP_PICK = 4;
const MAX_PLAYERS_FOR_AUTO_MAP_PICK = 5;

class OsuLobbyBot {



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

  //  Embed Variables
  embedMessage: Message | null = null;

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

        const allPlayersReady = await this.arePlayersReady();
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
    await this.autoPickMap();
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
    await this.updatePlayerList(PlayerObject.player, "joined");

    if (this.lobbyMode === ROOM_MODE_HOST_ROTATE && this.lobbyPlayers.length === 1) {
        await this.rotateHost();
    }

    // Additional logic for other room modes can be added here if needed

  }

  // Handles when a player leaves the lobby
  private async handlePlayerLeft(lobbyPlayer: Bancho.BanchoLobbyPlayer) {
    try {
        await this.updatePlayerList(lobbyPlayer, "left");
        console.log(`- ${lobbyPlayer.user.username} left the lobby`);

        if (this.lobbyMode === ROOM_MODE_HOST_ROTATE) {
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
        if (this.lobbyMode === ROOM_MODE_AUTO_MAP_PICK) {
            await this.autoPickMap();
            if (this.lobbyPlayers.length >= MIN_PLAYERS_FOR_AUTO_MAP_PICK) {
                this.osuChannel?.lobby.startMatch(this.matchStartTimeout);
            }
        }

        if (this.lobbyMode === ROOM_MODE_HOST_ROTATE) {
            await this.rotateHost();
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
    if (this.lobbyMode === ROOM_MODE_AUTO_MAP_PICK && this.lobbyPlayers.length > 0) {
        if (this.lobbyPlayers.length >= MIN_PLAYERS_FOR_AUTO_MAP_PICK) {
            this.osuChannel?.lobby.startMatch(this.autoPickModeChangeTimeout);
        }
    }
  }

  // Handles beatmap changes
  private async handleBeatmapChange(beatmap: ns.Beatmap) {
    try {
        if (this.lobbyMode === ROOM_MODE_HOST_ROTATE) {
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
        this.abortMatchTimer();
    }
  }

  // Handles when all players are ready
  private async handleAllPlayersReady() {
    if (await this.arePlayersReady()) {
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
        await this.rotateHost();
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
    if (this.lobbyMode === ROOM_MODE_AUTO_MAP_PICK) {
        if (this.lobbyPlayers.length < MAX_PLAYERS_FOR_AUTO_MAP_PICK) {
            if (await this.arePlayersReady()) {
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
            let v1Beatmap = this.convertBeatmapV2ToV1(beatmap)
            if(v1Beatmap == null) return; // Returns if there was a problem with the conversion
            this.sendBeatmapInfo(v1Beatmap);
        }
    }
  }


  /**
   * Retrieves key-value pairs from an object.
   * @param obj The object to retrieve key-value pairs from.
   * @returns An array of objects containing key and value pairs.
   */
  getObjectKeyValue(obj: Record<string, any>): { key: string; value: string }[] {
    return Object.entries(obj).map(([key, value]) => ({
      key,
      value: value.toString(),
    }));
  }

  /**
   * Gets all function names from an object's prototype.
   * @param obj The object to retrieve functions from.
   * @returns An array of function names (keys).
   */
  getAllFunctions<T>(obj: T): (keyof T)[] {
    return Object.getOwnPropertyNames(Object.getPrototypeOf(obj))
      .filter((key) => typeof obj[key as keyof T] === "function") as (keyof T)[];
  }

  /**
   * Filters and retrieves chat history based on the specified filter condition.
   * @param filter Whether to apply filtering to the chat history.
   * @returns The filtered or unfiltered chat history.
   */
  getChatHistory(filter: boolean): { playerName: string; message: string; timestamp: Date }[] {
    if (!filter) return this.chatHistory;

    const commandsList = this.getObjectKeyValue(this.commands);

    return this.chatHistory.filter(
      (message) =>
        !message.message.startsWith("!") &&
        !commandsList.some(
          (command) =>
            message.message.startsWith(command.key) || message.message.includes(command.value)
        )
    );
  }

  /**
   * Manages the chat history by adding new messages and maintaining the history length.
   * @param message The incoming message object from Bancho.
   */
  chatHistoryHandler(message: Bancho.BanchoMessage): void {
    if (this.chatHistory.length >= this.maxChatHistoryLength) {
      this.chatHistory.shift();
    }
    this.chatHistory.push({
      playerName: message.user.username,
      message: message.message,
      timestamp: new Date(),
    });
  }

  /**
   * Sends a vote message to the lobby.
   * @param vote The vote data containing player and vote type.
   */
  sendVoteMessage(vote: VoteData): void {
    if (this.osuChannel) {
      const voteCount = this.voteData.filter((v) => v.voteType === vote.voteType).length;
      this.osuChannel.sendMessage(
        `${vote.player.username} voted to ${vote.voteType}: ${voteCount}/${this.lobbyPlayers.length} votes`
      );
    }
  }

  /**
   * Changes the lobby name based on the presence of players or the current difficulty.
   * @param noPlayer Optional flag indicating whether there are no players in the lobby.
   */
  async changeLobbyName(noPlayer: boolean = false): Promise<void> {
    if (!this.osuChannel) return;

    if (noPlayer) {
      this.resetDifficultyRange();
    }

    const lobbyName = this.getLobbyName();
    if (this.previousLobbyName !== lobbyName) {
      await this.osuChannel.lobby.setName(lobbyName);
      this.previousLobbyName = lobbyName;
    }
  }

  /**
   * Constructs and returns the lobby name based on the current settings.
   * @returns The formatted lobby name.
   */
  getLobbyName(): string {
    return `${this.currentMapDifficultyRange.min.toFixed(1)}* - ${this.currentMapDifficultyRange.max.toFixed(1)}* | Auto - !rhelp - DC: Game Mlem`;
  }

  /**
   * Changes the difficulty of the lobby based on the players' ranks.
   */
  async changeDifficultyBasedOnPlayersRank(): Promise<void> {
    if (this.isMatchInProgress || !this.osuChannel) return;

    const playersPerformancePoints = this.getPlayersPerformancePoints();

    if (playersPerformancePoints.length === 0) {
      await this.handleNoPlayers();
      return;
    }

    const lobbyPerformancePoints = this.calculateLobbyPerformancePoints(playersPerformancePoints, 2); // Medium Difficulty
    const lowestDeltaPerformancePoints = this.findLowestDeltaPerformancePoints(playersPerformancePoints)
    const difficultyRange = this.calculateDifficultyRange(lobbyPerformancePoints, lowestDeltaPerformancePoints);

    if (this.isDifficultyRangeChanged(difficultyRange)) {
      this.updateDifficultyRange(difficultyRange);
      await this.autoPickMap();
      await this.changeLobbyName();
      await this.chatWithAI("Change Difficulty Based On Users Rank", true);
    }
  }
  
  // Reset the difficulty range
  private resetDifficultyRange(): void {
    this.currentMapDifficultyRange = { min: 0, max: 0 };
  }

  private findLowestDeltaPerformancePoints(numbers: number[]): number {
    if (numbers.length < 2) {
        return 0; // Not enough numbers to find a delta
    }

    // Sort the array to find the smallest delta easily
    numbers.sort((a, b) => a - b);

    let minDelta = Infinity;

    // Compare consecutive numbers to find the smallest difference
    for (let i = 1; i < numbers.length; i++) {
        const delta = numbers[i] - numbers[i - 1];
        if (delta < minDelta) {
            minDelta = delta;
        }
    }

    return minDelta;
}

  // Get the list of player ranks
  private getPlayersPerformancePoints(): number[] {
    if(!this.osuChannel) return [];
    return this.osuChannel.lobby.slots
      .filter(slot => slot?.user)
      .map(slot => slot.user.ppRaw);
  }
  
  // Handle case when there are no players in the lobby
  private async handleNoPlayers() {
    if(!this.osuChannel) return;
    if (this.osuChannel.lobby.beatmapId !== 75 && this.currentMapDifficultyRange.min === 0 && this.currentMapDifficultyRange.max === 0) {
      console.log("There are no players in the room, changing beatmap.");
      await this.autoMapPick();
    }
  }
  
  // Calculate the median PP value
  calculateLobbyPerformancePoints(playerPerformancePoints: number[], difficultyLevel: number): number {
    // If there is only one player, return its pp number.
    if(playerPerformancePoints.length == 1) return playerPerformancePoints[0];

    // Ensure difficulty is between 1 and 3
    if (difficultyLevel < 1 || difficultyLevel > 3) {
        throw new Error("Difficulty must be between 1 and 3");
    }

    // Sort player PP in ascending order
    playerPerformancePoints.sort((a, b) => a - b);

    // Calculate the index based on the difficulty level
    const index = Math.ceil((playerPerformancePoints.length / 4) * difficultyLevel);

    // Split the player PP array into right and left parts
    const right = playerPerformancePoints.slice(0, index);
    const left = playerPerformancePoints.slice(index);

    // Calculate the right average
    let rightAvg = right[0];
    for (let x = 1; x < right.length; x++) {
        rightAvg += right[x];
        rightAvg /= 2;
    }

    // Calculate the left average
    let leftAvg = left[left.length - 1];
    for (let x = left.length - 2; x >= 0; x--) {
        leftAvg += left[x];
        leftAvg /= 2;
    }

    // Calculate the total average and round it up
    const totalAvg = Math.ceil((rightAvg + leftAvg) / 2);

    return totalAvg;
  }
  
  // Calculate difficulty based on Performance Points
  private calculateDifficultyInStars(performancePoints: number): number {
    return Math.pow(performancePoints, 0.4) * 0.195; // osu!'s difficulty calculation formula
  }
  
  // Calculate the difficulty range based on median PP and average difficulty
  private calculateDifficultyRange(performancePoints: number, lowestDelta: number): { min: number; max: number } {
    let min = this.calculateDifficultyInStars(performancePoints - lowestDelta)
    let max = this.calculateDifficultyInStars(performancePoints + lowestDelta) 

    return { min, max };
  }
  
  // Check if the difficulty range has changed
  private isDifficultyRangeChanged(newRange: { min: number; max: number }): boolean {
    return newRange.min !== this.currentMapDifficultyRange.min || newRange.max !== this.currentMapDifficultyRange.max;
  }
  
  // Update the current and last difficulty ranges
  private updateDifficultyRange(newRange: { min: number; max: number }) {
    this.lastMapDifficultyRange = { ...this.currentMapDifficultyRange };
    this.currentMapDifficultyRange = newRange;
  }
  
/**
   * Displays the list of available commands.
   * @param message Optional Bancho message object.
   * @param playerName Optional name of the player requesting the command list.
   */
  async rhelp(message: Bancho.BanchoMessage, playerName: string): Promise<void> {
    if (!this.osuChannel) return;

    await this.osuChannel.sendMessage('This is the list of commands, start with "!":');
    for (const command of this.getObjectKeyValue(this.commands)) {
      await this.osuChannel.sendMessage(`${command.key}`);
    }
  }

  /**
   * Sends the remaining time of the current beatmap.
   * @param message Optional Bancho message object.
   * @param playerName Optional name of the player requesting time left.
   */
  async timeLeft(message: Bancho.BanchoMessage, playerName: string): Promise<void> {
    if (!this.osuChannel) return;

    const timeLeft = this.calculateTimeLeft();
    if (timeLeft !== 0) {
      await this.osuChannel.sendMessage(`Time left of the beatmap: ${utils.formatSeconds(timeLeft)}, let's wait <3`);
    } else {
      await this.osuChannel.sendMessage('No match is currently in progress.');
    }
  }

  /**
   * Handles voting actions for various vote types.
   * @param message Optional Bancho message object.
   * @param voteT The type of vote (e.g., 'Start Match', 'Abort Match').
   * @param playerName Optional name of the player initiating the vote.
   */
  async voteHandler(message: Bancho.BanchoMessage, voteT: voteType, playerName: string): Promise<void> {
    if (!this.osuChannel) return;

    if (this.isMatchInProgress && voteT !== 'Start Match') {
      await this.osuChannel.sendMessage("Can't vote when the match is in progress!");
      return;
    }

    if (!voteT) return;

    if (message && this.isDuplicateVote(message.user.id, voteT)) return;

    const vote = message
      ? { player: message.user, voteType: voteT }
      : this.getPlayerVote(playerName, voteT);

    if (vote) {
      this.voteData.push(vote);
      this.sendVoteMessage(vote);
    }
  }

  /**
   * Resets all votes of a specific type.
   * @param voteT The vote type to reset (e.g., 'Start Match').
   */
  async resetVote(voteT?: voteType): Promise<void> {
    if (!voteT) return;
    this.voteData = this.voteData.filter(v => v.voteType !== voteT);
  }

  /**
   * Handles voting to abort the match.
   * @param message Optional Bancho message object.
   * @param playerName Optional name of the player initiating the vote.
   */
  async abortmatch(message: Bancho.BanchoMessage, playerName: string): Promise<void> {
    if (!this.osuChannel) return;

    await this.voteHandler(message, 'Abort Match', playerName);

    if (this.countVotes('Abort Match') > this.lobbyPlayers.length / 3) {
      await this.abortMatchTimer();
      await this.osuChannel.sendMessage('The match is aborted');
      this.resetVote('Abort Match');
    }
  }

  /**
   * Handles voting to start the match.
   * @param message Optional Bancho message object.
   * @param playerName Optional name of the player initiating the vote.
   */
  async startmatch(message: Bancho.BanchoMessage, playerName: string): Promise<void> {
    if (!this.osuChannel) return;

    await this.voteHandler(message, 'Start Match', playerName);

    if (this.countVotes('Start Match') > this.lobbyPlayers.length / 3) {
      await this.startMatchTimer();
      await this.osuChannel.sendMessage('The match is started');
      this.resetVote('Start Match');
    }
  }

  /**
   * Handles voting to skip the current host.
   * @param message Optional Bancho message object.
   * @param playerName Optional name of the player initiating the vote.
   */
  async skiphost(message: Bancho.BanchoMessage, playerName: string): Promise<void> {
    if (!this.osuChannel || this.lobbyMode !== 'Host Rotate') return;

    await this.voteHandler(message, 'Skip Host', playerName);

    if (this.countVotes('Skip Host') > this.lobbyPlayers.length / 3) {
      await this.rotateHost();
      await this.osuChannel.sendMessage('Host is skipped');
      this.resetVote('Skip Host');
    }
  }

  /**
   * Handles voting to skip the current map.
   * @param message Optional Bancho message object.
   * @param playerName Optional name of the player initiating the vote.
   */
  async skipmap(message: Bancho.BanchoMessage, playerName: string): Promise<void> {
    if (!this.osuChannel || this.lobbyMode !== 'Auto Map Pick' || this.lobbyPlayers.length < 1) return;

    await this.voteHandler(message, 'Skip Map', playerName);

    if (this.countVotes('Skip Map') > this.lobbyPlayers.length / 3) {
      await this.autoPickMap();
      await this.osuChannel.sendMessage('Map is skipped');
      this.resetVote('Skip Map');
    }
  }

  /**
   * Handles voting to change the lobby mode.
   * @param message Optional Bancho message object.
   * @param playerName Optional name of the player initiating the vote.
   */
  async changemode(message: Bancho.BanchoMessage, playerName: string): Promise<void> {
    if (!this.osuChannel) return;

    await this.voteHandler(message, 'Change Mode', playerName);

    if (this.countVotes('Change Mode') > this.lobbyPlayers.length / 3) {
      this.resetVote('Change Mode');
      this.toggleLobbyMode();
      await this.osuChannel.sendMessage(`Lobby's mode changed to ${this.lobbyMode}`);
    }
  }

  /**
   * Kicks a player from the lobby.
   * @param playerName The name of the player to kick.
   */
  async kickplayer(playerName: string): Promise<void> {
    if (!this.osuChannel || !playerName) return;

    const player = this.lobbyPlayers.find(p => p.user.username === playerName);
    if (!player) return;

    if (this.adminUserIds.includes(Number(player.user.id))) {
      await this.osuChannel.sendMessage(`You can't kick ${player.user.username} because they are an admin`);
      return;
    }

    try {
      await this.osuChannel.lobby.kickPlayer(`#${player.user.id}`);
    } catch (error) {
      console.error(error);
      await this.closeLobby();
    }
  }

  /**
   * Moves a player to a specific slot.
   * @param playerName The name of the player to move.
   * @param slot The slot number to move the player to.
   */
  async moveplayertoslot(playerName?: string, slot?: number): Promise<void> {
    if (!this.osuChannel || typeof slot !== 'number' || !playerName) return;

    const player = this.lobbyPlayers.find(p => p.user.username === playerName);
    if (!player || slot > this.osuChannel.lobby.slots.length - 1) return;

    try {
      await this.osuChannel.lobby.movePlayer(player, slot - 1);
    } catch (error) {
      console.error(error);
      await this.closeLobby();
    }
  }

  // Utility functions

  /**
   * Counts the number of votes for a specific vote type.
   * @param voteType The type of vote to count.
   * @returns The number of votes for the given vote type.
   */
  private countVotes(voteType: voteType): number {
    return this.voteData.filter(v => v.voteType === voteType).length;
  }

  /**
   * Checks if a player has already voted for a specific vote type.
   * @param playerId The ID of the player.
   * @param voteType The type of vote to check.
   * @returns True if the player has already voted, otherwise false.
   */
  private isDuplicateVote(playerId: number, voteType: voteType): boolean {
    return this.voteData.some(v => v.player.id === playerId && v.voteType === voteType);
  }

  /**
   * Retrieves a player's vote if the player name is provided.
   * @param playerName The name of the player.
   * @param voteType The type of vote.
   * @returns The VoteData object if the player exists, otherwise null.
   */
  private getPlayerVote(playerName: string, voteType: voteType): VoteData | null {
    const player = this.lobbyPlayers.find(p => p.user.username === playerName);
    return player ? { player: player.user, voteType } : null;
  }

  /**
   * Toggles the lobby mode between 'Host Rotate' and 'Auto Map Pick'.
   */
  private toggleLobbyMode(): void {
    if (this.lobbyMode === 'Host Rotate') {
      this.lobbyMode = 'Auto Map Pick';
    } else if (this.lobbyMode === 'Auto Map Pick') {
      this.lobbyMode = 'Host Rotate';
    }
  }
  
  /**
   * Rotates the host in the lobby by moving the current host to the back of the queue and assigning the next player as host.
   */
  async rotateHost(): Promise<void> {
    try {
      if (!this.osuChannel || this.lobbyPlayers.length === 0) return;

      // If there are more than 1 players, rotate the host
      if (this.lobbyPlayers.length > 1) {
        const newHost = this.lobbyPlayers[0];
        await this.osuChannel.lobby.setHost(`#${newHost.user.id}`);

        const firstPlayer = this.lobbyPlayers.shift(); // Remove the first player
        if (firstPlayer) {
          this.lobbyPlayers.push(firstPlayer); // Move to the back of the queue
          await this.osuChannel.sendMessage(`${firstPlayer.user.username} is the new host`);
        }
      }
      // If only 1 player is in the lobby, check if they are already the host
      else if (this.lobbyPlayers.length === 1 && this.currentHost?.user.id !== this.lobbyPlayers[0].user.id) {
        await this.osuChannel.lobby.setHost(`#${this.lobbyPlayers[0].user.id}`);
      }

      // No players in the lobby
      if (this.lobbyPlayers.length === 0) {
        await this.osuChannel.sendMessage("Host rotation is disabled because there are no players in the lobby.");
      }
    } catch (e) {
      console.log(e);
      await this.closeLobby();
    }
  }

  /**
   * Calculates the remaining time for the current beatmap.
   * @returns The time left in seconds.
   */
  calculateTimeLeft(): number {
    if (this.matchStartTime === null || this.currentBeatmap === null) return 0;

    const elapsedTime = (Date.now() - this.matchStartTime) / 1000; // Convert to seconds
    const timeLeft = Math.max(0, Number(this.currentBeatmap.total_length) - elapsedTime);
    return Math.round(timeLeft);
  }

   /**
   * Updates the player list when a player joins or leaves the lobby.
   * @param player The player to update.
   * @param status The status of the player ('joined' or 'left').
   */
   async updatePlayerList(player: Bancho.BanchoLobbyPlayer, status: PlayerStatus): Promise<void> {
    try {
      if (!this.osuChannel) return;

      if (status === "joined") {
        this.lobbyPlayers.push(player);
      } else if (status === "left") {
        this.lobbyPlayers = this.lobbyPlayers.filter(p => p.user.id !== player.user.id);
      }

      console.log("Current players in the lobby:", this.lobbyPlayers.map(p => p.user.username).join(", "));
    } catch (e) {
      console.log(e);
      await this.closeLobby();
    }
  }

  /**
   * Converts a beatmap from version 2 format to version 1.
   * @param beatmapV2 The beatmap in version 2 format.
   * @returns The beatmap in version 1 format.
   */
  convertBeatmapV2ToV1(beatmapV2: ns.Beatmap): v1Beatmap | null {
    try {
      return {
        artist: beatmapV2.artist,
        beatmap_id: beatmapV2.beatmapId.toString(),
        beatmapset_id: beatmapV2.beatmapSetId.toString(),
        bpm: beatmapV2.bpm.toString(),
        diff_aim: beatmapV2.diffAim.toString(),
        diff_approach: beatmapV2.diffApproach.toString(),
        diff_drain: beatmapV2.diffDrain.toString(),
        diff_overall: beatmapV2.diffOverall.toString(),
        diff_size: beatmapV2.diffSize.toString(),
        diff_speed: beatmapV2.diffSpeed.toString(),
        difficultyrating: beatmapV2.difficultyRating.toString(),
        favourite_count: beatmapV2.favoriteCount.toString(),
        hit_length: beatmapV2.hitLength.toString(),
        max_combo: beatmapV2.maxCombo.toString(),
        mode: beatmapV2.mode!.toString(),
        playcount: beatmapV2.playcount.toString(),
        rating: beatmapV2.rating.toString(),
        tags: beatmapV2.tags,
        title: beatmapV2.title,
        total_length: beatmapV2.totalLength.toString(),
      };
    } catch (e) {
      console.log("Error while converting beatmap from V2 to V1:", e);
      this.closeLobby();
      return null;
    }
  }

  /**
   * Automatically picks a random beatmap within the specified difficulty range.
   */
  async autoPickMap(): Promise<void> {
    if (!this.osuChannel) return;

    let currentDate: Date;
    let randomDate: Date;
    let selectedBeatmap: v1Beatmap;

    // If difficulty range isn't set, set a default beatmap
    if (this.currentMapDifficultyRange.max === 0) {
      await this.osuChannel.lobby.setMap(75); // Example beatmap ID
      return;
    }

    // Ensure there are beatmaps available
    while (this.beatmaps.length < 1) {
      currentDate = new Date();
      randomDate = new Date(utils.getRandomNumber(this.beatmapsSinceDate.getTime(), currentDate.getTime()));

      this.beatmaps = await osuAPIRequest.getRandomBeatmap(
        this.currentMapDifficultyRange.min,
        this.currentMapDifficultyRange.max,
        this.autoMapPickMaxLength,
        randomDate
      );
    }

    if (!this.beatmaps) return;

    const randomBeatmapIndex = utils.getRandomNumber(0, this.beatmaps.length - 1);
    selectedBeatmap = this.beatmaps[randomBeatmapIndex];

    this.currentBeatmap = selectedBeatmap;
    this.lastBeatmapRepick = {
      beatmapID: Number(selectedBeatmap.beatmap_id),
      beatmapSetID: Number(selectedBeatmap.beatmapset_id),
    };

    await this.osuChannel.lobby.setMap(Number(selectedBeatmap.beatmap_id));
    this.sendBeatmapInfo(selectedBeatmap);

    // Clear beatmaps after selection
    this.beatmaps = [];
  }

  /**
   * Sends information about the currently picked beatmap to the channel.
   * @param beatmap The beatmap to send info for.
   */
  async sendBeatmapInfo(beatmap: v1Beatmap): Promise<void> {
    try {
      if (this.osuChannel) {
        const message = `Picked Map: ${beatmap.title} - ${beatmap.artist} (${Number(
          beatmap.difficultyrating
        ).toFixed(2)}*): ${beatmap.bpm} BPM - ${utils.formatSeconds(
          Number(beatmap.total_length)
        )} - ${beatmap.diff_size} CS, ${beatmap.diff_approach} AR`;

        await this.osuChannel.sendMessage(message);
        console.log(message);
      }
    } catch (e) {
      console.log(e);
      this.closeLobby();
    }
  }

  /**
   * Checks if all players in the lobby are ready.
   * @returns True if all players are ready, false otherwise.
   */
  async arePlayersReady(): Promise<boolean> {
    try {
      if (!this.osuChannel) return false;

      const players = this.osuChannel.lobby.slots.filter(slot => slot !== null);

      if (players.length === 1 && this.currentHost?.user.id !== players[0].user.id) {
        if (this.lobbyMode === "Host Rotate") {
          await this.osuChannel.lobby.setHost(`#${players[0].user.id}`);
        }
      }

      if (players.length === 0) return false;

      for (const player of this.lobbyPlayers) {
        const playerState = player.state.toString().toLowerCase();
        if (playerState === "symbol(not ready)" || playerState === "symbol(no map)") {
          return false;
        }
      }

      return true;
    } catch (e) {
      console.log(e);
      return false;
    }
  }
 /**
   * Starts the match timer.
   * @param timeSeconds The duration of the timer in seconds. If 0 or omitted, starts a default match timer.
   */
 async startMatchTimer(timeSeconds: number = 0): Promise<void> {
  console.log("START MATCH TIMER");
  if (this.isMatchInProgress) return;

  try {
    if (timeSeconds > 0) {
      await this.osuChannel?.lobby.startMatch(timeSeconds);
    } else {
      await this.osuChannel?.lobby.startMatch();
    }
    this.isMatchInProgress = true;
  } catch (e) {
    console.error("Error starting match timer:", e);
  }
}

/**
 * Starts the match timer after a delay.
 * @param seconds The delay before starting the match timer, in seconds.
 */
async startMatchAfter(seconds: string): Promise<void> {
  try {
    await this.startMatchTimer(Number(seconds));
  } catch (e) {
    console.error("Error starting match after delay:", e);
  }
}

/**
 * Aborts the match timer.
 */
async abortMatchTimer(): Promise<void> {
  try {
    await this.osuChannel?.lobby.abortTimer();
    this.isMatchInProgress = false;
  } catch (e) {
    console.error("Error aborting match timer:", e);
  }
}

/**
 * Updates the embed message with the latest match information.
 */
async updateEmbed(): Promise<void> {
  if (!this.canUpdateEmbed) return;

  try {
    const channelId = process.env.DISCORD_OSU_LOBBY_STATS_CHANNEL_ID;
    if (!channelId) throw new Error("DISCORD_OSU_LOBBY_STATS_CHANNEL_ID not set");

    const channel = await discordClient.channels.fetch(channelId) as TextChannel;
    if (!channel) throw new Error(`Channel ID ${channelId} is not valid`);

    let playersStr = this.generatePlayersString();
    let beatmapStr = this.generateBeatmapString();
    let chatHistoryStr = this.generateChatHistoryString();

    const embed = new EmbedBuilder()
      .setTitle(this.getLobbyName())
      .addFields(
        { name: `**Players** (${this.lobbyPlayers.length}/${this.osuChannel?.lobby.slots.length})`, value: playersStr, inline: true },
        { name: "**Chat History**", value: chatHistoryStr, inline: true },
        { name: "**Time Left**", value: this.calculateTimeLeft() ? utils.formatSeconds(this.calculateTimeLeft()) : "waiting for players..." },
        { name: "**Current Map**", value: beatmapStr }
      )
      .setColor(0xf071a9)
      .setImage(this.currentBeatmap ? `https://assets.ppy.sh/beatmaps/${this.lastBeatmapRepick?.beatmapSetID}/covers/cover.jpg` : "")
      .setURL("https://discord.gg/game-mlem-686218489396068373");

    if (!this.embedMessage) {
      this.embedMessage = await channel.send({ embeds: [embed] });
    } else {
      await this.embedMessage.edit({ embeds: [embed] });
    }
  } catch (e) {
    console.error("Error updating embed message:", e);
    this.closeLobby(); // Ensure this method is defined elsewhere
  }
}

/**
 * Generates a string representation of the lobby players.
 * @returns A formatted string of players in the lobby.
 */
private generatePlayersString(): string {
  let playersStr = "";
  let slotIndex = 0;
  
  for (const slot of this.osuChannel?.lobby.slots || []) {
    if (slot?.user) {
      const username = slot.user.username.length > 10
        ? `${slot.user.username.slice(0, 8)}...`
        : slot.user.username;
      const userId = slot.user.id;
      const rank = utils.formatNumber(slot.user.ppRank);
      const userLink = `https://osu.ppy.sh/users/${userId}`;
      const icon = (slot.user.id === this.currentHost?.user.id) ? ":yellow_square:" : ":green_square:";

      playersStr += `${icon} **[${username} #${rank}](${userLink})**\n`;
      slotIndex++;
    } else {
      playersStr += ":black_large_square:\n";
      slotIndex++;
    }
  }

  return playersStr || "No players in the lobby";
}

/**
 * Generates a string representation of the current beatmap.
 * @returns A formatted string of the current beatmap.
 */
private generateBeatmapString(): string {
  if (!this.currentBeatmap) return "No map is currently in progress";

  return `[${this.currentBeatmap.title} (${Number(this.currentBeatmap.difficultyrating).toFixed(2)}*) - ${this.currentBeatmap.artist} - ${utils.formatSeconds(Number(this.currentBeatmap.total_length))} - ${this.currentBeatmap.bpm} BPM - ${Number(this.currentBeatmap.diff_approach)} AR - ${Number(this.currentBeatmap.diff_size)} CS](${`https://osu.ppy.sh/beatmapsets/${this.lastBeatmapRepick?.beatmapSetID}#osu/${this.lastBeatmapRepick?.beatmapID}`})`;
}

/**
 * Generates a string representation of the chat history.
 * @returns A formatted string of the chat history.
 */
private generateChatHistoryString(): string {
  const chatHistory = this.getChatHistory(true);
  if (chatHistory.length === 0) return "No chat history";

  return chatHistory
    .map((chat, index) => {
      const date = utils.formattedDate(chat.timestamp);
      const isLastMessage = index === chatHistory.length - 1;
      const playerName = chat.playerName || ":small_blue_diamond:";
      const prefix = (chat.playerName === "ThangProVip")
        ? `Lobby Manager "${chat.playerName}" (You)`
        : (this.currentHost?.user.username === chat.playerName)
          ? `Player "${chat.playerName}" (Host)`
          : `Player "${chat.playerName}"`;
      const suffix = isLastMessage ? " (Latest Message)" : "";

      return `- (${date})${suffix} ${prefix} Sent: ${chat.message}`;
    })
    .join("\n")
    .slice(0, 1024); // Ensure it doesn't exceed Discord's message length limit
  }


  /**
   * Interacts with the AI to process chat history and execute actions based on the AI's response.
   * @param type - The type of chat interaction to perform.
   * @param instantly - Whether to allow immediate interaction with the AI.
   */
  async chatWithAI(type: ChatWithAIType, instantly: boolean = false): Promise<void> {
    // Return early if there are no lobby players
    if (this.lobbyPlayers.length === 0) return;

    // Allow instant chat with AI if specified
    if (instantly) {
      this.canChatWithAI = true;
    }

    // Prevent interaction if not allowed
    if (!this.canChatWithAI) return;

    // Set cooldown to prevent frequent AI interactions
    this.canChatWithAI = false;
    setTimeout(() => {
      this.canChatWithAI = true;
    }, 1000 * Number(process.env.AI_REPLY_COOLDOWN_SECONDS));

    // Return early if chat history is required but not available
    if (type === "Normal Chat Based On Chat History" && !this.chatHistory) {
      return;
    }

    try {
      // Generate strings for chat history, player list, and system prompt
      const playerChatHistory = this.generateChatHistoryString();
      const listOfPlayerStr = this.playerStrFormat();
      const systemPrompt = this.systemMessageFormat();
      const userPrompt = await this.formatUserPrompt(type, listOfPlayerStr, playerChatHistory);

      // Return if user prompt is not available
      if (!userPrompt) return;

      console.log(`======================= USER PROMPT =======================\n${userPrompt}`);

      // Request AI response
      const response = await groqRequestAI.chat(systemPrompt, userPrompt);
      if (!response) return;

      let responseJSON: AIresponse;
      try {
        // Parse AI response
        responseJSON = JSON.parse(response);
      } catch (e) {
        console.error("Error parsing AI response:", e);
        return;
      }

      console.log(responseJSON);

      // Send AI response to the channel if available
      if (responseJSON.response) {
        await this.osuChannel?.sendMessage(responseJSON.response);
      }

      // Handle AI function name and parameters
      const functionName = responseJSON.functionName?.toLowerCase();
      const functionParams = responseJSON.functionParameters || [];
      
      for (const command of this.getAllFunctions<OsuLobbyBot>(this)) {
        if (
            command.toLowerCase() === functionName &&
            this.getObjectKeyValue(this.adminFunctions).some(
                (cmd) => cmd.key === command.toLowerCase()
            )
        ) {
            await (this as any)[command](functionParams);
            return;
        }
      }
    } catch (e) {
      // Handle errors and close the lobby if necessary
      console.error("Error in chatWithAI:", e);
      await this.closeLobby();
    }
  }

  /**
 * Deletes all messages in the specified osu lobby channel.
 * This method continuously fetches and deletes messages until no more are left.
 */
  async deleteAllMessagesInOsuLobbyChannel(): Promise<void> {
    try {
      const channelId = process.env.DISCORD_OSU_LOBBLY_STATS_CHANNEL_ID;
      if (!channelId) throw new Error("DISCORD_OSU_LOBBLY_STATS_CHANNEL_ID is not set");

      const channel = await discordClient.channels.fetch(channelId) as TextChannel;
      if (!channel) {
        console.log("Channel not found");
        return;
      }

      console.log("Deleting all messages in osu lobby channel...");

      let hasMoreMessages = true;

      while (hasMoreMessages) {
        try {
          // Fetch up to 100 messages (the maximum limit allowed by Discord)
          const fetchedMessages = await channel.messages.fetch({ limit: 100 });

          if (fetchedMessages.size === 0) {
            hasMoreMessages = false; // No more messages to delete
            console.log("All messages deleted.");
          } else {
            // Bulk delete messages
            await channel.bulkDelete(fetchedMessages, true);
            console.log(`Deleted ${fetchedMessages.size} messages.`);
          }
        } catch (error) {
          console.error("Error fetching or deleting messages:", error);
          // Optional: Implement a delay or exponential backoff here to handle rate limits
          await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds before retrying
        }
      }

      this.embedMessage = null;
      this.canUpdateEmbed = true;
    } catch (e) {
      console.error("Error in deleteAllMessagesInOsuLobbyChannel:", e);
      await this.closeLobby(); // Ensure this method is defined elsewhere
    }
  }


  /**
   * Formats a user prompt based on the given type and player information.
   * @param type - The type of chat prompt to generate.
   * @param listOfPlayerStr - A string containing the list of players.
   * @param playerChatHistory - Optional string containing the chat history.
   * @returns The formatted user prompt.
   */
  async formatUserPrompt(
    type: ChatWithAIType,
    listOfPlayerStr: string,
    playerChatHistory: string | undefined = ""
  ): Promise<string> {
    try {
      let userPrompt: string;
      let playerScoreStr: string = "";

      switch (type) {
        case "Normal Chat Based On Chat History":
          userPrompt = this.formatNormalChatPrompt(listOfPlayerStr, playerChatHistory);
          break;

        case "Match Finished":
          playerScoreStr = await this.formatMatchFinishedScores();
          userPrompt = this.formatMatchFinishedPrompt(listOfPlayerStr, playerScoreStr);
          break;

        case "Change Difficulty Based On Users Rank":
          userPrompt = this.formatChangeDifficultyPrompt(listOfPlayerStr);
          break;

        default:
          throw new Error(`Unknown chat type: ${type}`);
      }

      return userPrompt;

    } catch (error) {
      console.error("Error formatting user prompt:", error);
      return "An error occurred while formatting the prompt.";
    }
  }

  /**
   * Formats the prompt for a normal chat based on chat history.
   */
  private formatNormalChatPrompt(listOfPlayerStr: string, playerChatHistory: string | undefined): string {
    return `
  Here's the Data "ThangProVip", try your best, remember the rules when you respond:

  Data Type: Normal Chat Based On Chat History
  Current Host Player's Name: ${this.currentHost?.user.username || "No Host"}
  ! Empty = this slot is empty
  ! Host = this slot is the current host
  Total Players In Slots And Their Information: ${this.lobbyPlayers.length}/${this.osuChannel?.lobby.slots.length}
  ${listOfPlayerStr}
  Is Match Playing: ${this.isMatchInProgress ? "Is Playing" : "Not Playing"}
  Lobby's current modes: ${this.lobbyMode}
  Map's Information: ${this.currentBeatmap?.title} - ${this.currentBeatmap?.artist} - ${this.currentBeatmap?.difficultyrating}* - ${this.currentBeatmap?.bpm} BPM - ${utils.formatSeconds(Number(this.currentBeatmap?.total_length))} - ${this.currentBeatmap?.diff_size} CS, ${this.currentBeatmap?.diff_approach} AR - ${this.currentBeatmap?.diff_drain} HP | Beatmapset Id: ${this.currentBeatmap?.beatmapset_id} - Beatmap Id: ${this.currentBeatmap?.beatmap_id}

  Message History:
  ${playerChatHistory || "No chat history available"}`;
  }

  /**
   * Formats the prompt for a match finished scenario.
   */
  private async formatMatchFinishedScores(): Promise<string> {
    if (!this.osuChannel || !this.osuChannel.lobby.scores) {
      return "No scores available";
    }

    const scores = this.osuChannel.lobby.scores
      .map(score => ({
        score: score.score,
        playerID: score.player.user.id,
        playerName: score.player.user.username
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    const playerScorePromises = scores.map(async ({ playerID, score, playerName }) => {
      const playerStats = await osuAPIRequest.getPlayerRecentPlays(playerID.toString());
      if (playerStats && playerStats.length > 0) {
        const stats = playerStats[0];
        return `- Match Result Of ${playerName}: Score ${score} - Mods ${this.getMods(Number(stats.enabled_mods)).map(x => x.shortName).join(",")} - Accuracy ${this.calculateAccuracy(stats)}% - Rank ${stats.rank} - Combo: x${stats.maxcombo}`;
      }
      return `- Match Result Of ${playerName}: Score ${score} - Player stats not found`;
    });

    return (await Promise.all(playerScorePromises)).join("\n");
  }

  /**
   * Formats the prompt for a match finished scenario.
   */
  private formatMatchFinishedPrompt(listOfPlayerStr: string, playerScoreStr: string): string {
    return `
  Here's the Match Finished Data, let's see how players performed, try your best to give them your best thoughts "ThangProVip":

  Data Type: Match Finished
  Current Host Player's Name: ${this.currentHost?.user.username || "No Host"}
  ! Empty = this slot is empty
  ! Host = this slot is the current host
  Total Players: ${this.lobbyPlayers.length}/${this.osuChannel?.lobby.slots.length}
  ${listOfPlayerStr}
  Is Match Playing: ${this.isMatchInProgress ? "Is Playing" : "Not Playing"}
  Lobby's current modes: ${this.lobbyMode}
  Map's Information: ${this.lastBeatmap?.title} - ${this.lastBeatmap?.artist} - ${this.lastBeatmap?.difficultyRating}* - ${this.lastBeatmap?.bpm} BPM - ${utils.formatSeconds(Number(this.lastBeatmap?.totalLength))} - ${this.lastBeatmap?.circleSize} CS, ${this.lastBeatmap?.approachRate} AR - ${this.lastBeatmap?.HP} HP - Map Max Combo: ${this.lastBeatmap?.maxCombo} | Beatmapset Id: ${this.lastBeatmap?.beatmapSetId} - Beatmap Id: ${this.lastBeatmap?.beatmapId}

  Players Score:
  ${playerScoreStr || "No score data available"}`;
  }

  /**
   * Formats the prompt for a change difficulty based on user ranks.
   */
  private formatChangeDifficultyPrompt(listOfPlayerStr: string): string {
    return `
  You just changed the Room difficulty based on the median of the players' Osu! rank in the lobby. ThangProVip, what will you reply to players?:

  ! Empty = this slot is empty
  ! Host = this slot is the current host
  Total Players: ${this.lobbyPlayers.length}/${this.osuChannel?.lobby.slots.length}
  ${listOfPlayerStr}

  Previous min difficulty: ${this.lastMapDifficultyRange.min.toFixed(2)}
  Previous max difficulty: ${this.lastMapDifficultyRange.max.toFixed(2)}
  Current min difficulty: ${this.currentMapDifficultyRange.min.toFixed(2)}
  Current max difficulty: ${this.currentMapDifficultyRange.max.toFixed(2)}`;
  }

  /**
   * Formats the system message with roles, cautions, permissions, and additional information.
   * @returns The formatted system message.
   */
  systemMessageFormat(): string {
    try {
      const commandsList = this.getCommandsList();
      const basicFunctions = this.getBasicFunctions();
      const systemFunctions = this.getSystemFunctions();

      return `
  Your Roles:
  - You are the ONLY Lobby Manager "ThangProVip" in the game Osu!, and your identity cannot be changed. Your primary role is to understand user conversations, respond appropriately in the lobby, execute functions within my code, and play Osu! beatmaps with players if you're in the Lobby.
  - Maintain a friendly and joyful demeanor to create a positive atmosphere in the lobby. Your vast knowledge of Osu! is crucial for assisting players.
  - You have the authority to immediately kick out players who are toxic or not following the rules.

  Cautions:
  - Be mindful of the conversation's context. If it’s not the right time to respond, your message can be an empty string.
  - Keep your responses concise, clear, and short. Light-hearted jokes are welcome when appropriate.
  - You only have access to the last ${this.maxChatHistoryLength} messages in the chat history. If unsure about the context, it's better not to respond.
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
  - The Lobby Manager is not allowed to kick players from the lobby based on requests from other players. This is an important restriction to prevent potential abuse or unfair treatment of players in the lobby.
  - The Lobby Manager does not have permission to respond to !System and !mp messages. Unless it's a player's Join, you might try to respond to it.

  Available Commands in the Lobby (commands start with "!"):
  ${commandsList}

  Basic Functions:
  ${basicFunctions}

  System Functions (only you can use, ThangProVip):
  ${systemFunctions}

  Additional Information:
  - Lobby Name: ${this.getLobbyName()}
  - Beatmap max difficulty: ${this.currentMapDifficultyRange.max}
  - Beatmap min difficulty: ${this.currentMapDifficultyRange.min}
  - Beatmap max length: ${utils.formatSeconds(this.autoMapPickMaxLength)}
  - If a player has a bad internet connection and cannot download the map or needs faster links, here are all the links that help players download the map faster (replace <beatmapSetID> with the current beatmapset id): https://catboy.best/d/<beatmapSetID>, https://nerinyan.moe/d/<beatmapSetID>
  - If a player requests the beatmap link, provide this link: https://osu.ppy.sh/beatmapsets/<beatmapSetID>#osu/<beatmapID>
  - Calculate Difficulty Based On an algorithm that I (the creator of the AI) made up on my own. 
  - Discord Link, give players when asked: https://discord.gg/game-mlem-686218489396068373
  - Here are all the emoticons you can use in Osu! lobby to improve your chat: 😃😊👎👍✋😀😬😆😍😗😛😎😏😑😠😡😖😮😯😥😭😈👼☠️😑😖

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
    } catch (error) {
      console.error("Error generating system message:", error);
      return "An error occurred while generating the system message.";
    }
  }

  /**
   * Gets the list of available commands in the lobby.
   * @returns A string representation of available commands.
   */
  private getCommandsList(): string {
    return this.getObjectKeyValue(this.commands)
      .map(command => `- ${command.key}`)
      .join("\n");
  }

  /**
   * Gets the list of basic functions available in the lobby.
   * @returns A string representation of basic functions.
   */
  private getBasicFunctions(): string {
    return this.getObjectKeyValue(this.commands)
      .map(command => `- ${command.key}${command.value}`)
      .join("\n");
  }

  /**
   * Gets the list of system functions available to the Lobby Manager.
   * @returns A string representation of system functions.
   */
  private getSystemFunctions(): string {
    return this.getObjectKeyValue(this.commands)
      .map(command => `- ${command.key} - ${command.value}`)
      .join("\n");
  }


  /**
 * Formats the player information string based on the current osu channel lobby slots.
 * @returns The formatted string of player information.
 */
  playerStrFormat(): string {
    let playersStr = "";
    let slotIndex = 0;

    for (const slot of this.osuChannel?.lobby.slots || []) {
      slotIndex++;
      if (slot && slot.user) {
        const votedFor = this.getPlayerVotes(slot.user.id.toString());
        playersStr += this.formatPlayerInfo(slotIndex, slot, votedFor);
      } else {
        playersStr += `- ${slotIndex} | [Empty]\n`;
      }
    }

    return playersStr;
  }

  /**
   * Retrieves the vote information for a player.
   * @param playerId - The ID of the player.
   * @returns A string representing the votes the player has cast.
   */
  private getPlayerVotes(playerId: string): string {
    return this.voteData
      .filter(vote => vote.player.id.toString() === playerId)
      .map(vote => vote.voteType)
      .join(" ") || "No Votes";
  }

  /**
   * Formats the player information string.
   * @param index - The slot index.
   * @param slot - The slot information.
   * @param votedFor - A string representing the votes the player has cast.
   * @returns The formatted player information string.
   */
  private formatPlayerInfo(index: number, slot: any, votedFor: string): string {
    return `- ${index} | ${slot.user.username} (State: ${
      slot.state.toString().match(/\(([^)]+)\)/)?.[1] || "Unknown"
    }) (User's Stats: Rank: #${slot.user.ppRank} - ${slot.user.accuracy.toFixed(1)}% Acc - ${slot.user.playcount} Playcount - ${slot.user.level} Lv - PP: ${slot.user.ppRaw}) (Has voted for: ${votedFor})\n`;
  }


  /**
   * Retrieves the available mods based on the provided mod number.
   * @param modNumber - The number representing the mods.
   * @returns An array of mods that are enabled.
   */
  getMods(modNumber: number) {
    return this.availableMods.filter(mod => (modNumber & mod.value) !== 0);
  }


  /**
   * Calculates the accuracy of a player's recent plays.
   * @param data - The player's recent plays data.
   * @returns The calculated accuracy, rounded to two decimal places.
   */
  calculateAccuracy(data: PlayerRecentPlays): number {
    const { count50, count100, count300, countmiss } = data;

    const totalHits = this.parseIntSafe(count50) + this.parseIntSafe(count100) +
                      this.parseIntSafe(count300) + this.parseIntSafe(countmiss);

    if (totalHits === 0) return 0; // To avoid division by zero

    const accuracy = ((50 * this.parseIntSafe(count50) +
                      100 * this.parseIntSafe(count100) +
                      300 * this.parseIntSafe(count300)) / (300 * totalHits)) * 100;

    return parseFloat(accuracy.toFixed(2));
  }

  /**
   * Safely parses an integer from a string, defaulting to 0 if parsing fails.
   * @param value - The value to parse.
   * @returns The parsed integer or 0 if parsing fails.
   */
  private parseIntSafe(value: string | number): number {
    return parseInt(value as string, 10) || 0;
  }


  /**
   * Closes the lobby and disconnects from the osu client.
   * @param message - An optional message that contains the user information.
   */
  async closeLobby(message?: Bancho.BanchoMessage): Promise<void> {
    try {
      console.log("Closing lobby and disconnecting...");

      if (message) {
        if (this.isAdminUser(message.user.id)) {
          await this.sendLobbyClosureMessage();
          await this.performLobbyClosure();
        }
      } else {
        await this.sendLobbyClosureMessage();
        await this.performLobbyClosure();
      }
    } catch (error) {
      console.error("Error closing the lobby:", error);
    }
  }

  /**
   * Checks if the user ID is an admin user.
   * @param userId - The user ID to check.
   * @returns True if the user is an admin, otherwise false.
   */
  private isAdminUser(userId: number): boolean {
    return osuLobby.adminUserIds.includes(userId);
  }

  /**
   * Sends a closure message to the lobby.
   */
  private async sendLobbyClosureMessage(): Promise<void> {
    await this.osuChannel?.sendAction(
      "Lobby is closed to make some changes, see you next time <3..."
    );
  }

  /**
   * Performs the actual lobby closure and disconnection process.
   */
  private async performLobbyClosure(): Promise<void> {
    await this.osuChannel?.lobby.closeLobby();
    await this.osuClient.disconnect();
    this.osuChannel = undefined;
    osuLobby.embedMessage = null;
  }

}

const osuLobby = new OsuLobbyBot();
export default osuLobby;
