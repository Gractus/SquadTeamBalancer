import BasePlugin from "./base-plugin.js";
import fetch from "node-fetch";
import fs from "fs";

export default class MySquadStatsCache extends BasePlugin {
  static get description() {
    return (
      "The <code>MySquadStatsCache</code> plugin acts as a caching layer for the MSS API. " +
      "It hooks into the MySquadStats to run requests. WARNING: "
    );
  }

  static get defaultEnabled() {
    return true;
  }

  static get optionsSpecification() {
    return {
      accessToken: {
        required: false,
        description: "MySquadStats API access token.",
        default: "",
      },
      userAgent: {
        required: false,
        description: "User agent reported to MSS.",
        default: "SquadJS-MySquadStatsCachePlugin",
      },
      apiRequestRetries: {
        required: false,
        description: "Number of retries for API requests.",
        default: 3,
      },
      apiRequestTimeout: {
        required: false,
        description: "Timeout in milliseconds for API requests.",
        default: 10000,
      },
      cachePlayerData: {
        required: false,
        description:
          "Whether to cache player skill data between server restarts.",
        default: true,
      },
      cacheExpiry: {
        required: false,
        description: "Hours before cached player data expires.",
        default: 48,
      },
      statsDatabaseFile: {
        required: false,
        description: "File path for cached player data.",
        default: "./playerStatsCache.json",
      },
      devLoggingMode: {
        required: false,
        description: "Enable detailed team composition logging at round end",
        default: false,
      },
    };
  }

  constructor(server, options, connectors) {
    super(server, options, connectors);
    this.playerData = {};
  }

  async mount() {
    this.loadPlayerDatabase();
    this.logInfo("SquadTeamBalancer plugin mounted");
  }

  async unmount() {
    // TODO: emit shutdown event that other plugins depending on this one can listen for.
    this.savePlayerDatabase()
    this.logInfo("SquadTeamBalancer plugin unmounted");
  }

  loadPlayerDatabase() {
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

        this.logInfo(`Loaded ${Object.keys(this.playerData).length} cached player records`);
      }
    } catch (error) {
      this.logError(`Error loading player data: ${error.message}`);
      this.playerData = {};
    }
  }

  savePlayerDatabase() {
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

  async getFromCache(steamID, freshnessSeconds) {
    let entry = this.playerData[steamID];
    if (entry.lastUpdated > Date.now() - freshnessSeconds * 1000) {
      return entry
    }
    return null
  }

  async getManyFromCache(steamIDs, freshness) {
    let results = {};
    steamIDs.forEach(steamID => {
      let result = this.getFromCache(steamID, freshness);
      if (result != null) {
        results[steamID] = result;
      }
    });
    return results
  }

  async fetchPlayerData(steamID, freshness = this.options.cacheExpiry) {
    if (this.options.cacheEnabled) {
      let data = this.getFromCache(steamID, freshness);
      if (data != null) return data
    }
    const stats = await this.fetchPlayerStats(steamID);
    const playerInfo = await this.fetchPlayerInfo(steamID);

    const apiPlayerName = playerInfo.lastName;
    const kdr = stats.totalKdRatio ?? 1.0;
    const totalScore = stats.totalScore ?? 0;
    const totalKills = stats.totalKills ?? 0;
    const totalDeaths = stats.totalDeaths ?? 0;
    const totalMatches = (stats.totalWins ?? 0) + (stats.totalLosses ?? 0);
    const winRate = (stats.totalWins / totalMatches) ?? 1.0;
    const playTime = calculateTotalPlayTime(playerInfo);

    const playerData = {
      steamID: steamID,
      name: apiPlayerName,
      playTime: playTime,
      winRate: winRate,
      kdr: kdr,
      totalScore: totalScore,
      totalMatches: totalMatches,
      totalKills: totalKills,
      totalDeaths: totalDeaths,
      lastUpdated: Date.now(),
    };

    this.cacheThisEntry(playerData);

    return playerData;
  }

  async fetchPlayerInfo(steamID) {
    const url = new URL('https://api.mysquadstats.com/players');
    url.searchParams.append('search', steamID);
    let result = await this.request(url).data[0];
    return result
  }

  async fetchPlayerStats() {
    const url = new URL('https://api.mysquadstats.com/alltimeleaderboards');
    url.searchParams.append('mod', 'vanilla');
    url.searchParams.append('search', steamID);
    let result = await this.request(url).data[0]
    return result
  }

  async requestJSON(url, maxRetries = this.options.apiRequestRetries) {
    if (this.options.accessToken) {
      url.searchParams.append("accessToken", this.options.accessToken);
    }

    const safeUrl = url.toString().replace(this.options.accessToken, "[ACCESS_TOKEN]");

    let lastError;
    let attempts = 0;
    while (attempts < maxRetries) {
      try {
        this.logDebug(`Making API request to ${safeUrl} (attempt ${attempts + 1}/${this.options.apiRequestRetries})`);
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.options.apiRequestTimeout);

        const response = await fetch(url, {
          signal: controller.signal,
          headers: { "User-Agent": this.options.userAgent },
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          this.logWarn(`API response not OK: ${response.status}`);
          throw new Error(`API response not OK: ${response.status}`);
        }

        const data = await response.json();

        if (data.successStatus === "Error") {
          this.logWarn(`API return error: ${data.successMessage || "Unknown error"}`);
          throw new Error(`API returned error: ${data.successMessage || "Unknown error"}`);
        }

        return data;
      } catch (error) {
        lastError = error;
        this.logWarn(`API request attempt ${attempts} failed: ${error.message}`);
        await new Promise((resolve) => setTimeout(resolve, 1000 * attempts));
      }
    }
    this.logError(`API request failed after max retries: ${maxRetries}. - ${lastError.message}`)
    throw lastError;
  }

  async cacheThisEntry(entry) {
    this.playerData[entry.steamID] = entry;
  }

  logError(message) {
    this.verbose(1, message);
  }

  logWarn(message) {
    this.verbose(2, message);
  }

  logInfo(message) {
    this.verbose(3, message);
  }

  logDebug() {
    this.verbose(4, message);
  }
}

function calculateTotalPlayTime(playerInfo) {
  if (!playerInfo || !playerInfo.playTimeInfo) return 0;

  let totalPlayTime = 0;
  for (const server of playerInfo.playTimeInfo) {
    totalPlayTime += server.timePlayed ?? 0;
  }

  return totalPlayTime;
}

function calculateWinPercentage(playerStats) {
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