import fetch from "node-fetch";
import fs from "fs";

export default class MySquadStatsUtils {
  constructor(options = {}) {
    this.options = {
      apiRequestRetries: 3,
      apiRequestTimeout: 10000,
      cachePlayerData: true,
      cacheExpiry: 24,
      fallbackSkillRating: 1500,
      playerListFile: "./playerSkillData.json",
      verboseLogging: false,
      accessToken: "",
      testMode: false,
      ...options,
    };

    // Configure Elo rating settings
    this.eloConfig = {
      baseRating: 1500, // Average player rating (50% winrate, 1.0 KDR)
      minRating: 500, // Minimum possible rating
      maxRating: 4000, // Maximum possible rating

      // Win rate thresholds and weights
      winRate: {
        belowAverage: 10, // Points per percentage point below 50%
        average: 10, // Points per percentage point for 50-60%
        good: 15, // Points per percentage point for 60-70%
        veryGood: 25, // Points per percentage point for 70-80%
        exceptional: 40, // Points per percentage point above 80%
      },

      // KDR thresholds and weights
      kdr: {
        belowAverage: 200, // Points per KDR point below 1.0
        average: 200, // Points per KDR point for 1.0-2.0
        good: 300, // Points per KDR point for 2.0-3.0
        veryGood: 400, // Points per KDR point for 3.0-4.0
        exceptional: 500, // Points per KDR point above 4.0
      },

      // Killstreak thresholds and point values
      killstreak: {
        worst: { threshold: 6, points: -150 }, // 0-5 kills: -200 points, 6-7 kills: -150 points
        terrible: { threshold: 8, points: -100 }, // 8-11 kills: -100 points
        bad: { threshold: 12, points: -50 }, // 12-14 kills: -50 points
        average: { threshold: 15, points: 0 }, // 15-19 kills: 0 points (baseline)
        good: { threshold: 20, points: 150 }, // 20-24 kills: +150 points
        great: { threshold: 25, points: 200 }, // 25-29 kills: +200 points
        top: { threshold: 30, points: 250 }, // 30+ kills: +250 points
      },

      // Penalties for insufficient data
      penalties: {
        noProfile: 200, // Deduct for no profile or API failure
        fewMatches: 100, // Deduct if less than minMatchCount matches
        fewKills: 100, // Deduct if less than minKillCount kills/deaths
        minMatchCount: 10, // Minimum matches needed to avoid penalty
        minKillCount: 30, // Minimum kills/deaths needed to avoid penalty
      },
    };

    this.playerData = {};
    this.logger = options.logger || {
      verbose: (level, msg) => console.log(`[INFO:${level}] ${msg}`),
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

        if (this.options.verboseLogging) {
          this.logger.verbose(
            2,
            `Loaded ${
              Object.keys(this.playerData).length
            } cached player records`
          );
        }
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
      if (this.options.verboseLogging) {
        this.logger.verbose(
          2,
          `Saved ${Object.keys(this.playerData).length} player records to cache`
        );
      }
    } catch (error) {
      this.logger.verbose(1, `Error saving player data: ${error.message}`);
    }
  }

  async fetchPlayersData(players) {
    this.logger.verbose(1, `Fetching skill data for ${players.length} players`);

    if (!this.options.accessToken) {
      this.logger.verbose(
        1,
        `No access token provided for API requests, using fallback data for all players`
      );
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

        if (this.options.verboseLogging) {
          this.logger.verbose(
            2,
            `Processed ${processedCount}/${players.length} players`
          );
        }

        if (i + batchSize < players.length) {
          const delay = 2000;
          if (this.options.verboseLogging) {
            this.logger.verbose(2, `Waiting ${delay}ms before next batch...`);
          }
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      } catch (error) {
        this.logger.verbose(1, `Error processing batch: ${error.message}`);
      }
    }

    this.logger.verbose(
      1,
      `Completed fetching skill data for players. Retrieved ${
        Object.keys(this.playerData).length
      } records.`
    );
    return this.playerData;
  }

