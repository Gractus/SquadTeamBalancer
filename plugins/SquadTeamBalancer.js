import BasePlugin from "./base-plugin.js";
import MySquadStatsUtils from "../utils/mysquadstats-utils.js";
import SquadBalancerUtils from "../utils/squad-balancer-utils.js";
import fs from "fs";
import path from "path"; 

export default class SquadTeamBalancer extends BasePlugin {
  static get description() {
    return (
      "The <code>SquadTeamBalancer</code> can be used to balance teams based on player skill ratings. " +
      "It offers two balancing modes: minimal changes to achieve balance, or a more extensive shuffle while maintaining balance."
    );
  }

  static get defaultEnabled() {
    return true;
  }

  static get optionsSpecification() {
    return {
      balanceCommand: {
        required: false,
        description: "The command used to balance teams with minimal changes.",
        default: "randomisebalance",
      },
      minExecutionTime: {
        required: false,
        description:
          "Minimum time in seconds to wait after round end before executing balance operations",
        default: 15,
      },
      maxExecutionTime: {
        required: false,
        description:
          "Maximum time in seconds after round end to complete balance operations",
        default: 45,
      },
      adminNotificationsEnabled: {
        required: false,
        description:
          "Whether to send notifications to admins about command usage and errors.",
        default: true,
      },
      balanceCommandAliases: {
        required: false,
        description: "Alternative commands for balance mode.",
        default: ["rbalance", "randombalance"],
      },
      fullShuffleCommand: {
        required: false,
        description:
          "The command used to extensively shuffle teams while maintaining balance.",
        default: "randomisefull",
      },
      fullShuffleCommandAliases: {
        required: false,
        description: "Alternative commands for full shuffle mode.",
        default: ["rfull", "randomfull"],
      },
      checkCommand: {
        required: false,
        description:
          "The command used to check current team ELO balance without swapping.",
        default: "randomisecheck",
      },
      checkCommandAliases: {
        required: false,
        description: "Alternative commands for checking team balance.",
        default: ["rcheck", "randomcheck"],
      },
      checkingMessage: {
        required: false,
        description: "Message sent to admin when checking team ELO ratings.",
        default: "Fetching current ELO ratings for teams...",
      },
      stopCommand: {
        required: false,
        description: "The command used to stop any active team shuffling.",
        default: "randomisestop",
      },
      stopCommandAliases: {
        required: false,
        description: "Alternative commands to stop shuffling.",
        default: ["rstop", "randomstop"],
      },
      forceCommand: {
        required: false,
        description:
          "The command used to force immediate execution of pending shuffles.",
        default: "forcerandomise",
      },
      startBalanceMessage: {
        required: false,
        description: "The message broadcast when balance mode is activated.",
        default:
          "We will be balancing teams during end match results. This system is automated.",
      },
      startFullShuffleMessage: {
        required: false,
        description:
          "The message broadcast when full shuffle mode is activated.",
        default:
          "We will be shuffling teams during end match results. We will attempt to keep you together with your squad. This system is automated.",
      },
      stopMessage: {
        required: false,
        description: "The message broadcast when team shuffling is cancelled.",
        default: "Team balancing has been cancelled.",
      },
      intervalMessage: {
        required: false,
        description:
          "The message broadcast at intervals before shuffling occurs.",
        default:
          "Team balancing will occur during end match results. This system is automated.",
      },
      enableIntervalBroadcast: {
        required: false,
        description: "Enable or disable interval broadcasts.",
        default: true,
      },
      intervalTime: {
        required: false,
        description: "The interval time in minutes for broadcast reminders.",
        default: 5,
      },
      alreadyScheduledMessage: {
        required: false,
        description: "Message when a balance is already scheduled.",
        default:
          "Team balancing is already scheduled. Use the stop command first.",
      },
      notScheduledMessage: {
        required: false,
        description: "Message when no balance is scheduled.",
        default: "No team balancing is currently scheduled.",
      },
      forceNotActiveMessage: {
        required: false,
        description:
          "Message when force command is used but no balance is active.",
        default: "No team balancing is currently active.",
      },
      checkInterval: {
        required: false,
        description:
          "Interval in seconds for checking and swapping players after new game.",
        default: 5,
      },
      totalCheckTime: {
        required: false,
        description:
          "Total time in seconds to perform player swapping after new game.",
        default: 60,
      },
      updateSquadListInterval: {
        required: false,
        description:
          "Interval in minutes for updating squad list before game start.",
        default: 5,
      },
      swapWarningMessage: {
        required: false,
        description: "Message sent to players when they are swapped.",
        default:
          "You have been automatically swapped to balance the teams based on skill ratings.",
      },
      balanceCompleteMessage: {
        required: false,
        description: "Message sent to admins when balancing is complete.",
        default:
          "Balance completed\n| Swapped {swappedPlayers} players\n| Team 1: {team1Count} players (avg Elo: {team1Elo})\n| Team 2: {team2Count} players (avg Elo: {team2Elo})",
      },
      balanceFailedMessage: {
        required: false,
        description: "Message sent to admins if balancing fails.",
        default: "Balance operation failed! Check logs for details.",
      },
      resetDelayMinutes: {
        required: false,
        description: "Minutes after which the balancer flag will reset.",
        default: 3,
      },
      accessToken: {
        required: false,
        description: "MySquadStats API access token.",
        default: "",
      },
      baseEloRating: {
        required: false,
        description: "Default Elo rating for players without data.",
        default: 1500,
      },
      maxEloRatingDifference: {
        required: false,
        description:
          "Maximum acceptable difference in average Elo between teams.",
        default: 100,
      },
      fullShufflePercentage: {
        required: false,
        description:
          "Percentage of squads to move in full shuffle mode (30-50 recommended).",
        default: 40,
      },
      playerThreshold: {
        required: false,
        description: "Minimum players needed to perform skill-based balancing.",
        default: 20,
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
        default: 24,
      },
      playerListFile: {
        required: false,
        description: "File path for cached player data.",
        default: "./playerSkillData.json",
      },
      devLoggingMode: {
        required: false,
        description: "Enable detailed team composition logging at round end",
        default: false,
      },
      logFilePath: {
        required: false,
        description: "File path for dev mode logging.",
        default: "./balance_log.txt",
      },
      emergencyBalanceMessage: {
        required: false,
        description: "Message sent to players during emergency rebalancing.",
        default: "You have been swapped to balance teams (emergency rebalance)",
      },
    };
  }

