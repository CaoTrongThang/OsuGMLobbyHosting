class OsuCommands {
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
    startmatchafter:
      "if the lobby's mode Auto Map Pick and half of them are in state Ready, you should use this function to start match after like 30 seconds, with the function's parameter is: seconds: string",
    changelobbymods:
      "to change the Lobby's MOD, only use this function only half of the players want to change to that mod in the chat history, can only use 2 mods at a time, with parameters: how_Many_Players_In_The_Chat_Want_To_Change_The_Mod : string, mods : string",
    donothing: "This function helps you do nothing",
  };

  adminFunctionList = {
    closelobby: "close the lobby",
    kickplayer:
      "kick a player from the lobby, with the function's parameters: playerName: string",
  };

  callbackFunctionsList = {
    getplayerstats:
      "to get players aren't in the lobby by this function, get a player's stats from Osu!, with the function's parameters: playersName : string, nameOfThePlayerAskedYou: string",
  };

  //   callbackFunctionsList = {
  //     getplayerstats: "to get player aren't in the lobby by this function, get a player's stats from Osu!, with the function's parameters: playersName : string, nameOfThePlayerAskedYou: string",
  //     gettime: "to get time from a specific country, remember to convert the country name to its corresponding two-letter ISO 3166-1 alpha-2 country codes, parameters: countryCode: string, nameOfThePlayerAskedYou: string",
  //     getweather: "to get weather from a specific country, remember to convert the country name to its corresponding two-letter ISO 3166-1 alpha-2 country codes, parameters: countryCode: string, nameOfThePlayerAskedYou: string"
  //   }
}

const osuCommands = new OsuCommands();
export default osuCommands;