  async fetchPlayerData(steamID, playerName = "") {
    if (
      this.options.cachePlayerData &&
      this.playerData[steamID] &&
      Date.now() - this.playerData[steamID].lastUpdated <
        this.options.cacheExpiry * 60 * 60 * 1000
    ) {
      if (this.options.verboseLogging) {
        this.logger.verbose(2, `Using cached data for player ${steamID}`);
      }
      return this.playerData[steamID];
    }

    try {
      if (this.options.verboseLogging) {
        this.logger.verbose(2, `Fetching data for player ${steamID} from API`);
      }

      if (!this.options.accessToken) {
        this.logger.verbose(
          1,
          `No access token provided for API request, using fallback data`
        );
        return this.createFallbackData(steamID, playerName);
      }

      const playerInfo = await this.apiRequest("players", { search: steamID });

      if (!playerInfo || !playerInfo.data || playerInfo.data.length === 0) {
        if (this.options.verboseLogging) {
          this.logger.verbose(2, `No player info found for ${steamID}`);
        }
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

      const winRateComponent = this.calculateWinRateComponent(winRate);
      const kdrComponent = this.calculateKdrComponent(kdr);
      const killstreakComponent =
        this.calculateKillstreakComponent(highestKillstreak);

      let eloRating =
        this.eloConfig.baseRating +
        winRateComponent +
        kdrComponent +
        killstreakComponent;

      let appliedPenalties = [];

      if (totalMatches < this.eloConfig.penalties.minMatchCount) {
        eloRating -= this.eloConfig.penalties.fewMatches;
        appliedPenalties.push(
          `Not enough matches (${totalMatches}/${this.eloConfig.penalties.minMatchCount})`
        );
      }

      if (totalKills + totalDeaths < this.eloConfig.penalties.minKillCount) {
        eloRating -= this.eloConfig.penalties.fewKills;
        appliedPenalties.push(
          `Not enough kills/deaths (${totalKills + totalDeaths}/${
            this.eloConfig.penalties.minKillCount
          })`
        );
      }

      eloRating = Math.max(
        this.eloConfig.minRating,
        Math.min(this.eloConfig.maxRating, eloRating)
      );

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
        skillRating: Math.round(eloRating),
        appliedPenalties: appliedPenalties,
        lastUpdated: Date.now(),
      };

      this.playerData[steamID] = playerData;

      if (this.options.verboseLogging) {
        let logMessage = `Player ${steamID} (${apiPlayerName}) Elo rating: ${eloRating}`;
        if (appliedPenalties.length > 0) {
          logMessage += ` - Penalties applied: ${appliedPenalties.join(", ")}`;
        }
        this.logger.verbose(2, logMessage);
      }

      return playerData;
    } catch (error) {
      this.logger.verbose(
        1,
        `Error fetching player data for ${steamID}: ${error.message}`
      );

      if (this.playerData[steamID]) {
        return this.playerData[steamID];
      }

      return this.createFallbackData(steamID, playerName);
    }
  }

  createFallbackData(steamID, name = "") {
    const penalizedElo =
      this.eloConfig.baseRating - this.eloConfig.penalties.noProfile;

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
      skillRating: Math.max(this.eloConfig.minRating, penalizedElo),
      appliedPenalties: ["No profile or API failure"],
      lastUpdated: Date.now(),
    };

    if (this.options.verboseLogging) {
      this.logger.verbose(
        2,
        `Using fallback data for ${steamID}, Elo rating: ${fallbackData.skillRating} (penalized -${this.eloConfig.penalties.noProfile})`
      );
    }

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
        if (this.options.verboseLogging) {
          const safeUrl = this.options.accessToken
            ? fullUrl.replace(this.options.accessToken, "[ACCESS_TOKEN]")
            : fullUrl;
          this.logger.verbose(
            2,
            `Making API request to ${safeUrl} (attempt ${attempts + 1}/${
              this.options.apiRequestRetries
            })`
          );
        }

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

        if (this.options.verboseLogging) {
          this.logger.verbose(
            2,
            `API request attempt ${attempts} failed: ${error.message}`
          );
        }

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

    return totalPlayTime / 3600;
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