  constructor(server, options, connectors) {
    super(server, options, connectors);

    this.active = false;
    this.mode = null;
    this.isScheduled = false;
    this.savedTeams = { Team1: {}, Team2: {}, Team0: {} };
    this.playerSkillData = {};
    this.apiCallComplete = false;
    this.apiCallInProgress = false;
    this.swappedPlayers = new Set();
    this.isCheckCommandRunning = false;
    this.emergencyBalanceAttempted = false;
    this.swapsCountTeam1 = 0;
    this.swapsCountTeam2 = 0;

    this.updateInterval = null;
    this.broadcastInterval = null;
    this.checkInterval = null;

    this.onBalanceCommand = this.onBalanceCommand.bind(this);
    this.onFullShuffleCommand = this.onFullShuffleCommand.bind(this);
    this.onStopCommand = this.onStopCommand.bind(this);
    this.onForceCommand = this.onForceCommand.bind(this);
    this.onNewGame = this.onNewGame.bind(this);
    this.onRoundEnd = this.onRoundEnd.bind(this);
    this.updateSquadList = this.updateSquadList.bind(this);
    this.onCheckCommand = this.onCheckCommand.bind(this);

    this.squadStatsUtils = new MySquadStatsUtils({
      apiRequestRetries: this.options.apiRequestRetries,
      apiRequestTimeout: this.options.apiRequestTimeout,
      cachePlayerData: this.options.cachePlayerData,
      cacheExpiry: this.options.cacheExpiry,
      accessToken: this.options.accessToken,
      fallbackSkillRating: this.options.baseEloRating,
      playerListFile: this.options.playerListFile,
      verboseLogging: this.options.devLoggingMode,
      logger: this,
    });

    this.balancerUtils = new SquadBalancerUtils({
      splitSquadsIfNeeded: false,
      maxSkillDifference: this.options.maxEloRatingDifference,
      fallbackSkillRating: this.options.baseEloRating,
      verboseLogging: this.options.devLoggingMode,
      logger: this,
    });
  }

  async mount() {
    this.active = false;
    this.server.randomiser = false;
    this.server.on(
      `CHAT_COMMAND:${this.options.checkCommand}`,
      this.onCheckCommand
    );
    for (const alias of this.options.checkCommandAliases) {
      this.server.on(`CHAT_COMMAND:${alias}`, this.onCheckCommand);
    }

    this.server.on(
      `CHAT_COMMAND:${this.options.balanceCommand}`,
      this.onBalanceCommand
    );
    for (const alias of this.options.balanceCommandAliases) {
      this.server.on(`CHAT_COMMAND:${alias}`, this.onBalanceCommand);
    }

    this.server.on(
      `CHAT_COMMAND:${this.options.fullShuffleCommand}`,
      this.onFullShuffleCommand
    );
    for (const alias of this.options.fullShuffleCommandAliases) {
      this.server.on(`CHAT_COMMAND:${alias}`, this.onFullShuffleCommand);
    }

    this.server.on(
      `CHAT_COMMAND:${this.options.stopCommand}`,
      this.onStopCommand
    );
    for (const alias of this.options.stopCommandAliases) {
      this.server.on(`CHAT_COMMAND:${alias}`, this.onStopCommand);
    }

    this.server.on(
      `CHAT_COMMAND:${this.options.forceCommand}`,
      this.onForceCommand
    );

    this.server.on("NEW_GAME", this.onNewGame);
    this.server.on("ROUND_ENDED", this.onRoundEnd);

    this.verbose(1, "SquadTeamBalancer plugin mounted");

    if (this.options.devLoggingMode) {
      this.logToFile("SquadTeamBalancer plugin mounted");
    }
  }

  async unmount() {
    this.server.randomiser = false;

    this.server.removeEventListener(
      `CHAT_COMMAND:${this.options.checkCommand}`,
      this.onCheckCommand
    );
    for (const alias of this.options.checkCommandAliases) {
      this.server.removeEventListener(
        `CHAT_COMMAND:${alias}`,
        this.onCheckCommand
      );
    }

    this.server.removeEventListener(
      `CHAT_COMMAND:${this.options.balanceCommand}`,
      this.onBalanceCommand
    );
    for (const alias of this.options.balanceCommandAliases) {
      this.server.removeEventListener(
        `CHAT_COMMAND:${alias}`,
        this.onBalanceCommand
      );
    }

    this.server.removeEventListener(
      `CHAT_COMMAND:${this.options.fullShuffleCommand}`,
      this.onFullShuffleCommand
    );
    for (const alias of this.options.fullShuffleCommandAliases) {
      this.server.removeEventListener(
        `CHAT_COMMAND:${alias}`,
        this.onFullShuffleCommand
      );
    }

    this.server.removeEventListener(
      `CHAT_COMMAND:${this.options.stopCommand}`,
      this.onStopCommand
    );
    for (const alias of this.options.stopCommandAliases) {
      this.server.removeEventListener(
        `CHAT_COMMAND:${alias}`,
        this.onStopCommand
      );
    }

    this.server.removeEventListener(
      `CHAT_COMMAND:${this.options.forceCommand}`,
      this.onForceCommand
    );

    this.server.removeEventListener("NEW_GAME", this.onNewGame);
    this.server.removeEventListener("ROUND_ENDED", this.onRoundEnd);

    this.clearAllIntervals();

    this.verbose(1, "SquadTeamBalancer plugin unmounted");
  }

