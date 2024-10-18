import osuLobby from "./OsuLobbyBot";

//TODO !VOTEMAP COMMAND, !votemap <link or id>
class OsuCommands {
  commandsList = {
    rhelp: "// Use it to get all the commands for players",
    voteskipmap: `(playerName: string) // Use it to skip the current map`,
    voteskiphost: "(playerName: string) // Use it to skip the current host",
    voteabortmatch: "(playerName: string) // Use it to abort the match",
    votestartmatch: "(playerName: string) // Use it to start the match",
    votechangemode: `(playerName: string) // Use it to switch the lobby's mode between "Host Rotate" and "Random Map" when the lobby has at least ${osuLobby.roomSize} players, the parameter must be the playerName`,
    votelastmap: `(playerName: string) // You and the player can use this to get the last map, maybe they want to play that map again`,
    fastlink:
      "// Players can use this command themself to get the faster links to download beatmap",
    timeleft:
      "// Players can use it to get the time left of the match if it's in progress",
  };

  systemFunctionsList = {
    kickPlayer:
      "(playerName: string) // to kick a player from the lobby if you saw he/her toxic with others, with the function's parameters",
    movePlayerToSlot:
      "(playerName: string, slot: number) // to move a player to a specific slot from 1 to 16, the slot parameter must be a number, not string allowed",
    changeLobbyMods:
      "(mods : string) // to change the Lobby's mods, if the lobby has 2 or more players, ask them if they want to change the mod to the requested mods, respond them if not enough players want to change the mod, can only use 3 mods at a time, if the lobby has only 1 player, just pick what the requested you.",
    startMatchTimer:
      "(timeoutSeconds : string) // start a match after timeoutSeconds, the parameter must be a number, maybe around 15 to 30 seconds, use this when more than half completed downloading the beatmap, use this function after you used the updatePlayersStates to update all players states",
    changeBeatmapByID:
      "(beatmapID : string) // to change the beatmap by beatmapID, beatmapID must be a number, use this function after you used the function checkBeatmapValidityToChangeBeatmapByID",
    changeBeatmapByYourOwnData: `(nameOfRequestedPlayer: string) // If the lobby has 1 player, you must use this function if the player don't provide and ID or link for the beatmap but before using this function in a lobby with more than 2 players, ask if they want to change the beatmap. If they agree but don't provide a beatmap ID or link, use this function. It will give you many beatmaps to choose from. Select one that fits the players' preferences and use changeBeatmapByID(beatmapID: string) to set it. It's helpful if players can specify preferred genres.`,
    doNothing: "This function helps you do nothing",
  };

  adminFunctionList = {
    closelobby: "close the lobby",
    kickPlayer:
      "kick a player from the lobby, with the function's parameters: playerName: string",
  };

  callbackFunctionsList = {
    getPlayerStats:
      "(playersNameToGetStats : string, nameOfThePlayerRequestedYou: string) // to get players aren't in the lobby by this function, get a player's stats from Osu! after few seconds you will get the data",
    getPlayerTopPlays:
      "(playersNameToGetToPlays : string, nameOfThePlayerAskedYou: string) // to get 3 top playes of a player from Osu!, after few seconds you will get the data tell players to wait for you to get the data",
    getPlayerRecentPlay: `(playersNameToGetTheRecentPlay : string, nameOfThePlayerRequestedYou: string) // to get the a recent play beatmap of a player from Osu!, you can use this if you want to know or comment about the latest plays of the players`,
    updatePlayersStates:
      "(this function has no parameter) //To update all players states, if the lobby's mode Auto Map Pick you want to update all players states to use function startMatchTimer, you should use this updateplayersstates to update players states first, if half is ready the match will start, else it won't start, this will take around 3s, tell players to wait or just respond an empty string",
    checkBeatmapValidityToChangeBeatmapByID: `(beatmapID : string, nameOfThePlayerRequestedYou : string) // you must use this checkBeatmapValidityToChangeBeatmapByID function if you want to change the beatmap by ID or beatmap links, this function requires players must already gave the beatmap id or the beatmap link and asked you to change to that beatmap, if it's a beatmap link, you only get the beatmapID of the link, it must be a number, tell players to wait for you check the map's validity after few seconds or ask if then just want to just vote to skip a map, tell players to wait or just respond an empty string`,
    getMatchHistory: `(nameOfThePlayerRequestedYou: string = "") // you must use this getMatchHistory function if you or someone want to talk about the last matches with you, if you want to talk about the match history, just leave the nameOfThePlayerRequestedYou parameter empty, this function will give you the data of the last matches after few seconds, tell players to wait or just respond an empty string`,
  };
}

const osuCommands = new OsuCommands();
export default osuCommands;
