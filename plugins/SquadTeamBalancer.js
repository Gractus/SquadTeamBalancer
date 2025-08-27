import BasePlugin from "./base-plugin.js";
import MySquadStatsUtils from "../utils/mysquadstats-utils.js";
import { LogisticRegressionRater, playersToSquadSteamIDArrays, calculateTargetTeams, swapToTargetTeams } from "../utils/squad-balancer-utils.js";

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
      balanceModeCommand: {
        required: false,
        description: "Change team balance mode.",
        default: "balancemode",
      },
      checkCommand: {
        required: false,
        description:
          "Check balance status using current balancing mode.",
        default: "balancecheck",
      },
      checkCommandAliases: {
        required: false,
        description: "Alternative commands for checking team balance.",
        default: ["rcheck", "randomcheck"],
      },
      stopCommand: {
        required: false,
        description: "Stop in-progress shuffle.",
        default: "balancestop",
      },
      stopCommandAliases: {
        required: false,
        description: "Alternative commands to stop shuffling.",
        default: ["rstop", "randomstop"],
      },
      forceCommand: {
        required: false,
        description:
          "Immediately balance active match.",
        default: "balanceforce",
      },
      autoBalanceThreshold: {
        required: false,
        description:
          "Trigger threshold for auto balance, value is probability of one side winning e.g. 75%.",
        default: 0.75,
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
      playerThreshold: {
        required: false,
        description: "Minimum players needed to perform skill-based balancing.",
        default: 20,
      },
      accessToken: {
        required: false,
        description: "MySquadStats API access token.",
        default: "",
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
      statsDatabaseFile: {
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
      checkingMessage: {
        required: false,
        description: "Message sent to admin when checking team ELO ratings.",
        default: "Fetching current ELO ratings for teams...",
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
      emergencyBalanceMessage: {
        required: false,
        description: "Message sent to players during emergency rebalancing.",
        default: "You have been swapped to balance teams (emergency rebalance)",
      },
    };
  }

  constructor(server, options, connectors) {
    super(server, options, connectors);

    this.shuffleInProgress = false;
    this.mode = null;
    this.savedTeams = { Team1: {}, Team2: {}, Team0: {} };
    this.playerSkillData = {};
    this.swappedPlayers = new Set();
    this.swapsCountTeam1 = 0;
    this.swapsCountTeam2 = 0;

    this.updateInterval = null;
    this.broadcastInterval = null;
    this.checkInterval = null;

    this.onBalanceCommand = this.onBalanceModeCommand.bind(this);
    this.onFullShuffleCommand = this.onFullShuffleCommand.bind(this);
    this.onStopCommand = this.onStopCommand.bind(this);
    this.onForceCommand = this.onForceCommand.bind(this);
    this.onNewGame = this.onNewGame.bind(this);
    this.onRoundEnd = this.onRoundEnd.bind(this);
    this.onPlayerConnect = this.onPlayerConnect.bind(this);
    this.updateSquadList = this.updateSquadList.bind(this);
    this.onCheckCommand = this.onCheckCommand.bind(this);

    this.squadStatsUtils = new MySquadStatsUtils({
      apiRequestRetries: this.options.apiRequestRetries,
      apiRequestTimeout: this.options.apiRequestTimeout,
      cachePlayerData: this.options.cachePlayerData,
      cacheExpiry: this.options.cacheExpiry,
      accessToken: this.options.accessToken,
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

    this.balancingModes = {
      "squads": {
        description: "Minimal moves, keeping squads together.",
        aliases: ["squads", "squad"],
      },
      "players": {
        description: "Minimal moves, ignoring squads.",
        aliases: ["players", "player"],
      },
      "squadsFull": {
        description: "Full balance, keeping squads together.",
        aliases: ["squadsfull", "squadfull", "fullsquads", "fullsquad"],
      },
      "playersFull": {
        description: "Full balance, maximum balancing.",
        aliases: ["playersfull", "playerfull", "fullplayers", "fullplayer"],
      },
    };
  }

  async mount() {
    this.shuffleInProgress = false;
    this.server.randomiser = false;
    this.server.on(`CHAT_COMMAND:${this.options.checkCommand}`, this.onCheckCommand);
    for (const alias of this.options.checkCommandAliases) {
      this.server.on(`CHAT_COMMAND:${alias}`, this.onCheckCommand);
    }

    this.server.on(`CHAT_COMMAND:${this.options.balanceModeCommand}`, this.onBalanceModeCommand);

    this.server.on(`CHAT_COMMAND:${this.options.stopCommand}`, this.onStopCommand);
    for (const alias of this.options.stopCommandAliases) {
      this.server.on(`CHAT_COMMAND:${alias}`, this.onStopCommand);
    }

    this.server.on(`CHAT_COMMAND:${this.options.forceCommand}`, this.onForceCommand);

    this.server.on("NEW_GAME", this.onNewGame);
    this.server.on("ROUND_ENDED", this.onRoundEnd);
    this.server.on("PLAYER_CONNECTED", this.onPlayerConnect);

    this.verbose(1, "SquadTeamBalancer plugin mounted");

    if (this.options.devLoggingMode) {
      this.logToFile("SquadTeamBalancer plugin mounted");
    }
  }

  async unmount() {
    this.server.randomiser = false;

    this.server.removeEventListener(`CHAT_COMMAND:${this.options.checkCommand}`, this.onCheckCommand);
    for (const alias of this.options.checkCommandAliases) {
      this.server.removeEventListener(`CHAT_COMMAND:${alias}`, this.onCheckCommand);
    }

    this.server.removeEventListener(`CHAT_COMMAND:${this.options.balanceModeCommand}`, this.onBalanceModeCommand);

    this.server.removeEventListener(`CHAT_COMMAND:${this.options.stopCommand}`, this.onStopCommand);
    for (const alias of this.options.stopCommandAliases) {
      this.server.removeEventListener(`CHAT_COMMAND:${alias}`, this.onStopCommand);
    }

    this.server.removeEventListener(`CHAT_COMMAND:${this.options.forceCommand}`, this.onForceCommand);

    this.server.removeEventListener("NEW_GAME", this.onNewGame);
    this.server.removeEventListener("ROUND_ENDED", this.onRoundEnd);
    this.server.removeEventListener("PLAYER_CONNECTED", this.onPlayerConnect);

    this.clearAllIntervals();

    this.verbose(1, "SquadTeamBalancer plugin unmounted");
  }

  async onBalanceModeCommand(info) {
    if (info.chat !== "ChatAdmin") return;

    const message = String().toLowerCase(info.message);
    let newMode = null;

    switch (true) {
      case message in this.balancingModes.squads.aliases:
        newMode = "squads";
        break;
      case message in this.balancingModes.players.aliases:
        newMode = "players";
        break;
      case message in this.balancingModes.squadsFull.aliases:
        newMode = "squadsFull";
        break;
      case message in this.balancingModes.playersFull.aliases:
        newMode = "playersFull";
        break;
      default:
        this.verbose(1, `Balance mode command recieved, invalid option ${info.message}`);
        this.warnPlayer(info.player.eosID, "Must use squads, players, squadsFull, playersFull");
        return
    }

    if (newMode === this.mode) {
      this.verbose(1, `Balance mode command recieved, but mode is already set to "${this.mode}".`);
      this.warnPlayer(info.player.eosID, `Mode is already set to "${this.mode}"`);
      return
    }

    this.mode = newMode;

    this.verbose(1, `Balance mode command recieved, mode changed to "${this.mode}"`);
    await this.notifyAdmins(`Admin ${info.name} changed balancing mode to "${this.mode}"`);
  }

  async onCheckCommand(info) {
    if (info.chat !== "ChatAdmin") return;

    const players = this.server.players.slice(0);
    const playerData = await this.squadStatsUtils.fetchPlayersData(players);
    const rater = this.squadStatsUtils.LogisticRegressionRater(playerData);
    const team1 = players.filter(player => player.teamID == 1);
    const team2 = players.filter(player => player.teamID == 2);
    const winProbability = rater.winProbability(team1, team2);

    await this.notifyAdmins(`Admin ${info.name} requested balance. Team1: ${winProbability.toFixed(2)}, Team2: ${(1 - winProbability).toFixed(2)}`);
  }

  async onForceCommand(info) {
    if (info.chat !== "ChatAdmin") return;

    const players = this.server.players.slice(0);
    if (players.length < this.options.playerThreshold) {
      this.warnPlayer(info.player.eosID, `Not enough players (${players.length}) for skill balancing. Threshold is ${this.options.playerThreshold}`);
      return
    }
    this.startBalance();
  }

  async onRoundEnd() {
    const players = this.server.players.slice(0);
    this.savedTeams = this.organizeTeams(players);

    this.squadStatsUtils.clearRefreshQueue();
    const winProbability = this.balancerUtils.calculateWinProbability();
  }

  async onPlayerConnect(data) {
    // this.squadStatsUtils.queuePlayerRefresh(data.steamID)
    this.squadStatsUtils.fetchPlayerData(data.steamID)
  }

  async onNewGame() {
    this.verbose(1, "New game started");
  }

  clearAllIntervals() {
    if (this.broadcastInterval) {
      clearInterval(this.broadcastInterval);
      this.broadcastInterval = null;
    }

    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  async startBalance() {
    if (this.balanceInProgress) {
      throw new Error("A balance is already in progress.")
    }
    this.balanceInProgress = true;
    await this.server.updatePlayerList();
    let players = this.server.players.slice(0);
    let playerStats = this.squadStatsUtils.getPlayerStats(players);
    let rater = new LogisticRegressionRater(playerStats);
    let squads = playersToSquadSteamIDArrays(players);
    const { team1, team2 } = calculateTargetTeams(rater, players, squads = [], clans = [], threshold = 0, minMoves = false);
    await swapToTargetTeams(server, team1, team2);
    this.balanceInProgress = true;
  }

  /** Broadcast message in game. Appears as large yellow text top middle of the screen. */
  async broadcast(message) {
    await this.server.rcon.broadcast(message);
  }

  /** Send ingame notification to specific player. */
  async warnPlayer(eosID, message) {
    await this.server.rcon.warn(eosID, message);
  }

  /** Send ingame notification to all admins in server. */
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
}