  async onBalanceCommand(info) {
    if (info.chat !== "ChatAdmin") return;

    if (this.isScheduled) {
      await this.warnPlayer(info.eosID, this.options.alreadyScheduledMessage);
      return;
    }

    this.verbose(1, "Balance command received, initializing minimal balance mode");

    await this.notifyAdmins(`Admin ${info.name} initiated balanced team shuffle (minimal changes mode). Operation started.`);

    this.mode = "balance";
    await this.startBalancing(this.options.startBalanceMessage);
  }

  async onFullShuffleCommand(info) {
    if (info.chat !== "ChatAdmin") return;

    if (this.isScheduled) {
      await this.warnPlayer(info.eosID, this.options.alreadyScheduledMessage);
      return;
    }

    this.verbose(1, "Full shuffle command received, initializing extensive shuffle mode");

    await this.notifyAdmins(`Admin ${info.name} initiated full team shuffle. Operation started.`);

    this.mode = "fullShuffle";
    await this.startBalancing(this.options.startFullShuffleMessage);
  }

  async startBalancing(message) {
    await this.updateSquadList();

    this.updateInterval = setInterval(
      () => this.updateSquadList(),
      this.options.updateSquadListInterval * 60000
    );

    await this.broadcast(message);

    if (this.options.enableIntervalBroadcast) {
      this.broadcastInterval = setInterval(
        () => this.broadcast(this.options.intervalMessage),
        this.options.intervalTime * 60000
      );
    }

    this.isScheduled = true;
    this.active = true;
    this.verbose(1, `Team balancing scheduled in "${this.mode}" mode`);
  }

  async onStopCommand(info) {
    if (info.chat !== "ChatAdmin") return;

    if (!this.isScheduled) {
      await this.warnPlayer(info.eosID, this.options.notScheduledMessage);
      return;
    }

    await this.notifyAdmins(`Admin ${info.name} cancelled the team balancing operation`);

    this.clearAllIntervals();
    this.savedTeams = { Team1: {}, Team2: {}, Team0: {} };
    this.isScheduled = false;
    this.active = false;
    this.mode = null;

    await this.broadcast(this.options.stopMessage);

    this.verbose(1, "Team balancing has been cancelled");
  }

  async onForceCommand(info) {
    if (info.chat !== "ChatAdmin") return;

    if (!this.active) {
      await this.warnPlayer(info.eosID, this.options.forceNotActiveMessage);
      return;
    }

    this.verbose(1, "Force command received, executing balancing immediately");
    await this.onNewGame();
  }

  async onCheckCommand(info) {
    if (info.chat !== "ChatAdmin") return;

    if (this.isCheckCommandRunning) {
      await this.warnPlayer(
        info.eosID,
        "Balance check already in progress. Please wait for the current check to complete."
      );
      return;
    }

    this.isCheckCommandRunning = true;
    this.verbose(1, "Check command received, fetching team skill data");

    try {
      await this.warnPlayer(info.eosID, this.options.checkingMessage);
      await this.notifyAdmins(`Admin ${info.name} requested a team balance check...`);

      const players = this.server.players.slice(0);
      const teams = this.organizeTeams(players);

      if (Object.keys(this.playerSkillData).length === 0) {
        try {
          this.verbose(1, "Fetching player skill data from API...");
          await this.notifyAdmins(`Fetching player skill data from API, please wait...`);

          const playersWithSteamIDs = players.filter(
            (player) => player.steamID
          );
          this.playerSkillData = await this.squadStatsUtils.fetchPlayersData(
            playersWithSteamIDs
          );

          this.verbose(1, `Retrieved skill data for ${Object.keys(this.playerSkillData).length} players`);
        } catch (error) {
          this.verbose(1, `Error fetching player skill data: ${error.message}`);
          await this.notifyAdmins(`Error fetching player skill data: ${error.message}`);
          this.isCheckCommandRunning = false;
          return;
        }
      }

      const squadSkillData = this.balancerUtils.calculateSquadSkillRatings(
        teams,
        this.playerSkillData
      );
      const teamSkills =
        this.balancerUtils.calculateTeamSkillRatings(squadSkillData);

      const team1Count = this.countPlayersInTeam(teams.Team1);
      const team2Count = this.countPlayersInTeam(teams.Team2);
      const team1Skill = teamSkills.Team1.avgSkill;
      const team2Skill = teamSkills.Team2.avgSkill;
      const skillDifference = Math.abs(team1Skill - team2Skill);

      let resultMessage = `Current Team Balance:\n`;
      resultMessage += `| Team 1: ${team1Count} players (avg Elo: ${team1Skill.toFixed(0)})\n`;
      resultMessage += `| Team 2: ${team2Count} players (avg Elo: ${team2Skill.toFixed(0)})\n`;
      resultMessage += `| ELO Difference: ${skillDifference.toFixed(0)}\n`;

      if (skillDifference <= this.options.maxEloRatingDifference) {
        resultMessage += `| Status: Teams are balanced (target: ${this.options.maxEloRatingDifference})`;
      } else {
        resultMessage += `| Status: Teams need balancing (${skillDifference.toFixed(
          0
        )} > ${this.options.maxEloRatingDifference})`;

        const higherTeam = team1Skill > team2Skill ? "Team 1" : "Team 2";
        resultMessage += `\n| ${higherTeam} has higher average skill`;
      }

      this.verbose(1, `BALANCE CHECK REPORT: ${resultMessage}`);

      if (this.options.devLoggingMode) {
        const timestamp = new Date().toISOString();
        const logEntry = `[${timestamp}] BALANCE CHECK REPORT:\n${resultMessage}\n\n`;
        fs.appendFileSync(this.options.logFilePath, logEntry);
      }

      await this.notifyAdmins(resultMessage);
      this.verbose(1, `Sent team balance check results to admin ${info.name}`);
    } catch (error) {
      this.verbose(1, `Error in check command: ${error.message}`);
      await this.notifyAdmins(`Error during balance check: ${error.message}`);
    } finally {
      this.isCheckCommandRunning = false;
    }
  }

