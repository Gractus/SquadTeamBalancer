# WARNING - THIS README MIGHT BE OUT OF DATE - THIS IS A WORK IN PROGRESS

# SquadTeamBalancer SquadJS Plugin

The `SquadTeamBalancer` plugin provides a system for optimally balancing teams based on player skill ratings.

Using stats from mysquadstats.com and analysing data from thousands of matches and tens of thousands of players I estimate that **almost half of all Squad matches are *hopelessly* unbalanced** where the losing team has a <15% chance of winning.

While other approaches to team balance like steamroll detection or manually triggered team randomisation can work, they don't address imbalance issues until it's too late, nor do they guarantee a balanced match when applied.

By knowing every players "career" skill it's not necessary to wait until a steamroll has already occured. Instead you can constantly monitor the balance of a server and shuffle as needed, while being confident that the balancing actions you make **do** improve balance, and don't just have a ***chance*** to.

## Features

- **Skill-Based Balancing**: Uses player ratings to create optimally balanced teams based on individual player performance data.
- **Objective Skill Rating**: Connects with mysquadstats.com to obtain current player statistics for accurate skill ratings.
- **Balance Checking**: Allows admins to check team balance status at any time with chat commands.
- **Minimal Balancing Mode**: Finds new team composition with minimal player swaps to achieve desired level of balance.
- **Squad Integrity**: Optionally keeps squads together during shuffle operations.
- **Clan Integrity**: (Coming as soon as someone creates a database) Optionally keeps registered clans or friend groups together during shuffle operations.
- **Round-End Timing**: Executes balancing after round end with configurable timing windows, allowing players to view end-of-round stats before being swapped.
- **Cached Player Data**: Caches player skill data to reduce API calls and handle situations when the API is unavailable.
- **Rating System Flexibility**: Architected to work with new rating systems.
- **SquadJS Logging**: Track game balance, audit admin commands, monitor effectiveness of balancing operations.
- **Self Improving**: (Coming Soon) Track game balance, win prediction accuracy, and log stats for future improvements to prediction models.
- **Robust Player Swaps**: (Coming Soon) Handles failed player swaps.

## Admin Commands

- **Check Balance**: Checks the current balance of teams without making any changes.
  - **Default Command**: `!balancecheck`
  - **Usage**: Type the command in admin chat to see the current win probabilities per team using currently set rating system.

- **Force Balance**: Forces immediate team balance during active match.
  - **Default Command**: `!forcebalance`
  - **Usage**: Type the command in admin chat, requires confirmation to avoid accidental upsets.

- **Check Balance Mode**: Reports current balancing config.
  - **Default Command**: `!checkbalancemode`
  - **Usage**: Type the command in admin chat, current config e.g. Auto-balance on/off, KeepSquads on/off, etc will be reported.

- **Toggle Auto-Balance**: Set auto-balance option.
  - **Default Command**: `!autobalance`
  - **Usage**: Type the command in admin chat followed by the desired state e.g. `!autobalance true`.
  - **Options**:
    * `true/on/1`
    * `false/off/0`

- **Toggle Keep Squads**: Keep squads together.
  - **Default Command**: `!keepsquads`
  - **Usage**: Type the command in admin chat followed by the desired state e.g. `!keepsquads true`.
  - **Options**:
    * `true/on/1`
    * `false/off/0`

- **Toggle Keep Clans**: Keep clans together.
  - **Default Command**: `!keepclans`
  - **Usage**: Type the command in admin chat followed by the desired state e.g. `!keepclans true`.
  - **Options**:
    * `true/on/1`
    * `false/off/0`

- **Toggle Min Moves**: Use minimal moves.
  - **Default Command**: `!minmoves`
  - **Usage**: Type the command in admin chat followed by the desired state e.g. `!minmoves true`.
  - **Options**:
    * `true/on/1`
    * `false/off/0`

## Example Configuration

