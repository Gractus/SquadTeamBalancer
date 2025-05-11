# SquadTeamBalancer Plugin

The `SquadTeamBalancer` plugin provides an advanced system for balancing teams based on player skill ratings. It uses player Elo ratings to create fair and balanced teams while prioritizing squad integrity.

## Core Files

- **SquadTeamBalancer.js**: The main plugin file that handles team balancing operations, processes admin commands, and manages the execution timing after round end.
- **mysquadstats-utils.js**: A utility class that interacts with the mysquadstats.com API to fetch player statistics and calculate Elo ratings based on win rates and kill/death ratios.
- **squad-balancer-utils.js**: A utility class that handles the mathematical aspects of team balancing, calculating optimal squad movements to achieve skill balance between teams.

## Features

- **Skill-Based Balancing**: Uses player Elo ratings to create optimally balanced teams based on actual player performance data.
- **Balancing Modes**: Offers two balancing modes - minimal changes to achieve balance or a more extensive shuffle while maintaining balance.
- **Squad Integrity**: Prioritizes keeping squads together during team balancing.
- **Round-End Timing**: Executes balancing after round end with configurable timing windows, allowing players to view end-of-round stats before being swapped.
- **API Integration**: Connects with mysquadstats.com to obtain current player statistics for accurate skill ratings.
- **Cached Player Data**: Caches player skill data to reduce API calls and handle situations when the API is unavailable.
- **Failure Recovery**: Handles failed player swaps and provides detailed reports on balancing operations.
- **Admin Notifications**: Comprehensive admin notifications showing balance results, Elo differences, and any issues encountered.
- **Balance Checking**: Allows admins to check team balance at any time without initiating a swap.
- **Detailed Logging**: Option to enable detailed logging of team compositions, ELO data and balance operations at round end.

## Admin Commands

- **Balance Teams (Minimal Changes)**: Initiates team balancing with minimal changes to achieve balance.
  - Default Command: `!randomisebalance`
  - Aliases: `!rbalance`, `!randombalance`
  - **Usage**: Type the command in admin chat to schedule balancing for the next round end.

- **Full Team Shuffle**: Initiates a more extensive team shuffle while still maintaining skill balance.
  - Default Command: `!randomisefull`
  - Aliases: `!rfull`, `!randomfull`
  - **Usage**: Type the command in admin chat to schedule a full shuffle for the next round end.

- **Check Team Balance**: Checks the current balance of teams without making any changes.
  - Default Command: `!randomisecheck`
  - Aliases: `!rcheck`, `!randomcheck`
  - **Usage**: Type the command in admin chat to see the current Elo difference between teams.

- **Stop Balancing**: Cancels any scheduled team balancing operations.
  - Default Command: `!randomisestop`
  - Aliases: `!rstop`, `!randomstop`
  - **Usage**: Type the command in admin chat to cancel scheduled balancing.

- **Force Balancing**: Forces immediate execution of pending balance operations.
  - Default Command: `!forcerandomise`
  - **Usage**: Type the command in admin chat to immediately execute balancing.

## Configuration Options
**WARNING**
  - **minExecutionTime**: Must be aleast 25sec less than `maxExecutionTime`. But not `0` as to give players time to review the scoreboard
  - **maxExecutionTime**: Must not be longer than `TimeBeforeVote` set in your server.cfg file


The following options can be configured in the plugin's configuration file:

- **balanceCommand**: The command used to balance teams with minimal changes.
  - **Default**: `randomisebalance`

- **minExecutionTime**: Minimum time in seconds to wait after round end before executing balance operations.
  - **Default**: `20`

- **maxExecutionTime**: Maximum time in seconds after round end to complete balance operations. 
  - **Default**: `45`

- **adminNotificationsEnabled**: Whether to send notifications to admins about command usage and errors.
  - **Default**: `true`

- **balanceCommandAliases**: Alternative commands for balance mode.
  - **Default**: `["rbalance", "randombalance"]`

- **fullShuffleCommand**: The command used to extensively shuffle teams while maintaining balance.
  - **Default**: `randomisefull`

