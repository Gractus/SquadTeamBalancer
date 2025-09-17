# SquadTeamBalancer SquadJS Plugin (WIP)

# WARNING - THIS README IS OUT OF DATE REFER TO PLUGIN CODE DIRECTLY FOR NOW

The `SquadTeamBalancer` plugin provides an advanced system for optimally balancing teams based on player skill ratings.

Using data from mysquadstats.com and analysing the data over thousands of matchs and tens of thousands of players it is possible to predict the outcome of a squad match with over 85% confidence for almost half of all matches based entirely on the difference between average team stats. This plugin works to improve the quality of the average squad match by stopping steam rolls before they happen.

## Features

- **API Integration**: Connects with mysquadstats.com to obtain current player statistics for accurate skill ratings.
- **Skill-Based Balancing**: Uses player ratings to create optimally balanced teams based on individual player performance data.
- **Rating System Flexibility**: Can be expanded to work with new rating system.
- **Minimal Balancing Mode**: Finds new team composition with minimal player swaps to achieve desired level of balance.
- **Squad Integrity**: Optionally keeps squads together during shuffle operations.
- **Clan Integrity**: Optionally keeps registered clans or friend groups together during shuffle operations. (Coming as soon as someone creates a database)
- **Round-End Timing**: Executes balancing after round end with configurable timing windows, allowing players to view end-of-round stats before being swapped.
- **Cached Player Data**: Caches player skill data to reduce API calls and handle situations when the API is unavailable.
- **Balance Checking**: Allows admins to check team balance status at any time with chat commands.
- **Detailed Logging**: (Coming Soon) Track game balance, win prediction accuracy, and log stats for future improvements.
- **Failure Recovery**: (Coming Soon) Handles failed player swaps and provides detailed reports on balancing operations.

## Admin Commands

- **Check Balance**: Checks the current balance of teams without making any changes.
  - Default Command: `!balancecheck`
  - **Usage**: Type the command in admin chat to see the current win probabilities per team using currently set rating system.

- **Force Balance**: Forces immediate team balance during active match.
  - Default Command: `!forcebalance`
  - **Usage**: Type the command in admin chat, requires confirmation to avoid accidental upsets.

## Core Files

- **SquadTeamBalancer.js**: The main plugin file that handles game events and admin commands by running appropriate actions.
- **squad-balancer-utils.js**: Library including team balance calculation logic, player team swap utilities, and rating system classes.
- **mysquadstats-utils.js**: A utility class that interacts with the mysquadstats.com API to fetch player stats.
