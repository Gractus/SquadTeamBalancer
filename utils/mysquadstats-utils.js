import fetch from "node-fetch";
import fs from "fs";

export default class MySquadStatsUtils {
  constructor(options = {}) {
    this.options = {
      apiRequestRetries: 3,
      apiRequestTimeout: 10000,
      cachePlayerData: true,
      cacheExpiry: 24,
      playerListFile: "./playerSkillData.json",
      verboseLogging: false,
      accessToken: "",
      testMode: false,
      ...options,
    };

    this.playerData = {};
    this.logger = options.logger || {
      verbose: (level, msg) => { if (this.verboseLogging) { console.log(`[INFO:${level}] ${msg}`) } },
      error: (msg) => console.error(`[ERROR] ${msg}`),
    };

    this.loadPlayerData();
  }

  loadPlayerData() {
    try {
      if (fs.existsSync(this.options.playerListFile)) {
        const data = fs.readFileSync(this.options.playerListFile, "utf8");
        const fileData = JSON.parse(data);

        const now = Date.now();
        const expiryMs = this.options.cacheExpiry * 60 * 60 * 1000;

        this.playerData = Object.fromEntries(
          Object.entries(fileData).filter(([_, playerInfo]) => {
            return now - playerInfo.lastUpdated < expiryMs;
          })
        );

        this.logger.verbose(2, `Loaded ${Object.keys(this.playerData).length} cached player records`);
      }
    } catch (error) {
      this.logger.verbose(1, `Error loading player data: ${error.message}`);
      this.playerData = {};
    }
  }

  savePlayerData() {
    if (!this.options.cachePlayerData) return;

    try {
      fs.writeFileSync(
        this.options.playerListFile,
        JSON.stringify(this.playerData, null, 2),
        "utf8"
      );
      this.logger.verbose(2, `Saved ${Object.keys(this.playerData).length} player records to cache`);
    } catch (error) {
      this.logger.verbose(1, `Error saving player data: ${error.message}`);
    }
  }

