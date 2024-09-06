class OsuCommands {
  commandsList = {
    rhelp: "// Use it to get all the commands for players",
    votechangemode: `(player_name: string) // Use it to switch the lobby's mode between "Host Rotate" and "Random Map" when the lobby has at least 3 players, the parameter must be the playerName`,
    voteskipmap: "(player_name: string) // Use it to skip the current map",
    voteskiphost: "(player_name: string) // Use it to skip the current host",
    voteabortmatch: "(player_name: string) // Use it to abort the match",
    votestartmatch: "(player_name: string) // Use it to start the match",
    timeleft:
      "// Player can use it to get the time left of the match if it's in progress",
  };

  systemFunctionsList = {
    kickplayer:
      "(playerName: string) // to kick a player from the lobby if you saw he/her toxic with others, with the function's parameters",
    moveplayertoslot:
      "(playerName: string, slot: number) // to move a player to a specific slot from 1 to 16, the slot parameter must be a number, not string allowed",
    changelobbymods:
      "(mods : string, howManyPlayersInMessageHistoryWantToChangeTheMod?) // to change the Lobby's MOD, only use this function only half of the players want to change to that mod in the Messages History, respond them if not enough players want to change the mod, can only use 3 mods at a time, example: `hd hr dt`",
    startmatchtimer:
      "(timeoutSeconds : string) start a match after timeoutSeconds, the parameter must be a number, maybe around 30, use this when half players are ready, use this function after you used the updatePlayersStates to update all players states",
    donothing: "This function helps you do nothing",
  };

  adminFunctionList = {
    closelobby: "close the lobby",
    kickplayer:
      "kick a player from the lobby, with the function's parameters: playerName: string",
  };

  callbackFunctionsList = {
    getplayerstats:
      "(playersNameToGetStats : string, nameOfThePlayerAskedYou: string) // to get players aren't in the lobby by this function, get a player's stats from Osu! after few seconds you will get the data",
    getusertopplays:
      "(playersNameToGetToPlays : string, nameOfThePlayerAskedYou: string) // to get 3 top playes of a player from Osu!, after few seconds you will get the data tell players to wait for you to get the data",
    getplayerrecentplay: `(playersNameToGetTheRecentPlay : string, nameOfThePlayerAskedYou: string") // to get the a recent played beatmap of a player from Osu!`,
    updateplayersstatestostartmatchtimer:
      "(this function has no parameter) //To update all players state, if the lobby's mode Auto Map Pick you want to update all players states to use function startmatchtimer, you should use this updateplayersstates to update players states first, if half is ready the match will start, else it won't start, this will take around 3s, tell players to wait for few seconds for you to check",
  };

  //   callbackFunctionsList = {
  //     getplayerstats: "to get player aren't in the lobby by this function, get a player's stats from Osu!, with the function's parameters: playersName : string, nameOfThePlayerAskedYou: string",
  //     gettime: "to get time from a specific country, remember to convert the country name to its corresponding two-letter ISO 3166-1 alpha-2 country codes, parameters: countryCode: string, nameOfThePlayerAskedYou: string",
  //     getweather: "to get weather from a specific country, remember to convert the country name to its corresponding two-letter ISO 3166-1 alpha-2 country codes, parameters: countryCode: string, nameOfThePlayerAskedYou: string"
  //   }
}

const osuCommands = new OsuCommands();
export default osuCommands;
