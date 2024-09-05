import dotenv from "dotenv";
import axios from "axios";

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
  score_id: string;
};

export type Beatmap = {
  beatmapset_id: string;
  beatmap_id: string;
  total_length: string;
  hit_length: string;
  diff_size: string;
  diff_overall: string;
  diff_approach: string;
  diff_drain: string;
  mode: string;
  artist: string;
  title: string;
  bpm: string;
  tags: string[];
  favourite_count: string;
  rating: string;
  playcount: string;
  max_combo: string;
  diff_aim: string;
  diff_speed: string;
  difficultyrating: string;
};

class OsuAPIRequest {
  private osuAPIKey: OsuAPIKey | null = null;
  private beatmapGetCounter: number = 5;

  /**
   * Fetches a random beatmap based on difficulty, length, and other parameters.
   * @param minDifficulty - The minimum difficulty rating.
   * @param maxDifficulty - The maximum difficulty rating.
   * @param maxLength - The maximum length of the beatmap.
   * @param sinceDay - The minimum date for the beatmap's creation.
   * @param ar - The approach rate threshold.
   * @returns An array of beatmaps that match the criteria.
   */
  async getRandomBeatmap(
    minDifficulty: number,
    maxDifficulty: number,
    maxLength: number,
    sinceDay: Date,
    ar: number = 9
  ): Promise<Beatmap[]> {
    try {
      if (this.beatmapGetCounter > 5) {
        this.beatmapGetCounter = 0;
      }

      const OSU_API_URL = "https://osu.ppy.sh/api/get_beatmaps";
      const response = await axios.get(OSU_API_URL, {
        params: {
          k: process.env.OSU_API_KEY,
          m: 0,
          since: sinceDay.toISOString(),
          limit: 100,
        },
      });

      let beatmaps: Beatmap[] = response.data;
      let filteredBeatmaps: Beatmap[];

      if (this.beatmapGetCounter > 5) {
        filteredBeatmaps = beatmaps.filter((b) =>
          this.isBeatmapValid(b, minDifficulty, maxDifficulty, maxLength, ar)
        );
      } else {
        filteredBeatmaps = beatmaps.filter((b) =>
          this.isBeatmapValid(b, minDifficulty, maxDifficulty, maxLength, ar, false)
        );
      }

      this.beatmapGetCounter++;
      return filteredBeatmaps;
    } catch (error) {
      console.error("Error fetching beatmaps:", error);
      return [];
    }
  }

  /**
   * Checks if a beatmap is valid based on the given criteria.
   * @param beatmap - The beatmap to validate.
   * @param minDifficulty - The minimum difficulty rating.
   * @param maxDifficulty - The maximum difficulty rating.
   * @param maxLength - The maximum length of the beatmap.
   * @param ar - The approach rate threshold.
   * @param includeTitles - Whether to include beatmaps with specific titles.
   * @returns True if the beatmap is valid, otherwise false.
   */
  private isBeatmapValid(
    beatmap: Beatmap,
    minDifficulty: number,
    maxDifficulty: number,
    maxLength: number,
    ar: number,
    includeTitles: boolean = true
  ): boolean {
    return (
      Number(beatmap.playcount) >= 5000 &&
      Number(beatmap.total_length) <= maxLength &&
      Number(beatmap.difficultyrating) >= minDifficulty &&
      Number(beatmap.difficultyrating) <= maxDifficulty &&
      Number(beatmap.diff_approach) > ar &&
      (includeTitles ? !beatmap.title.toLowerCase().includes("cut ver") && !beatmap.title.toLowerCase().includes("tv size") : true)
    );
  }

  /**
   * Retrieves recent plays of a player.
   * @param userID - The ID of the player.
   * @returns An array of recent plays or null if an error occurs.
   */
  async getPlayerRecentPlays(userID: string): Promise<PlayerRecentPlays[] | null> {
    try {
      const url = `https://osu.ppy.sh/api/get_user_recent`;
      const response = await axios.get(url, {
        params: {
          k: process.env.OSU_API_KEY,
          m: 0,
          limit: 1,
          u: userID,
        },
      });

      return response.data as PlayerRecentPlays[];
    } catch (error) {
      console.error("Error fetching player recent plays:", error);
      return null;
    }
  }

  /**
   * Requests a new osu! API key.
   * @returns The new API key or null if an error occurs.
   */
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

  /**
   * Refreshes the osu! API key if it is about to expire.
   */
  async refreshAPIKeyIfNeeded(): Promise<void> {
    if (this.osuAPIKey && this.osuAPIKey.expires_in < 10000) {
      console.log("Refreshing osu! API key...");
      await this.postAccessAPIKey();
    }
  }

  /**
   * Retrieves the difficulty rating of a beatmap with specific mods.
   * @param beatmap_id - The ID of the beatmap.
   * @param mods - The mods to apply.
   * @returns The difficulty rating of the beatmap.
   */
  async getBeatmapDifficultyRating(beatmap_id: string, mods: number): Promise<any> {
    try {
      const url = `https://osu.ppy.sh/api/v2/beatmaps/${beatmap_id}/attributes`;
      const response = await axios.post(url, { mods }, {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.osuAPIKey?.access_token}`,
        },
      });

      console.log("RATING: ", response.data);
      return response.data;
    } catch (error) {
      console.error("Error fetching beatmap difficulty rating:", error);
      return null;
    }
  }
}

const osuAPIRequest = new OsuAPIRequest();

export default osuAPIRequest;
