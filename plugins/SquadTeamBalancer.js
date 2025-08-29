import BasePlugin from "./base-plugin.js";
import { LogisticRegressionRater, RandomRater, Balancer, shouldBalance, playersToSquadSteamIDArrays, swapToTargetTeams } from "../utils/squad-balancer-utils.js";

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
      checkCommand: {
        required: false,
        description:
          "Check balance status using current balancing mode.",
        default: "balancecheck",
      },
      forceBalanceCommand: {
        required: false,
        description:
          "Command to immediately balance active match.",
        default: "forcebalance",
      },
      autoBalanceToggleCommand: {
        required: false,
        description:
          "Command to toggle auto-balance on/off.",
        default: "autobalance",
      },
      squadsToggleCommand: {
        required: false,
        description:
          "Command to toggle squad preservation on/off.",
        default: "keepsquads",
      },
      clansToggleCommand: {
        required: false,
        description:
          "Command to toggle clan preservation on/off.",
        default: "keepclans",
      },
      minMovesToggleCommand: {
        required: false,
        description:
          "Command to toggle minMoves mode on/off.",
        default: "minmoves",
      },
      preserveSquads: {
        required: false,
        description: "Preserve squads during balancing operations.",
        default: true,
      },
      preserveClans: {
        required: false,
        description: "Preserve clans during balancing operations.",
        default: true,
      },
      minMoves: {
        required: false,
        description: "Apply minimum player swaps to reach autoBalanceThreshold",
        default: false,
      },
      autoBalanceEnabled: {
        required: false,
        description:
        "Auto balance teams at the end of each match if balance threshold is exceeded.",
        default: true,
      },
      autoBalanceThreshold: {
        required: false,
        description:
        "Trigger threshold for auto balance, value is probability of one side winning e.g. 75%.",
        default: 0.75,
      },
      ratingMode: {
        required: false,
        description: "Skill rating system to use.",
        default: "logisticregression",
      },
      testMode: {
        required: false,
        description: "If set to true no player swaps will be applied, only balance calcuations and logging.",
        default: true,
      },
      roundEndDelay: {
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
      logFilePath: {
        required: false,
        description: "File path for dev mode logging.",
        default: "./balance_log.txt",
      },
      startBalanceBroadcast: {
        required: false,
        description: "The message broadcast when balancing is triggered (auto or forced).",
        default:
          "Skill based team balance in progress. This system is automated.",
      },
      swapWarningMessage: {
        required: false,
        description: "Message sent to players when they are swapped.",
        default:
          "You have been automatically swapped to balance the teams based on skill ratings.",
      },
    };
  }

  constructor(server, options, connectors) {
    super(server, options, connectors);

    this.balanceInProgress = false;

    this.onCheckCommand = this.onCheckCommand.bind(this);
    this.onCheckModeCommand = this.onCheckModeCommand.bind(this);
    this.onForceBalanceCommand = this.onForceBalanceCommand.bind(this);
    this.onAutoBalanceToggleCommand = this.onAutoBalanceToggleCommand.bind(this);
    this.onSquadsToggleCommand = this.onSquadsToggleCommand.bind(this);
    this.onClansToggleCommand = this.onClansToggleCommand.bind(this);
    this.onMinMovesToggleCommand = this.onMinMovesToggleCommand.bind(this);

    this.onNewGame = this.onNewGame.bind(this);
    this.onRoundEnd = this.onRoundEnd.bind(this);
    this.onPlayerConnect = this.onPlayerConnect.bind(this);

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

    this.MSS;
  }

  async mount() {
    this.MSS = this.server.plugins.find(p => p instanceof MySquadStatsCache);
    if (!this.MSS) {
      throw new Error('MySquadStatsCache is not enabled.')
    };

    this.server.on(`CHAT_COMMAND:${this.options.checkCommand}`, this.onCheckCommand);
    this.server.on(`CHAT_COMMAND:${this.options.checkModeCommand}`, this.onCheckModeCommand);
    this.server.on(`CHAT_COMMAND:${this.options.forceBalanceCommand}`, this.onForceBalanceCommand);
    this.server.on(`CHAT_COMMAND:${this.options.squadsToggleCommand}`, this.onSquadsToggleCommand);
    this.server.on(`CHAT_COMMAND:${this.options.clansToggleCommand}`, this.onClansToggleCommand);
    this.server.on(`CHAT_COMMAND:${this.options.minMovesToggleCommand}`, this.onMinMovesToggleCommand);
    this.server.on(`CHAT_COMMAND:${this.options.autoBalanceToggleCommand}`, this.onAutoBalanceToggleCommand);

    this.server.on("NEW_GAME", this.onNewGame);
    this.server.on("ROUND_ENDED", this.onRoundEnd);
    this.server.on("PLAYER_CONNECTED", this.onPlayerConnect);

    this.logInfo("SquadTeamBalancer plugin mounted");
  }

  async unmount() {
    this.server.randomiser = false;

    this.server.removeEventListener(`CHAT_COMMAND:${this.options.checkCommand}`, this.onCheckCommand);
    this.server.removeEventListener(`CHAT_COMMAND:${this.options.checkModeCommand}`, this.onCheckModeCommand);
    this.server.removeEventListener(`CHAT_COMMAND:${this.options.forceBalanceCommand}`, this.onForceBalanceCommand);
    this.server.removeEventListener(`CHAT_COMMAND:${this.options.squadsToggleCommand}`, this.onSquadsToggleCommand);
    this.server.removeEventListener(`CHAT_COMMAND:${this.options.clansToggleCommand}`, this.onClansToggleCommand);
    this.server.removeEventListener(`CHAT_COMMAND:${this.options.minMovesToggleCommand}`, this.onMinMovesToggleCommand);
    this.server.removeEventListener(`CHAT_COMMAND:${this.options.autoBalanceToggleCommand}`, this.onAutoBalanceToggleCommand);

    this.server.removeEventListener("NEW_GAME", this.onNewGame);
    this.server.removeEventListener("ROUND_ENDED", this.onRoundEnd);
    this.server.removeEventListener("PLAYER_CONNECTED", this.onPlayerConnect);

    this.logInfo("SquadTeamBalancer plugin unmounted");
  }

  get balanceMode() {
    return `Squads: ${this.options.preserveSquads} Clans: ${this.options.preserveClans} MinMoves: ${this.options.minMoves}`
  }

  get config() {
    return `AutoBalance: ${this.options.autoBalanceEnabled} KeepSquads: ${this.options.preserveSquads} KeepClans: ${this.options.preserveClans} MinMoves: ${this.options.minMoves}`
  }

  async onAutoBalanceToggleCommand(info) {
    if (info.chat !== "ChatAdmin") return;

    let newSetting = await this.#toggleCommand(info);
    if (newSetting == null) return

    if (newSetting === this.options.autoBalanceEnabled) {
      this.logDebug(`Auto balance toggle command recieved, but mode is already set to "${this.options.autoBalanceEnabled}".`);
      await this.warnPlayer(info.player.eosID, `Mode is already set to "${this.options.autoBalanceEnabled}"`);
      return
    }

    this.options.balanceMode = newSetting;

    this.logInfo(`Auto balance toggle command recieved, mode changed to "${this.options.autoBalanceEnabled}"`);
    await this.notifyAdmins(`Admin ${info.name} toggled auto-balancing mode to "${this.options.autoBalanceEnabled}"`);
  }

  async onSquadsToggleCommand(info) {
    if (info.chat !== "ChatAdmin") return;

    let newSetting = await this.#toggleCommand(info);
    if (newSetting == null) return

    if (newSetting === this.options.preserveSquads) {
      this.logDebug(`Preserve squads toggle command recieved, but mode is already set to "${this.options.preserveSquads}".`);
      await this.warnPlayer(info.player.eosID, `Mode is already set to "${this.options.preserveSquads}"`);
      return
    }

    this.options.preserveSquads = newSetting;

    this.logInfo(`Preserve squads toggle command recieved, mode changed to "${this.options.preserveSquads}"`);
    await this.notifyAdmins(`Admin ${info.name} toggled squad-preservation to "${this.options.preserveSquads}"`);
  }

  async onClansToggleCommand(info) {
    if (info.chat !== "ChatAdmin") return;

    let newSetting = await this.#toggleCommand(info);
    if (newSetting == null) return

    if (newSetting === this.options.preserveClans) {
      this.logDebug(`Preserve clans toggle command recieved, but mode is already set to "${this.options.preserveClans}".`);
      await this.warnPlayer(info.player.eosID, `Mode is already set to "${this.options.preserveClans}"`);
      return
    }

    this.options.preserveClans = newSetting;

    this.logInfo(`Preserve clans toggle command recieved, mode changed to "${this.options.preserveClans}"`);
    await this.notifyAdmins(`Admin ${info.name} toggled clan-preservation to "${this.options.preserveClans}"`);
  }

  async onMinMovesToggleCommand(info) {
    if (info.chat !== "ChatAdmin") return;

    let newSetting = await this.#toggleCommand(info);
    if (newSetting == null) return

    if (newSetting === this.options.minMoves) {
      this.logDebug(`minMoves toggle command recieved, but mode is already set to "${this.options.minMoves}".`);
      await this.warnPlayer(info.player.eosID, `minMoves is already set to "${this.options.minMoves}"`);
      return
    }

    this.options.minMoves = newSetting;

    this.logInfo(`minMoves toggle command recieved, mode changed to "${this.options.minMoves}"`);
    await this.notifyAdmins(`Admin ${info.name} toggled minMoves mode to "${this.options.minMoves}"`);
  }

  async #toggleCommand(info) {
    const message = String().toLowerCase(info.message);
    let option = null;

    if (message in ['on', 'enabled', 'active', 'yes', '1', 'true']) {
      option = true;
    } else if (message in ['off', 'disabled', 'inactive', 'no', '0', 'false']) {
      option = false;
    } else {
      this.logDebug(`Toggle command recieved, but option was invalid: "${message}".`);
      await this.warnPlayer(info.player.eosID, 'Invalid option, try "on" or "off".');
    }
    return option
  }

  async onCheckModeCommand(info) {
    if (info.chat !== "ChatAdmin") return;

    await this.warnPlayer(info.player.eosID, this.config)
  }

  async onCheckCommand(info) {
    if (info.chat !== "ChatAdmin") return;

    const players = this.server.players.slice(0);
    const rater = await this.getRater(players);
    const team1 = players.filter(player => player.teamID == 1);
    const team2 = players.filter(player => player.teamID == 2);
    const winProbability = rater.winProbability(team1, team2);

    this.logInfo(`Admin ${info.name} requested balance check. Team1: ${winProbability.toFixed(2)}, Team2: ${(1 - winProbability).toFixed(2)}`);
    await this.notifyAdmins(`Admin ${info.name} requested balance check. Team1: ${winProbability.toFixed(2)}, Team2: ${(1 - winProbability).toFixed(2)}`);
  }

  async onForceBalanceCommand(info) {
    if (info.chat !== "ChatAdmin") return;

    if (this.lastForce != info.player.eosID) {
      this.logDebug(`Admin ${info.name} entered a force balance command but still requires confirmation.`)
      await this.warnPlayer(info.player.eosID, "Enter force balance command again within 15 seconds to confirm.")
      this.lastForce = info.player.eosID;
      setInterval(() => this.lastForce = null, 15 * 1000);
      return
    }
    this.logInfo(`Admin ${info.name} launched a forced team balance.`)
    this.notifyAdmins(`Admin: ${info.player.name} has launched a forced team balance.`);
    await this.broadcast(this.options.startBalanceBroadcast)

    await this.server.updatePlayerList();
    const players = this.server.players.slice(0);
    const rater = await this.getRater(players);
    await this.balanceTeams(players, rater);
  }

  async onRoundEnd() {
    this.logDebug('Round Ended.');
    this.squadStatsUtils.clearRefreshQueue();

    await new Promise((resolve) => setTimeout(resolve, 1000 * this.options.roundEndDelay));

    await this.server.updatePlayerList();
    const players = this.server.players.slice(0);
    let rater = await this.getRater(players);

    this.logInfo(`Round end players: ${players.length}`);
    this.logDebug(`Auto-balance mode: ${this.options.autoBalanceEnabled}, playerThreshold: ${this.options.playerThreshold}, Auto-balance threshold: ${this.options.autoBalanceThreshold}`);

    if (this.options.autoBalanceEnabled && players.length >= this.options.playerThreshold && shouldBalance(players, rater, this.autoBalanceThreshold)) {
      this.logInfo('Round end auto-balance triggered.');
      await this.broadcast(this.options.startBalanceBroadcast)
      await this.balanceTeams(players, rater);
    } else {
      const team1 = players.filter(player => player.teamID == 1);
      const team2 = players.filter(player => player.teamID == 2);
      const winProbability = rater.winProbability(team1, team2);
      this.logInfo(`Auto-balance skipped. Win probabilities, Team1: ${winProbability.toFixed(2)}, Team2: ${(1 - winProbability).toFixed(2)}, RatingMode: ${this.options.ratingMode}`);
    }
  }

  async onPlayerConnect(data) {
    // this.squadStatsUtils.queuePlayerRefresh(data.steamID)
    this.logDebug(`New player connected, steamID: ${data.steamID}. Requested cache refresh.`);
    await this.MSS.fetchPlayerData(data.steamID);
  }

  async onNewGame() {
    this.logDebug('New game started.');
  }

  async balanceTeams(players, rater) {
    if (this.balanceInProgress) {
      this.logWarn('Attempted to run team balance but a balance is already in progress.')
      throw new Error('A balance is already in progress.')
    }
    this.balanceInProgress = true;

    const team1Before = players.filter(player => player.teamID == 1).map(player => player.steamID);
    const team2Before = players.filter(player => player.teamID == 2).map(player => player.steamID);
    const winProbability = rater.winProbability(team1Before, team2Before);
    this.logDebug(`Team1 before: ${team1Before}`);
    this.logDebug(`Team2 before: ${team2Before}`);
    this.logInfo(`Pre-balance probabilities, Team1: ${winProbability.toFixed(2)}, Team2: ${(1 - winProbability).toFixed(2)}, RatingMode: ${this.options.ratingMode}`);

    let team1 = [];
    let team2 = [];
    let squads = [];
    let clans = [];
    if (this.options.preserveSquads) {
      squads = playersToSquadSteamIDArrays(players);
    }
    if (this.options.preserveClans) {
      // TODO Implement finding clans.
      clans = [];
    }
    let balancer = new Balancer(rater, players, squads, clans);
    try {
      ({ team1, team2 } = balancer.calculateTargetTeams(this.autoBalanceThreshold, this.options.minMoves));
    } catch (e) {
      this.balanceInProgress = false;
      this.logError(`Error occured during team balancing calculation: ${e.message}`);
      await this.notifyAdmins(`Balancing calculation failed. ${e.message}`);
      return
    }

    this.logDebug(`Target team1: ${team1}`);
    this.logDebug(`Target team2: ${team2}`);

    if (this.options.testMode) {
      let targetWinProbability = rater.winProbabilitySteamIDs(team1, team2);
      this.logInfo(`Predicted target team probabilities, Team1: ${targetWinProbability.toFixed(2)}, Team2: ${(1 - targetWinProbability).toFixed(2)}, RatingMode: ${this.options.ratingMode}, Balance Mode: ${this.balanceMode}`);
      await this.notifyAdmins(`Testing mode: Target team probabilities `)
      return
    }


    try {
      await swapToTargetTeams(server, team1, team2);
    } catch (e) {
      this.balanceInProgress = false;
      this.logError(`Error occured during player swaps operation: ${e.message}`);
      await this.notifyAdmins(`Error during player swaps ${e.message}`);
    }

    await this.server.updatePlayerList();
    players = this.server.players.slice(0);
    rater = await this.getRater(players);

    const team1After = players.filter(player => player.teamID == 1).map(player => player.steamID);
    const team2After = players.filter(player => player.teamID == 2).map(player => player.steamID);
    winProbability = rater.winProbability(team1After, team2After);
    this.logInfo(`Post-balance probabilities, Team1: ${winProbability.toFixed(2)}, Team2: ${(1 - winProbability).toFixed(2)}, RatingMode: ${this.options.ratingMode}, Balance Mode: ${this.options.balanceMode}`);
    this.logInfo(`Difference from target Team1: ${team2After.filter(x => !team1.includes(x))}`);
    this.logInfo(`Difference from target Team2: ${team2After.filter(x => !team2.includes(x))}`);
  }

  async getRater(players) {
    switch (this.ratingMode) {
      case "logisticRegression": {
        try {
          let steamIDs = players.map(player => player.steamID);
          let playerStats = this.MSS.getManyFromCache(steamIDs);
          if (playerStats.length < players.length) {
            this.logWarn(`Rater is missing data for: ${!steamIDs.filter(x => Object.keys(playerStats).includes(x))}`);
          }
          return new LogisticRegressionRater(playerStats);
        } catch (e) {
          this.logError(`Encountered error when trying to load player stats from MySquadStatsCache plugin. ${e.message}`);
          throw new Error(`Encountered error when trying to load player stats from MySquadStatsCache plugin. ${e.message}`);
        }
      }
      case "random": return new RandomRater()
      default: return new RandomRater()
    }
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
      this.logError(`Failed to notify admins: ${error.message}`);
    }
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