  async fetchPlayersData(players) {
    this.logger.verbose(1, `Fetching skill data for ${players.length} players`);

    if (!this.options.accessToken) {
      this.logger.verbose(1, `No access token provided for API requests, using fallback data for all players`);
      return this.createFallbackDataForPlayers(players);
    }

    const batchSize = 3;
    let processedCount = 0;

    for (let i = 0; i < players.length; i += batchSize) {
      const batch = players.slice(i, i + batchSize);
      const promises = batch.map((player) =>
        this.fetchPlayerData(player.steamID, player.name)
      );

      try {
        await Promise.allSettled(promises);
        processedCount += batch.length;

        this.logger.verbose(2, `Processed ${processedCount}/${players.length} players`);

        if (i + batchSize < players.length) {
          const delay = 2000;
          this.logger.verbose(2, `Waiting ${delay}ms before next batch...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      } catch (error) {
        this.logger.verbose(1, `Error processing batch: ${error.message}`);
      }
    }

    this.logger.verbose(1, `Completed fetching skill data for players. Retrieved ${Object.keys(this.playerData).length} records.`);
    return this.playerData;
  }

  async fetchPlayerData(steamID, playerName = "") {
    if (
      this.options.cachePlayerData &&
      this.playerData[steamID] &&
      Date.now() - this.playerData[steamID].lastUpdated <
      this.options.cacheExpiry * 60 * 60 * 1000
    ) {
      this.logger.verbose(2, `Using cached data for player ${steamID}`);
      return this.playerData[steamID];
    }

    try {
      this.logger.verbose(2, `Fetching data for player ${steamID} from API`);

      const playerInfo = await this.apiRequest("players", { search: steamID });

      if (!playerInfo || !playerInfo.data || playerInfo.data.length === 0) {
        this.logger.verbose(2, `No player info found for ${steamID}`);
        return this.createFallbackData(steamID, playerName);
      }

      const playerStats = await this.apiRequest("alltimeleaderboards", {
        dlc: "vanilla",
        search: steamID,
      });

      const apiPlayerName = playerInfo.data[0].lastName || playerName;

      const playTime = this.calculateTotalPlayTime(playerInfo.data[0]);
      const winRate = this.calculateWinRate(playerStats);
      const kdr =
        playerStats && playerStats.data && playerStats.data[0]
          ? playerStats.data[0].totalKdRatio || 1.0
          : 1.0;

      let totalMatches = 0;
      let totalKills = 0;
      let totalDeaths = 0;
      let highestKillstreak = 0;

      if (playerStats && playerStats.data && playerStats.data.length > 0) {
        const stats = playerStats.data[0];
        totalMatches = (stats.totalWins || 0) + (stats.totalLosses || 0);
        totalKills = stats.totalKills || 0;
        totalDeaths = stats.totalDeaths || 0;
        highestKillstreak = stats.highestKillstreak || 0;
      }

      const playerData = {
        steamID: steamID,
        name: apiPlayerName,
        playTime: playTime,
        winRate: winRate,
        kdr: kdr,
        totalMatches: totalMatches,
        totalKills: totalKills,
        totalDeaths: totalDeaths,
        highestKillstreak: highestKillstreak,
        lastUpdated: Date.now(),
      };

      this.playerData[steamID] = playerData;

      return playerData;
    } catch (error) {
      this.logger.verbose(1, `Error fetching player data for ${steamID}: ${error.message}`);

      if (this.playerData[steamID]) {
        return this.playerData[steamID];
      }

      return this.createFallbackData(steamID, playerName);
    }
  }

  createFallbackData(steamID, name = "") {
    const fallbackData = {
      steamID: steamID,
      name: name || `Player-${steamID.substr(-6)}`,
      playTime: 0,
      winRate: 50,
      kdr: 1.0,
      totalMatches: 0,
      totalKills: 0,
      totalDeaths: 0,
      highestKillstreak: 0,
      lastUpdated: Date.now(),
    };

    this.logger.verbose(2, `Using fallback data for ${steamID}`);

    this.playerData[steamID] = fallbackData;
    return fallbackData;
  }

  createFallbackDataForPlayers(players) {
    for (const player of players) {
      if (!player.steamID) continue;

      if (!this.playerData[player.steamID]) {
        this.createFallbackData(player.steamID, player.name);
      }
    }

    return this.playerData;
  }

  async apiRequest(endpoint, params = {}) {
    let attempts = 0;
    let lastError = null;

    const url = new URL(`https://mysquadstats.com/api/${endpoint}`);

    if (this.options.accessToken) {
      url.searchParams.append("accessToken", this.options.accessToken);
    }

    for (const [key, value] of Object.entries(params)) {
      url.searchParams.append(key, value);
    }

    const fullUrl = url.toString();

    while (attempts < this.options.apiRequestRetries) {
      try {
        const safeUrl = this.options.accessToken
          ? fullUrl.replace(this.options.accessToken, "[ACCESS_TOKEN]")
          : fullUrl;
        this.logger.verbose(2, `Making API request to ${safeUrl} (attempt ${attempts + 1}/${this.options.apiRequestRetries})`);

        const controller = new AbortController();
        const timeoutId = setTimeout(
          () => controller.abort(),
          this.options.apiRequestTimeout
        );

        const response = await fetch(fullUrl, {
          signal: controller.signal,
          headers: {
            "User-Agent": "SquadJS-BalancerPlugin/1.0",
          },
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`API response not OK: ${response.status}`);
        }

        const data = await response.json();

        if (data.successStatus === "Error") {
          throw new Error(
            `API returned error: ${data.successMessage || "Unknown error"}`
          );
        }

        return data;
      } catch (error) {
        attempts++;
        lastError = error;

        this.logger.verbose(2, `API request attempt ${attempts} failed: ${error.message}`);

        if (attempts < this.options.apiRequestRetries) {
          await new Promise((resolve) => setTimeout(resolve, 1000 * attempts));
        }
      }
    }

    throw lastError || new Error("API request failed");
  }

  calculateTotalPlayTime(playerInfo) {
    if (!playerInfo || !playerInfo.playTimeInfo) return 0;

    let totalPlayTime = 0;
    for (const server of playerInfo.playTimeInfo) {
      totalPlayTime += server.timePlayed || 0;
    }

    return totalPlayTime;
  }

  calculateWinRate(playerStats) {
    if (!playerStats || !playerStats.data || playerStats.data.length === 0) {
      return 50;
    }

    const stats = playerStats.data[0];
    const wins = stats.totalWins || 0;
    const losses = stats.totalLosses || 0;

    if (wins + losses === 0) {
      return 50;
    }

    return (wins / (wins + losses)) * 100;
  }
}
