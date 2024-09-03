import dotenv from "dotenv";
import axios from "axios";
import utils from "../Utils";

dotenv.config();

export interface OsuAPIKey {
  access_token: string;
  token_type: string;
  expires_in: number;
}

export type PlayerRecentPlays = {
  beatmap_id: string;
  score: string;
  maxcombo: string;
  count50: string;
  count100: string;
  count300: string;
  countmiss: string;
  countkatu: string;
  countgeki: string;
  perfect: string;
  enabled_mods: string;
  user_id: string;
  date: string;
  rank: string;
  score_id: string
};

export type Beatmap = {
  beatmapset_id: string;
  beatmap_id: string;
  approved: string;
  total_length: string;
  hit_length: string;
  version: string;
  file_md5: string;
  diff_size: string;
  diff_overall: string;
  diff_approach: string;
  diff_drain: string;
  mode: string;
  count_normal: string;
  count_slider: string;
  count_spinner: string;
  submit_date: Date;
  approved_date: null;
  last_update: Date;
  artist: string;
  artist_unicode: string;
  title: string;
  title_unicode: string;
  creator: string;
  creator_id: string;
  bpm: string;
  source: string;
  tags: string;
  genre_id: string;
  language_id: string;
  favourite_count: string;
  rating: string;
  storyboard: string;
  video: string;
  download_unavailable: string;
  audio_unavailable: string;
  playcount: string;
  passcount: string;
  packs: null;
  max_combo: string;
  diff_aim: string;
  diff_speed: string;
  difficultyrating: string;
};

class OsuAPIRequest {
  osuAPIKey: OsuAPIKey | null = null;

  async getRandomBeatmap(
    minDifficulty: number,
    maxDifficulty: number,
    maxLength: number,
    sinceDay: Date,
    ar: number = 9
  ): Promise<Beatmap[]> {
    try {
      const OSU_API_URL = "https://osu.ppy.sh/api/get_beatmaps";

      const response = await axios.get(OSU_API_URL, {
        params: {
          k: process.env.OSU_API_KEY,
          m: 0,
          since: sinceDay,
          limit: 100,
        },
      });
      let beatmaps: Beatmap[] = response.data;

      let filteredBeatmaps;

      filteredBeatmaps = beatmaps.filter(
        (b) =>
          Number(b.playcount) > 10000 && Number(b.total_length) < maxLength
      );

      filteredBeatmaps = beatmaps.filter(
        (b) =>
          Number(b.difficultyrating) >= minDifficulty &&
          Number(b.difficultyrating) <= maxDifficulty &&
          Number(b.diff_approach) > ar &&
          !(
            b.title.toLowerCase().includes("tv size") ||
            b.title.toLowerCase().includes("cut ver")
          )
      );

      return filteredBeatmaps;
    } catch (error) {
      console.error("Error fetching beatmaps:", error);
      return [];
    }
  }
  async getPlayerRecentPlays(userID: string) {
    let url = `https://osu.ppy.sh/api/get_user_recent`;
    const response = await axios(url, {
      params: {
        k: process.env.OSU_API_KEY,
        m: 0,
        limit: 1,
        u: userID,
      },
    });

    
    if (response) {
      return response.data as PlayerRecentPlays[];
    } else {
      return null;
    }
  }
  async postAccessAPIKey(): Promise<OsuAPIKey | null> {
    try {
      const url = "https://osu.ppy.sh/oauth/token";
      const jsonData = {
        client_id: process.env.OSU_CLIENT_ID,
        client_secret: process.env.OSU_CLIENT_SECRET,
        grant_type: "client_credentials",
        scope: "public",
      };

      const response = await axios.post(url, jsonData, {
        headers: {
          "Content-Type": "application/json",
        },
      });

      this.osuAPIKey = response.data;
      console.log("New osu! API key obtained:", this.osuAPIKey);

      return this.osuAPIKey;
    } catch (error) {
      console.error("Error fetching osu! API key:", error);
      return null;
    }
  }

  async refreshAPIKeyIfNeeded() {
    if (this.osuAPIKey) {
      if (this.osuAPIKey?.expires_in < 10000) {
        console.log("Refreshing osu! API key...");
        await this.postAccessAPIKey();
      }
    }
  }

  //get beatmap's difficulty rating with mods, using osu! API v2 with post request and the data is the number of mods and the endpoint is /beatmaps/{beatmap_id}/attributes
  async getBeatmapDifficultyRating(beatmap_id: string, mods: number) {
    const url = `https://osu.ppy.sh/api/v2/beatmaps/${beatmap_id}/attributes`;
    const response = await axios.post(url, {
      mods: mods,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.osuAPIKey?.access_token}`,
      },
    });
    console.log("RATING: ",response.data);
    return response.data;
  }
}

const osuRequest = new OsuAPIRequest();
export default osuRequest;