- **fullShuffleCommandAliases**: Alternative commands for full shuffle mode.
  - **Default**: `["rfull", "randomfull"]`

- **checkCommand**: The command used to check current ELO balance without swapping.
  - **Default**: `randomisecheck`

- **checkCommandAliases**: Alternative commands for checking team balance.
  - **Default**: `["rcheck", "randomcheck"]`

- **stopCommand**: The command used to stop any active team shuffling.
  - **Default**: `randomisestop`

- **stopCommandAliases**: Alternative commands to stop shuffling.
  - **Default**: `["rstop", "randomstop"]`

- **forceCommand**: The command used to force immediate execution of pending shuffles.
  - **Default**: `forcerandomise`

- **startBalanceMessage**: The message broadcast when balance mode is activated.
  - **Default**: `We will be balancing teams during end match results. This system is automated.`

- **startFullShuffleMessage**: The message broadcast when full shuffle mode is activated.
  - **Default**: `We will be shuffling teams during end match results. We will attempt to keep you together with your squad. This system is automated.`

- **swapWarningMessage**: Message sent to players when they are swapped.
  - **Default**: `You have been automatically swapped to balance the teams based on skill ratings.`

- **emergencyBalanceMessage**: Message sent to players when they are swapped during emergency rebalancing.
  - **Default**: `You have been swapped to balance teams (emergency rebalance)`

- **accessToken**: MySquadStats API access token.
  - **Default**: `""`

- **baseEloRating**: Default Elo rating for players without data.
  - **Default**: `1500`

- **maxEloRatingDifference**: Maximum acceptable difference in average Elo between teams.
  - **Default**: `100`

- **fullShufflePercentage**: Percentage of squads to move in full shuffle mode.
  - **Default**: `40`

- **playerThreshold**: Minimum players needed to perform skill-based balancing.
  - **Default**: `20`

- **devLoggingMode**: Enable detailed team composition logging at round end.
  - **Default**: `false`
  - When enabled, logs detailed information about team composition, ELO ratings, squad leaders, and unassigned players at round end.
  - Also logs information about ticket counts and team victory status.

- **logFilePath**: File path for dev mode logging.
  - **Default**: `./balance_log.txt`

## Example Configuration

```json
{
  "plugin": "SquadTeamBalancer",
  "enabled": true,
  "balanceCommand": "randomisebalance",
  "minExecutionTime": 15,
  "maxExecutionTime": 45,
  "balanceCommandAliases": ["rbalance", "randombalance"],
  "fullShuffleCommand": "randomisefull",
  "fullShuffleCommandAliases": ["rfull", "randomfull"],
  "checkCommand": "randomisecheck",
  "checkCommandAliases": ["rcheck", "randomcheck"],
  "checkingMessage": "Fetching current ELO ratings for teams...",
  "stopCommand": "randomisestop",
  "stopCommandAliases": ["rstop", "randomstop"],
  "forceCommand": "forcerandomise",
  "startBalanceMessage": "We will be balancing teams during end match results. This system is automated.",
  "startFullShuffleMessage": "We will be shuffling teams during end match results. We will attempt to keep you together with your squad. This system is automated.",
  "stopMessage": "Team balancing has been cancelled.",
  "intervalMessage": "Team balancing will occur during end match results. This system is automated.",
  "enableIntervalBroadcast": true,
  "intervalTime": 5,
  "updateSquadListInterval": 5,
  "swapWarningMessage": "You have been automatically swapped to balance the teams based on skill ratings.",
  "emergencyBalanceMessage": "You have been swapped to balance teams (emergency rebalance)",
  "balanceCompleteMessage": "Balance completed\n| Swapped {swappedPlayers} players\n| Team 1: {team1Count} players (avg Elo: {team1Elo})\n| Team 2: {team2Count} players (avg Elo: {team2Elo})",
  "accessToken": "",
  "baseEloRating": 1500,
  "maxEloRatingDifference": 100,
  "fullShufflePercentage": 40,
  "playerThreshold": 20,
  "cachePlayerData": true,
  "cacheExpiry": 24,
  "playerListFile": "./playerSkillData.json",
  "devLoggingMode": false,
  "logFilePath": "./balance_log.txt"
}