  async updateSquadList() {
    const players = this.server.players.slice(0);

    if (this.options.devLoggingMode) {
      await this.logDetailedTeamInfo(this.organizeTeams(players));
    }

    this.savedTeams = this.organizeTeams(players);

    if (players.length >= this.options.playerThreshold) {
      try {
        this.verbose(1, "Fetching player skill data from API...");
        this.apiCallInProgress = true;

        const playersWithSteamIDs = players.filter((player) => player.steamID);

        this.playerSkillData = await this.squadStatsUtils.fetchPlayersData(
          playersWithSteamIDs
        );
        this.verbose(1, `Retrieved skill data for ${Object.keys(this.playerSkillData).length} players`);

        this.apiCallComplete = true;
        this.apiCallInProgress = false;

        if (this.options.cachePlayerData) {
          this.squadStatsUtils.savePlayerDatabase();
        }
      } catch (error) {
        this.apiCallInProgress = false;
        this.verbose(1, `Error fetching player skill data: ${error.message}`);

        if (
          this.isScheduled &&
          Object.keys(this.playerSkillData).length === 0
        ) {
          const errorMsg = `WARNING: API error when fetching player skill data: ${error.message}. Will use cached data if available or continue with basic balancing.`;
          await this.notifyAdmins(errorMsg);
        }
      }
    } else {
      this.verbose(1, `Not enough players (${players.length}) for skill balancing. Threshold is ${this.options.playerThreshold}`);
    }
  }

  async onRoundEnd(info) {
    const snapshotPlayers = this.server.players.slice(0);
    const snapshotTeams = this.organizeTeams(snapshotPlayers);

    if (this.options.devLoggingMode) {
      this.logToFile("ROUND ENDED");

      if (Object.keys(this.playerSkillData).length > 0) {
        await this.logDetailedTeamInfo(snapshotTeams, info);
      } else {
        this.logToFile(
          "Fetching player skill data from API to complete team info logging..."
        );

        try {
          const playersWithSteamIDs = snapshotPlayers.filter(
            (player) => player.steamID
          );
          this.playerSkillData = await this.squadStatsUtils.fetchPlayersData(
            playersWithSteamIDs
          );

          await this.logDetailedTeamInfo(snapshotTeams, info);
        } catch (error) {
          this.logToFile(`Failed to fetch player data: ${error.message}`);
          await this.logDetailedTeamInfo(snapshotTeams, info);
        }
      }
    }

    if (!this.active) {
      if (this.options.devLoggingMode) {
        this.logToFile("No team balancing active, skipping balancing");
      }
      return;
    }

    this.verbose(1, "Round ended, scheduling team balancing...");

    if (this.executionTimer) {
      clearTimeout(this.executionTimer);
    }

    this.executionTimer = setTimeout(async () => {
      this.verbose(1, `Executing team balancing in "${this.mode}" mode`);

      if (
        !this.apiCallComplete &&
        Object.keys(this.playerSkillData).length === 0
      ) {
        this.verbose(1, "Canceling balance operation - API data not available");
        await this.notifyAdmins("Team balancing canceled - API data not available");
        this.cleanupAfterBalancing();
        return;
      }

      this.swappedPlayers = new Set();
      this.swapsCountTeam1 = 0;
      this.swapsCountTeam2 = 0;
      this.server.randomiser = true;

      setTimeout(() => {
        this.server.randomiser = false;
        this.verbose(1, "Randomiser flag has been reset to false");
      }, this.options.resetDelayMinutes * 60000);

      const team1HasPlayers = Object.values(this.savedTeams.Team1).some((squad) => squad.length > 0);
      const team2HasPlayers = Object.values(this.savedTeams.Team2).some((squad) => squad.length > 0);

      if (!team1HasPlayers && !team2HasPlayers) {
        this.verbose(1, "No saved teams to balance");
        this.cleanupAfterBalancing();
        return;
      }

      clearInterval(this.updateInterval);
      clearInterval(this.broadcastInterval);

      let toSwapTeam1 = [];
      let toSwapTeam2 = [];

      try {
        if (this.mode === "balance") {
          const result = await this.calculateMinimalBalanceMoves();
          toSwapTeam1 = result.toSwapTeam1;
          toSwapTeam2 = result.toSwapTeam2;
        } else {
          const result = await this.calculateFullShuffleMoves();
          toSwapTeam1 = result.toSwapTeam1;
          toSwapTeam2 = result.toSwapTeam2;
        }

        if (this.options.devLoggingMode) {
          this.logBalancePlan(toSwapTeam1, toSwapTeam2);
        }

        const swapStartTime = Date.now();
        const maxSwapTime =
          this.options.maxExecutionTime * 1000 - (Date.now() - swapStartTime);

        await this.executeSwapsWithTimeLimit(
          toSwapTeam1,
          toSwapTeam2,
          maxSwapTime,
          info
        );
      } catch (error) {
        this.verbose(1, `Error during balancing: ${error.message}`);

        try {
          await this.notifyAdmins(this.options.balanceFailedMessage);
        } catch (notifyError) {
          this.verbose(1, `Error notifying admins: ${notifyError.message}`);
        }
      }

      this.cleanupAfterBalancing();
    }, this.options.minExecutionTime * 1000);
  }

  async onNewGame() {
    this.verbose(1, "New game started");
  }