```json
{
  "plugin": "MySquadStatsCache",
  "accessToken": "YOURTOKENHERE",
  "apiRequestRetries": 3,
  "cachePlayerData": true,
  "cacheExpiry": 72,
  "statsDatabaseFile": "./playerStatsCache.json",
}
```
MySquadStatsCache **MUST** come before SquadTeamBalancer in your SquadJS config.

```json
{
  "plugin": "SquadTeamBalancer",
  "enabled": true,
  "autoBalanceEnabled": true,
  "autoBalanceThreshold": 0.75,
  "preserveSquads": true,
  "preserveClans": true,
  "minMoves": false,
  "testMode": true,
  "roundEndDelay": 10,
}
```

## Core Files

- **SquadTeamBalancer.js**: The main plugin file that handles game events and admin commands by running appropriate actions.
- **MySquadStatsCache.js**: Secondary plugin which interacts with the mysquadstats.com API to fetch and cache player stats.
- **squad-balancer-utils.js**: Library including team balance calculation logic, player team swap utilities, and rating system classes.


## How It Works

#### Rating Player Skill
Using a logistic regression model applied to average KDR, PlayTime, and Score differences between teams it's possible to calculate the probability one team will win over another. While not ideal, in cases where the model is more than 75% confident one team will win over the other it is correct over 85% of the time which I consider good enough.

To create an individual player skill rating we just consider the case of the individual player vs the server average and use the predicted win probability as the rating.

In the future other models might be developed using something like OpenSkill or TrueSkill but with the stats publicly available those models just don't work. This will require more cooperation from OWI or more participation from community servers.

#### Balancing Teams
While it's trivial to shuffle two sets of players into optimally balanced teams, it's not a good solution. People play with their friends, they make friendships within their squad, they play with clans, if you split these social bonds between teams they will naturally reconstitute like a T-1000 as people swap back to be with their friends, terminating your efforts to balance teams.

Thus we cannot consider balance at an individual player level, but instead a group level. We make the assumption that if players were friends they would be in the same squad and that squad will be the group. Clans might be bigger than a single squad, but their squads might not be exclusive to clan members, it's likely they would rather play with their clan than their specific squad members so when we assemble our groups we first group together clans, then squads, then individual players which each get their own group.

The fundamental unit we work in is the group. Each group has members, each member has a skill rating.

The challenge is to assemble two teams from these groups such that the sum of the skills and player count are equal.

In the abstract this is considered a two-dimensional two-way partition problem and is classified as *NP-hard*.

We can visualise the problem space as a bitfield of *n* values where *n* is the number of groups we must assign, and each value `0` or `1` represents which team the group is assigned to. Using a naive brute force approach there are 2<sup>n</sup> possible combinations of groups, and has an estimated cost of O(2<sup>n</sup>n) (considering the cost of evaluating each combination).

For the relatively small values of *n* we expect to see (between 11 and 31 groups for a full server, average squad sizes between 9 and ~3.23), this is still within the realm of computability given the time constraints at the end of a squad match. For reference 2<sup>11</sup> = 2048 and 2<sup>31</sup> ~= 2.1 billion.

Using a dynamic programming approach it's possible to explore every possible solution in under 6 seconds for up to 31 groups on an Intel i5 11600KF.

###### EXPLAINATION OF DYNAMIC PROGRAMMING SOLUTION COMING SOON

No matter the hardware you throw at this you're not going far beyond 31 groups within the time constraints we're working in, so a different approach is needed for large numbers of groups. Thankfully as the number of groups grows the size of each individual group shrinks.

When working with relatively small groups we assume that we can work with them more or less like individual players and apply the same balancing stratergy as we would there. First we sort the groups by the average skill of it's members in descending order, then assign each group from best to worst to alternating teams. With some backtracking in the event of an earlier assignment, the result may not be optimal but hopefully it won't be far off. Most importantly this will be almost instantaneous.

Combining the dynamic programming exhaustive search and a less intelligent, more "optimisitic" algorithm for larger numbers of groups we get a reasonably fast/accurate solution for cases.