  calculateWinRateComponent(winRate) {
    winRate = winRate || 50;
    let points = 0;

    if (winRate < 50) {
      points = (winRate - 50) * this.eloConfig.winRate.belowAverage;
    } else if (winRate <= 60) {
      points = (winRate - 50) * this.eloConfig.winRate.average;
    } else if (winRate <= 70) {
      points =
        (60 - 50) * this.eloConfig.winRate.average +
        (winRate - 60) * this.eloConfig.winRate.good;
    } else if (winRate <= 80) {
      points =
        (60 - 50) * this.eloConfig.winRate.average +
        (70 - 60) * this.eloConfig.winRate.good +
        (winRate - 70) * this.eloConfig.winRate.veryGood;
    } else {
      points =
        (60 - 50) * this.eloConfig.winRate.average +
        (70 - 60) * this.eloConfig.winRate.good +
        (80 - 70) * this.eloConfig.winRate.veryGood +
        (winRate - 80) * this.eloConfig.winRate.exceptional;
    }

    return points;
  }

  calculateKdrComponent(kdr) {
    kdr = kdr || 1.0;
    let points = 0;

    if (kdr < 1.0) {
      points = (kdr - 1.0) * this.eloConfig.kdr.belowAverage;
    } else if (kdr <= 2.0) {
      points = (kdr - 1.0) * this.eloConfig.kdr.average;
    } else if (kdr <= 3.0) {
      points =
        (2.0 - 1.0) * this.eloConfig.kdr.average +
        (kdr - 2.0) * this.eloConfig.kdr.good;
    } else if (kdr <= 4.0) {
      points =
        (2.0 - 1.0) * this.eloConfig.kdr.average +
        (3.0 - 2.0) * this.eloConfig.kdr.good +
        (kdr - 3.0) * this.eloConfig.kdr.veryGood;
    } else {
      points =
        (2.0 - 1.0) * this.eloConfig.kdr.average +
        (3.0 - 2.0) * this.eloConfig.kdr.good +
        (4.0 - 3.0) * this.eloConfig.kdr.veryGood +
        (kdr - 4.0) * this.eloConfig.kdr.exceptional;
    }

    return points;
  }

  calculateKillstreakComponent(highestKillstreak) {
    if (!highestKillstreak) return 0;

    if (highestKillstreak >= 30) {
      return this.eloConfig.killstreak.top.points;
    } else if (highestKillstreak >= 25) {
      return this.eloConfig.killstreak.great.points;
    } else if (highestKillstreak >= 20) {
      return this.eloConfig.killstreak.good.points;
    } else if (highestKillstreak >= 15) {
      return this.eloConfig.killstreak.average.points;
    } else if (highestKillstreak >= 12) {
      return this.eloConfig.killstreak.bad.points;
    } else if (highestKillstreak >= 8) {
      return this.eloConfig.killstreak.terrible.points;
    } else if (highestKillstreak >= 6) {
      return this.eloConfig.killstreak.worst.points;
    } else {
      return -200;
    }
  }

  calculateEloRating(winRate, kdr) {
    const winRateComponent = this.calculateWinRateComponent(winRate);
    const kdrComponent = this.calculateKdrComponent(kdr);

    let rating = this.eloConfig.baseRating + winRateComponent + kdrComponent;

    rating = Math.max(
      this.eloConfig.minRating,
      Math.min(this.eloConfig.maxRating, rating)
    );

    return Math.round(rating);
  }

  calculatePlayerSkillRating(playerData) {
    if (!playerData) return this.eloConfig.baseRating;

    const winRateComponent = this.calculateWinRateComponent(playerData.winRate);
    const kdrComponent = this.calculateKdrComponent(playerData.kdr);
    const killstreakComponent = this.calculateKillstreakComponent(
      playerData.highestKillstreak
    );

    let rating =
      this.eloConfig.baseRating +
      winRateComponent +
      kdrComponent +
      killstreakComponent;

    rating = Math.max(
      this.eloConfig.minRating,
      Math.min(this.eloConfig.maxRating, rating)
    );

    return Math.round(rating);
  }
}