  async executeSwapsWithTimeLimit(
    toSwapTeam1,
    toSwapTeam2,
    timeLimit,
    roundEndInfo = null
  ) {
    const swapStartTime = Date.now();
    let totalSwaps = 0;
    let failedSwaps = 0;
    const failedSwapPlayers = new Set();

    while (
      Date.now() - swapStartTime < timeLimit &&
      (toSwapTeam1.length > 0 || toSwapTeam2.length > 0)
    ) {
      try {
        const swapsTeam1 = await this.attemptSwaps(toSwapTeam1, "2");
        const swapsTeam2 = await this.attemptSwaps(toSwapTeam2, "1");

        this.swapsCountTeam1 += swapsTeam1;
        this.swapsCountTeam2 += swapsTeam2;
        totalSwaps += swapsTeam1 + swapsTeam2;

        if (toSwapTeam1.length === 0 && toSwapTeam2.length === 0) {
          break;
        }

        if (toSwapTeam1.length > 0 || toSwapTeam2.length > 0) {
          const currentPlayers = this.server.players.slice(0);

          for (let i = 0; i < toSwapTeam1.length; i++) {
            const player = toSwapTeam1[i];
            const serverPlayer = currentPlayers.find(
              (p) => p.eosID === player.eosID
            );

            if (!serverPlayer) {
              toSwapTeam1.splice(i, 1);
              i--;
              continue;
            }

            if (serverPlayer.teamID === "2") {
              toSwapTeam1.splice(i, 1);
              i--;
              continue;
            }

            if (failedSwapPlayers.has(player.eosID)) {
              failedSwaps++;
              toSwapTeam1.splice(i, 1);
              i--;
              continue;
            }

            failedSwapPlayers.add(player.eosID);
          }

          for (let i = 0; i < toSwapTeam2.length; i++) {
            const player = toSwapTeam2[i];
            const serverPlayer = currentPlayers.find(
              (p) => p.eosID === player.eosID
            );

            if (!serverPlayer) {
              toSwapTeam2.splice(i, 1);
              i--;
              continue;
            }

            if (serverPlayer.teamID === "1") {
              toSwapTeam2.splice(i, 1);
              i--;
              continue;
            }

            if (failedSwapPlayers.has(player.eosID)) {
              failedSwaps++;
              toSwapTeam2.splice(i, 1);
              i--;
              continue;
            }

            failedSwapPlayers.add(player.eosID);
          }
        }

        await new Promise((resolve) => setTimeout(resolve, 500));
      } catch (error) {
        this.verbose(1, `Error during swap execution: ${error.message}`);
      }
    }

    failedSwaps += toSwapTeam1.length + toSwapTeam2.length;

    const players = this.server.players.slice(0);
    this.savedTeams = this.organizeTeams(players);

    const team1Count = this.countPlayersInTeam(this.savedTeams.Team1);
    const team2Count = this.countPlayersInTeam(this.savedTeams.Team2);

    let team1Elo = "N/A";
    let team2Elo = "N/A";
    let eloDifference = 0;
    let balanceReason = "";

    if (Object.keys(this.playerSkillData).length > 0) {
      const squadSkillData = this.balancerUtils.calculateSquadSkillRatings(
        this.savedTeams,
        this.playerSkillData
      );
      const teamSkills =
        this.balancerUtils.calculateTeamSkillRatings(squadSkillData);
      team1Elo = teamSkills.Team1.avgSkill.toFixed(0);
      team2Elo = teamSkills.Team2.avgSkill.toFixed(0);
      eloDifference = Math.abs(parseFloat(team1Elo) - parseFloat(team2Elo));

      if (
        eloDifference > this.options.maxEloRatingDifference &&
        !this.emergencyBalanceAttempted
      ) {
        this.verbose(1, "Standard balancing insufficient, attempting to move unassigned players");
        this.emergencyBalanceAttempted = true;

        setTimeout(() => {
          this.emergencyBalanceAttempted = false;
        }, 5 * 60 * 1000);

        const unassignedSwaps = this.identifyUnassignedPlayersForBalance(
          squadSkillData,
          teamSkills
        );

        if (
          unassignedSwaps.toSwapTeam1.length > 0 ||
          unassignedSwaps.toSwapTeam2.length > 0
        ) {
          this.verbose(1, `Found ${unassignedSwaps.toSwapTeam1.length + unassignedSwaps.toSwapTeam2.length} unassigned players to move`);

          const remainingTime = timeLimit - (Date.now() - swapStartTime);
          if (remainingTime > 0) {
            const additionalSwapsTeam1 = await this.attemptSwaps(
              unassignedSwaps.toSwapTeam1,
              "2",
              this.options.emergencyBalanceMessage
            );
            const additionalSwapsTeam2 = await this.attemptSwaps(
              unassignedSwaps.toSwapTeam2,
              "1",
              this.options.emergencyBalanceMessage
            );

            this.swapsCountTeam1 += additionalSwapsTeam1;
            this.swapsCountTeam2 += additionalSwapsTeam2;
            totalSwaps += additionalSwapsTeam1 + additionalSwapsTeam2;

            const updatedPlayers = this.server.players.slice(0);
            this.savedTeams = this.organizeTeams(updatedPlayers);

            const updatedSquadSkillData =
              this.balancerUtils.calculateSquadSkillRatings(
                this.savedTeams,
                this.playerSkillData
              );
            const updatedTeamSkills =
              this.balancerUtils.calculateTeamSkillRatings(
                updatedSquadSkillData
              );

            team1Elo = updatedTeamSkills.Team1.avgSkill.toFixed(0);
            team2Elo = updatedTeamSkills.Team2.avgSkill.toFixed(0);
            eloDifference = Math.abs(
              parseFloat(team1Elo) - parseFloat(team2Elo)
            );

            if (eloDifference <= this.options.maxEloRatingDifference) {
              balanceReason =
                "Balance achieved after moving unassigned players";
            } else {
              balanceReason =
                "Balance improved with unassigned players, but still above threshold";
            }
          } else {
            balanceReason =
              "Time limit reached before attempting emergency balance";
          }
        } else {
          this.verbose(1, "No suitable unassigned players found for additional balancing");
        }
      }

      if (
        eloDifference > this.options.maxEloRatingDifference &&
        !balanceReason
      ) {
        if (Date.now() - swapStartTime >= timeLimit) {
          balanceReason =
            "Issue: Time limit reached before optimal balance could be achieved";
        } else if (failedSwaps > 0) {
          balanceReason = `Issue: ${failedSwaps} players could not be swapped due to game restrictions`;
        } else {
          balanceReason =
            "Issue: Unable to balance further while keeping squads together";
        }
      }
    }

    let completeMessage = this.options.balanceCompleteMessage
      .replace("{swappedPlayers}", totalSwaps)
      .replace("{team1Count}", team1Count)
      .replace("{team2Count}", team2Count)
      .replace("{team1Elo}", team1Elo)
      .replace("{team2Elo}", team2Elo);

    if (balanceReason) {
      completeMessage += `\n| ELO Difference: ${eloDifference.toFixed(
        0
      )} (Target: ${this.options.maxEloRatingDifference})`;
      completeMessage += `\n| ${balanceReason}`;
    }

    if (failedSwaps > 0) {
      completeMessage += `\n| Failed swaps: ${failedSwaps} players`;
    }

    this.verbose(1, `BALANCE REPORT: ${completeMessage}`);

    if (this.options.devLoggingMode) {
      const timestamp = new Date().toISOString();
      const logEntry = `[${timestamp}] BALANCE REPORT:\n${completeMessage}\n\n`;
      fs.appendFileSync(this.options.logFilePath, logEntry);

      this.logToFile(
        `TEAM BALANCING COMPLETED: Swapped ${totalSwaps} players (${this.swapsCountTeam1} from Team1, ${this.swapsCountTeam2} from Team2)`
      );
      await this.logDetailedTeamInfo(this.savedTeams, roundEndInfo);
    }

    await this.notifyAdmins(completeMessage);

    return totalSwaps;
  }

