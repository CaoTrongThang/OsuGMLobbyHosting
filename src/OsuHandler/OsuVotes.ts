
//TODO STILL IN WORKING, NOT USING IN ANYTHING
import * as Banchojs from "bancho.js"

type VoteData = {
    player: Banchojs.BanchoUser;
    voteType: VoteType;
  };

type VoteType =
  | "Skip Map"
  | "Skip Host"
  | "Abort Match"
  | "Start Match"
  | "Change Mode";

class OsuVotes{
    voteData: VoteData[] = [];
    osuChannel : Banchojs.BanchoMultiplayerChannel | null = null
    constructor(osuChannel : Banchojs.BanchoMultiplayerChannel){
        this.osuChannel = osuChannel
    }
    addAndPerformVote(player: Banchojs.BanchoUser, voteType : VoteType){
        if(this.voteData.some(x => {
            x.player.id == player.id
        })){
            
        }
    }

    getVoteLength(voteType : VoteType){
        return this.voteData.filter(x => x.voteType == voteType).length
    }

}