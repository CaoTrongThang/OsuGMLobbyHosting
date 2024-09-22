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
  tags: string;
  favourite_count: string;
  rating: string;
  playcount: string;
  max_combo: string;
  diff_aim: string;
  diff_speed: string;
  difficultyrating: string;
};

// Define the type for an event
type Event = {
  display_html: string;
  beatmap_id: number;
  beatmapset_id: number;
  date: Date; // UTC date will be converted to a JavaScript Date object
  epicfactor: number;
};

// Define the main type for the user
export type osuUser = {
  user_id: number;
  username: string;
  join_date: Date;
  playcount: number;
  ranked_score: number;
  total_score: number;
  pp_rank: number;
  level: number;
  pp_raw: number;
  accuracy: number;
  count_rank_ss: number;
  count_rank_ssh: number;
  count_rank_s: number;
  count_rank_sh: number;
  count_rank_a: number;
  country: string;
  total_seconds_played: number;
  pp_country_rank: number;
};

export type PlayerTopPlays = {
  beatmap_id: string;
  score_id: string;
  score: string;
  maxcombo: string;
  count50: string;
  count100: string;
  count300: string;
  countmiss: string;
  countkatu: string;
  countgeki: string;
  perfect: string; // 1 = maximum combo of map reached, 0 otherwise
  enabled_mods: string; // bitwise flag representation of mods used
  user_id: string;
  date: string; // in UTC
  rank: string;
  pp: string; // float value, 4 decimals
  replay_available: string; // 1 = replay is available for download, 0 = replay is unavailable
};

class OsuAPIRequest {
  osuAPIKey: OsuAPIKey | null = null;

  beatmapGetCounter = 0;

  //TODO PICK LESS LOW LENGTH BEATMAP, LETS "SPED UP" MAPS
  async getRandomBeatmaps(
    minDifficulty: number,
    maxDifficulty: number,
    maxLength: number,
    sinceDay: Date,
    ar: number = 6
  ): Promise<Beatmap[]> {
    try {
      const OSU_API_URL = "https://osu.ppy.sh/api/get_beatmaps";

      const response = await axios.get(OSU_API_URL, {
        params: {
          k: process.env.OSU_LEGACY_API_KEY,
          m: 0,
          since: sinceDay,
          limit: 120,
        },
      });
      let beatmaps: Beatmap[] = response.data;

      let filteredBeatmaps;
      if (this.beatmapGetCounter > 6) {
        filteredBeatmaps = beatmaps.filter(
          (b) =>
            Number(b.playcount) >= 5000 &&
            Number(b.total_length) <= maxLength &&
            Number(b.difficultyrating) >= minDifficulty &&
            Number(b.difficultyrating) <= maxDifficulty &&
            Number(b.diff_approach) >= ar
        );
        this.beatmapGetCounter = 0;
        return filteredBeatmaps;
      } else {
        filteredBeatmaps = beatmaps.filter(
          (b) =>
            Number(b.playcount) >= 5000 &&
            Number(b.total_length) <= maxLength &&
            Number(b.difficultyrating) >= minDifficulty &&
            Number(b.difficultyrating) <= maxDifficulty &&
            Number(b.diff_approach) >= ar &&
            !b.title.toLowerCase().includes("cut ver") &&
            !b.title.toLowerCase().includes("tv size") &&
            !b.title.toLowerCase().includes("sped up") &&
            !b.title.toLowerCase().includes("tv size") &&
            !b.title.toLowerCase().includes("speed up") &&
            !b.title.toLowerCase().includes("(cv:")
        );
        this.beatmapGetCounter++;
        return filteredBeatmaps;
      }
    } catch (error) {
      console.error("Error fetching beatmaps:", error);
      return [];
    }
  }

  async getBeatmap(beatmapID: string) {
    try {
      const OSU_API_URL = "https://osu.ppy.sh/api/get_beatmaps";

      const response = await axios.get(OSU_API_URL, {
        params: {
          k: process.env.OSU_LEGACY_API_KEY,
          b: beatmapID,
          limit: 1,
        },
      });
      let beatmaps: Beatmap[] = response.data;
      return beatmaps;
    } catch (error) {
      console.error("Error fetching beatmaps:", error);
      return [];
    }
  }

  async getSpecificBeatmap(beatmapID: string) {
    try {
      const OSU_API_URL = "https://osu.ppy.sh/api/get_beatmaps";

      const response = await axios.get(OSU_API_URL, {
        params: {
          k: process.env.OSU_LEGACY_API_KEY,
          b: beatmapID,
        },
      });
      let beatmaps: Beatmap[] = response.data;
      return beatmaps;
    } catch (error) {
      console.error("Error fetching beatmaps:", error);
      return [];
    }
  }

  async getPlayerStats(userID: string) {
    let url = `https://osu.ppy.sh/api/get_user`;
    const response = await axios(url, {
      params: {
        k: process.env.OSU_LEGACY_API_KEY,
        m: 0,
        u: userID,
      },
    });

    if (response) {
      return response.data as osuUser[];
    } else {
      return null;
    }
  }

  async getPlayerTopPlays(userID: string) {
    let url = `https://osu.ppy.sh/api/get_user_best`;
    const response = await axios(url, {
      params: {
        k: process.env.OSU_LEGACY_API_KEY,
        m: 0,
        limit: 1,
        u: userID,
      },
    });

    if (response) {
      return response.data as PlayerTopPlays[];
    } else {
      return null;
    }
  }

  async getPlayerRecentPlays(userID: string) {
    let url = `https://osu.ppy.sh/api/get_user_recent`;
    const response = await axios(url, {
      params: {
        k: process.env.OSU_LEGACY_API_KEY,
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
    console.log("RATING: ", response.data);
    return response.data;
  }
}

const osuAPIRequest = new OsuAPIRequest();

export default osuAPIRequest;