  cleanupAfterBalancing() {
    this.clearAllIntervals();
    this.savedTeams = { Team1: {}, Team2: {}, Team0: {} };
    this.isScheduled = false;
    this.active = false;
    this.mode = null;
  }

  async calculateMinimalBalanceMoves() {
    this.verbose(1, "Calculating minimal balance moves");

    if (Object.keys(this.playerSkillData).length > 0) {
      const squadSkillData = this.balancerUtils.calculateSquadSkillRatings(
        this.savedTeams,
        this.playerSkillData
      );

      const teamSkills =
        this.balancerUtils.calculateTeamSkillRatings(squadSkillData);
      const skill1 = teamSkills.Team1.avgSkill;
      const skill2 = teamSkills.Team2.avgSkill;
      const difference = Math.abs(skill1 - skill2);

      this.verbose(1, `Initial skill difference: ${difference.toFixed(2)} (Team1: ${skill1.toFixed(2)}, Team2: ${skill2.toFixed(2)})`);

      if (difference <= this.options.maxEloRatingDifference) {
        this.verbose(1, `Teams already balanced within threshold (${this.options.maxEloRatingDifference})`);
        return { toSwapTeam1: [], toSwapTeam2: [] };
      }

      const balancingPlan =
        this.balancerUtils.createBalancingPlan(squadSkillData);

      return this.convertPlanToSwapLists(balancingPlan);
    } else {
      this.verbose(1, "No skill data available, using basic balancing");
      return this.calculateBasicBalanceMoves();
    }
  }

  async calculateFullShuffleMoves() {
    this.verbose(1, "Calculating full shuffle moves");

    const team1Squads = this.getAllSquads(this.savedTeams.Team1);
    const team2Squads = this.getAllSquads(this.savedTeams.Team2);

    const team1SwapCount = Math.ceil(
      team1Squads.length * (this.options.fullShufflePercentage / 100)
    );
    const team2SwapCount = Math.ceil(
      team2Squads.length * (this.options.fullShufflePercentage / 100)
    );

    const team1SwapSquads = this.getRandomSquads(team1Squads, team1SwapCount);
    const team2SwapSquads = this.getRandomSquads(team2Squads, team2SwapCount);

    const toSwapTeam1 = this.flattenSquads(team1SwapSquads);
    const toSwapTeam2 = this.flattenSquads(team2SwapSquads);

    this.verbose(1, `Selected ${toSwapTeam1.length} players from Team1 and ${toSwapTeam2.length} players from Team2 for full shuffle`);

    return { toSwapTeam1, toSwapTeam2 };
  }

  async attemptSwaps(playersToSwap, targetTeamID, customMessage = null) {
    const players = this.server.players.slice(0);
    let swaps = 0;

    for (let i = 0; i < playersToSwap.length; i++) {
      const player = playersToSwap[i];
      const serverPlayer = players.find((p) => p.eosID === player.eosID);

      if (!serverPlayer) {
        continue;
      }

      if (serverPlayer.teamID === targetTeamID) {
        playersToSwap.splice(i, 1);
        i--;
        continue;
      }

      this.verbose(1, `Swapping player ${player.name} to team ${targetTeamID}`);

      try {
        await this.server.rcon.switchTeam(player.eosID);
        await this.warnPlayer(
          player.eosID,
          customMessage || this.options.swapWarningMessage
        );
        this.swappedPlayers.add(player.eosID);

        swaps++;

        playersToSwap.splice(i, 1);
        i--;
      } catch (error) {
        this.verbose(1, `Failed to swap player ${player.name}: ${error.message}`);
      }
    }

    return swaps;
  }

  organizeTeams(players) {
    const teams = {
      Team1: {},
      Team2: {},
      Team0: {},
    };

    for (const player of players) {
      const teamName = `Team${player.teamID}`;
      if (!teams[teamName]) continue;

      if (!teams[teamName][player.squadID]) {
        teams[teamName][player.squadID] = [];
      }

      teams[teamName][player.squadID].push({
        name: player.name,
        eosID: player.eosID,
        steamID: player.steamID,
        teamID: player.teamID,
        squadID: player.squadID,
        isLeader: player.isLeader || false,
      });
    }

    return teams;
  }

  clearAllIntervals() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }

    if (this.broadcastInterval) {
      clearInterval(this.broadcastInterval);
      this.broadcastInterval = null;
    }

    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }

    if (this.executionTimer) {
      clearTimeout(this.executionTimer);
      this.executionTimer = null;
    }
  }

  getAllSquads(team) {
    return Object.values(team).filter((squad) => squad && squad.length > 0);
  }

  flattenSquads(squads) {
    if (Array.isArray(squads)) {
      return squads.reduce((acc, squad) => acc.concat(squad), []);
    }

    return Object.values(squads).reduce((acc, squad) => acc.concat(squad), []);
  }

  getRandomSquads(squads, count) {
    const shuffled = [...squads];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled.slice(0, Math.min(count, shuffled.length));
  }

  countPlayersInTeam(team) {
    let count = 0;
    for (const squadID in team) {
      count += team[squadID].length;
    }
    return count;
  }

  calculateBasicBalanceMoves() {
    const team1Count = this.countPlayersInTeam(this.savedTeams.Team1);
    const team2Count = this.countPlayersInTeam(this.savedTeams.Team2);
    const difference = Math.abs(team1Count - team2Count);

    if (difference <= 2) {
      return { toSwapTeam1: [], toSwapTeam2: [] };
    }

    const largerTeam = team1Count > team2Count ? "Team1" : "Team2";
    const smallerTeam = largerTeam === "Team1" ? "Team2" : "Team1";

    const playersToMove = Math.floor(difference / 2);

    const squads = Object.values(this.savedTeams[largerTeam])
      .filter((squad) => squad && squad.length > 0)
      .sort((a, b) => a.length - b.length);

    const playersToSwap = [];
    let currentCount = 0;

    for (const squad of squads) {
      if (currentCount + squad.length <= playersToMove) {
        playersToSwap.push(...squad);
        currentCount += squad.length;
      }

      if (currentCount >= playersToMove) break;
    }

    if (currentCount < playersToMove) {
      for (const squad of squads.sort((a, b) => b.length - a.length)) {
        for (const player of squad) {
          if (!playersToSwap.includes(player)) {
            playersToSwap.push(player);
            currentCount++;

            if (currentCount >= playersToMove) break;
          }
        }

        if (currentCount >= playersToMove) break;
      }
    }

    if (largerTeam === "Team1") {
      return { toSwapTeam1: playersToSwap, toSwapTeam2: [] };
    } else {
      return { toSwapTeam1: [], toSwapTeam2: playersToSwap };
    }
  }

  convertPlanToSwapLists(balancingPlan) {
    const toSwapTeam1 = [];
    const toSwapTeam2 = [];

    const team1Count = this.countPlayersInTeam(this.savedTeams.Team1);
    const team2Count = this.countPlayersInTeam(this.savedTeams.Team2);
    let currentDifference = team1Count - team2Count;

    for (const move of balancingPlan.squadMoves) {
      if (move.sourceTeam === "Team1" && move.targetTeam === "Team2") {
        const squadToMove = this.savedTeams.Team1[move.squadID] || [];

        const newDifference = currentDifference - squadToMove.length;
        if (Math.abs(newDifference) > 4) {
          this.verbose(1, `Skipping move of squad ${move.squadID} as it would create team size imbalance of ${Math.abs(newDifference)}`);
          continue;
        }

        toSwapTeam1.push(...squadToMove);
        currentDifference -= squadToMove.length;
      } else if (move.sourceTeam === "Team2" && move.targetTeam === "Team1") {
        const squadToMove = this.savedTeams.Team2[move.squadID] || [];

        const newDifference = currentDifference + squadToMove.length;
        if (Math.abs(newDifference) > 4) {
          this.verbose(1, `Skipping move of squad ${move.squadID} as it would create team size imbalance of ${Math.abs(newDifference)}`);
          continue;
        }

        toSwapTeam2.push(...squadToMove);
        currentDifference += squadToMove.length;
      }
    }

    if (balancingPlan.playerMoves) {
      for (const move of balancingPlan.playerMoves) {
        if (move.sourceTeam === "Team1" && move.targetTeam === "Team2") {
          const player = this.findPlayerInTeam(
            this.savedTeams.Team1,
            move.playerID
          );

          if (player) {
            const newDifference = currentDifference - 1;
            if (Math.abs(newDifference) > 4) {
              this.verbose(1, `Skipping move of player ${player.name} as it would create team size imbalance`);
              continue;
            }

            toSwapTeam1.push(player);
            currentDifference -= 1;
          }
        } else if (move.sourceTeam === "Team2" && move.targetTeam === "Team1") {
          const player = this.findPlayerInTeam(
            this.savedTeams.Team2,
            move.playerID
          );

          if (player) {
            const newDifference = currentDifference + 1;
            if (Math.abs(newDifference) > 4) {
              this.verbose(1, `Skipping move of player ${player.name} as it would create team size imbalance`);
              continue;
            }

            toSwapTeam2.push(player);
            currentDifference += 1;
          }
        }
      }
    }

    return { toSwapTeam1, toSwapTeam2 };
  }

  findPlayerInTeam(team, playerID) {
    for (const squadID in team) {
      const player = team[squadID].find(
        (p) => p.steamID === playerID || p.eosID === playerID
      );
      if (player) return player;
    }
    return null;
  }

  async broadcast(message) {
    await this.server.rcon.broadcast(message);
  }

  async warnPlayer(eosID, message) {
    await this.server.rcon.warn(eosID, message);
  }

  async notifyAdmins(message) {
    try {
      if (!this.options.adminNotificationsEnabled) {
        return;
      }

      const admins = await this.server.getAdminsWithPermission(
        "canseeadminchat"
      );

      for (const player of this.server.players) {
        if (admins.includes(player.steamID)) {
          await this.server.rcon.warn(player.eosID, message);
        }
      }
    } catch (error) {
      this.verbose(1, `Failed to notify admins: ${error.message}`);
    }
  }

  async logDetailedTeamInfo(teams, roundEndInfo = null) {
    if (!this.options.devLoggingMode) return;

    let logMessage = "DETAILED TEAM INFO:\n";

    const squadSkillData =
      Object.keys(this.playerSkillData).length > 0
        ? this.balancerUtils.calculateSquadSkillRatings(
            teams,
            this.playerSkillData
          )
        : null;

    const teamSkills = squadSkillData
      ? this.balancerUtils.calculateTeamSkillRatings(squadSkillData)
      : null;

    for (const teamName of ["Team1", "Team2"]) {
      const teamNum = teamName === "Team1" ? 1 : 2;
      const teamCount = this.countPlayersInTeam(teams[teamName]);
      const teamAvgElo = teamSkills
        ? teamSkills[teamName].avgSkill.toFixed(0)
        : "N/A";

      let ticketString = "";
      if (roundEndInfo) {
        if (roundEndInfo.winner && roundEndInfo.loser) {
          const isWinner = roundEndInfo.winner.team === teamNum.toString();
          const tickets = isWinner
            ? roundEndInfo.winner.tickets
            : roundEndInfo.loser.tickets;
          ticketString = ` | Tickets: ${tickets} | ${isWinner ? "WINNER" : "LOSER"}`;
        }
      }

      logMessage += `\n${teamName}: ${teamCount} players | Avg Elo: ${teamAvgElo}${ticketString}\n`;
      logMessage += "─".repeat(50) + "\n";

      let unassignedCount = 0;
      if (teams[teamName]["null"]) {
        unassignedCount = teams[teamName]["null"].length;
      }

      for (const squadID in teams[teamName]) {
        if (squadID === "null") continue;

        const squad = teams[teamName][squadID];
        if (!squad || squad.length === 0) continue;

        const squadAvgElo =
          squadSkillData && squadSkillData[teamName][squadID]
            ? squadSkillData[teamName][squadID].avgSkill.toFixed(0)
            : "N/A";

        const squadLeader = squad.find((p) => p.isLeader === true) || squad[0];
        const leaderName = squadLeader ? squadLeader.name : "No Leader";

        logMessage += `  Squad ${squadID} | ${squad.length} players | Avg Elo: ${squadAvgElo} | Leader: ${leaderName}\n`;

        for (const player of squad) {
          const playerElo =
            this.playerSkillData[player.steamID]?.skillRating ||
            this.options.baseEloRating;
          const leaderMark = player.isLeader ? " (SL)" : "";
          logMessage += `    - ${player.name}${leaderMark}: ${playerElo} Elo\n`;
        }
      }

      if (unassignedCount > 0) {
        const unassignedAvgElo =
          squadSkillData && squadSkillData[teamName]["null"]
            ? squadSkillData[teamName]["null"].avgSkill.toFixed(0)
            : "N/A";

        logMessage += `  Unassigned: ${unassignedCount} players | Avg Elo: ${unassignedAvgElo}\n`;
      }
    }

    this.logToFile(logMessage);
  }

  logBalancePlan(toSwapTeam1, toSwapTeam2) {
    if (!this.options.devLoggingMode) return;

    let logMessage = "BALANCE PLAN:\n";

    if (toSwapTeam1.length > 0) {
      logMessage += "Players to move from Team1 to Team2:\n";
      for (const player of toSwapTeam1) {
        const skill =
          this.playerSkillData[player.steamID]?.skillRating ||
          this.options.baseEloRating;
        logMessage += `  ${player.name} (Elo: ${skill})\n`;
      }
    }

    if (toSwapTeam2.length > 0) {
      logMessage += "Players to move from Team2 to Team1:\n";
      for (const player of toSwapTeam2) {
        const skill =
          this.playerSkillData[player.steamID]?.skillRating ||
          this.options.baseEloRating;
        logMessage += `  ${player.name} (Elo: ${skill})\n`;
      }
    }

    this.logToFile(logMessage);
  }

  identifyUnassignedPlayersForBalance(squadSkillData, teamSkills) {
    const higherSkillTeam =
      teamSkills.Team1.avgSkill > teamSkills.Team2.avgSkill ? "Team1" : "Team2";
    const lowerSkillTeam = higherSkillTeam === "Team1" ? "Team2" : "Team1";

    const team1Count = this.countPlayersInTeam(this.savedTeams.Team1);
    const team2Count = this.countPlayersInTeam(this.savedTeams.Team2);
    const currentDifference = Math.abs(team1Count - team2Count);

    const unassignedPlayers = this.savedTeams[higherSkillTeam]["null"] || [];

    if (!unassignedPlayers || unassignedPlayers.length === 0) {
      return { toSwapTeam1: [], toSwapTeam2: [] };
    }

    const eligiblePlayers = unassignedPlayers.filter(
      (player) => !this.swappedPlayers.has(player.eosID)
    );

    if (eligiblePlayers.length === 0) {
      this.verbose(1, "No eligible unassigned players found (all were already swapped)");
      return { toSwapTeam1: [], toSwapTeam2: [] };
    }

    let maxMovableCount = 0;
    if (higherSkillTeam === "Team1") {
      const newDifference = team1Count - team2Count - 2;
      maxMovableCount = Math.max(0, (team1Count - team2Count - 4) / 2);
    } else {
      const newDifference = team1Count - team2Count + 2;
      maxMovableCount = Math.max(0, (team2Count - team1Count - 4) / 2);
    }

    maxMovableCount = Math.floor(maxMovableCount);

    maxMovableCount = Math.min(maxMovableCount, eligiblePlayers.length);

    if (maxMovableCount <= 0) {
      this.verbose(1, `Cannot move unassigned players - would exceed max team size difference of 4`);
      return { toSwapTeam1: [], toSwapTeam2: [] };
    }

    eligiblePlayers.sort((a, b) => {
      const skillA =
        this.playerSkillData[a.steamID]?.skillRating ||
        this.options.baseEloRating;
      const skillB =
        this.playerSkillData[b.steamID]?.skillRating ||
        this.options.baseEloRating;
      return skillB - skillA;
    });

    const playersToMove = eligiblePlayers.slice(0, maxMovableCount);

    this.verbose(1, `Selected ${playersToMove.length} unassigned players to move from ${higherSkillTeam} to ${lowerSkillTeam}`);

    if (higherSkillTeam === "Team1") {
      return { toSwapTeam1: playersToMove, toSwapTeam2: [] };
    } else {
      return { toSwapTeam1: [], toSwapTeam2: playersToMove };
    }
  }

logToFile(message) {
  if (!this.options.devLoggingMode) return;

  try {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] ${message}\n\n`;

    const directory = path.dirname(this.options.logFilePath);
    
    if (!fs.existsSync(directory)) {
      fs.mkdirSync(directory, { recursive: true });
    }

    fs.appendFileSync(this.options.logFilePath, logEntry);
  } catch (error) {
    this.verbose(1, `Error writing to log file: ${error.message}`);
  }
}
}
