/** Example rater gives random ratings. */
export class RandomRater {
  rate(playerID) {
    return Math.random();
  }

  rateGroup(playerIDs) {
    return Math.random();
  }

  winProbability(team1, team2) {
    return 0;
  }

  winProbabilityToAbsoluteDiff(probability) {
    return 0.0005
  }
}

/** Logistic regression model based on MySquadStats data. */
export class LogisticRegressionRater {
  constructor(playerStats) {
    this.playerStats = playerStats;
    this.avgStats = playerStats.values().reduce((total, x) => {
      total.kdr += x.kdr;
      total.playTime += x.playTime;
      total.score += x.totalScore;
      total.count += x.count;
      return total
    }, { kdr: 0, playTime: 0, score: 0, count: 0 });
    this.avgStats.kdr /= this.avgStats.count;
    this.avgStats.playTime /= this.avgStats.count;
    this.avgStats.score /= this.avgStats.count;
  }

  /** Calculate skill rating of steamID.
   * Method of rating: Probability of steamID winning vs the server average. */
  rate(steamID) {
    const playerStats = this.playerStats[steamID];
    if (playerStats == null) {
      console.log(`Missing stats for steamID: ${steamID}, using default rating.`);
      return 0.5
    }
    return this.#logisticRegressionFormula(playerStats, this.avgStats)
  }

  rateGroup(steamIDs) {
    const average = this.#averageStats(steamIDs);
    return this.#logisticRegressionFormula(average, this.avgStats)
  }

  /** Input lists of players.
   * Calculate probability of teamA winning over teamB. */
  winProbability(teamA, teamB) {
    let team1 = teamA.map(player => player.steamID);
    let team2 = teamB.map(player => player.steamID);
    return this.winProbabilitySteamIDs(team1, team2)
  }

  /** Input array of players.
   * Calculate probability of team1 winning over team2. */
  winProbabilityPlayers(players) {
    let {team1, team2} = playersToTeamsSteamIDs(players);
    return this.winProbabilitySteamIDs(team1, team2)
  }

  /** Input lists of steamIDs.
   * Calculate probability of teamA winning over teamB. */
  winProbabilitySteamIDs(teamA, teamB) {
    const averageA = this.#averageStats(teamA);
    const averageB = this.#averageStats(teamB);
    return this.#logisticRegressionFormula(averageA, averageB)
  }

  winProbabilityToAbsoluteDiff(balanceThreshold) {
    return balanceThreshold - 0.5;
  }

  #logisticRegressionFormula(statsA, statsB) {
    const diff = {};
    diff.kdr = statsA.kdr - statsB.kdr;
    diff.playTime = statsA.playTime - statsB.playTime;
    diff.score = statsA.score - statsB.score;
    // (Intercept)      diff_avg_kdr diff_avg_playtime    diff_avg_score
    //  1.071732e-02      4.181450e+00      9.575052e-07      7.053987e-05
    let z = 1.071732e-02 + 4.181450e+00 * diff.kdr + 9.575052e-07 * diff.playTime + 7.053987e-05 * diff.score;
    return 1 / (1 + Math.exp(-z))
  }

  #averageStats(steamIDs) {
    const avgStats = {
      kdr: 0,
      playTime: 0,
      score: 0,
      count: 0,
    }

    for (const steamID of steamIDs) {
      const playerStats = this.playerStats[steamID];
      if (playerStats == null) {
        console.log(`Missing stats for playerID: ${steamID}`);
        continue
      }
      avgStats.kdr += playerStats.kdr;
      avgStats.playTime += playerStats.playTime;
      avgStats.score += playerStats.totalScore;
      avgStats.count += 1;
    }

    avgStats.kdr /= avgStats.count;
    avgStats.playTime /= avgStats.count;
    avgStats.score /= avgStats.count;

    return avgStats
  }
}

export class Balancer {
  constructor(rater, players, squads = [], clans = []) {
    this.rater = rater;
    this.groups = this.#prepareGroups(players, squads, clans)
  }

  /** Prepare groups for balancing calculation.
     * Groups could be squads, or clans.
     * squads - List of lists of steam IDs. Each list represents a squad or grouping of players that will be kept together.
     * clans - Grouped before squads so clan members in a pub squad will be moved with their clan, not their squad. */
  #prepareGroups(players, squads = [], clans = []) {
    const clanGroups = {};
    const squadGroups = {};
    const individualGroups = [];

    for (const player of players) {
      // TODO: Decide on format of clans we pass in.
      const clan = clans.find(clan => clan.some(member => member === player.steamID));
      if (clan != null) {
        if (clanGroups[clan.ID] == null) {
          clanGroups[clan.ID] = {
            rating: this.rater.rate(player.steamID),
            team: player.teamID === 1 ? 1 : 0,
            members: [player.steamID],
          };
        } else {
          clanGroups[clan.ID].rating += this.rater.rate(player.steamID);
          clanGroups[clan.ID].team += player.teamID === 1 ? 1 : 0;
          clanGroups[clan.ID].members.push(player.steamID);
        }
      } else {
        const squadIndex = squads.findIndex(squad => squad.some(member => member.steamID === player.steamID));
        if (squadIndex > 0) {
          if (squadGroups[squadIndex] == null) {
            squadGroups[squadIndex] = {
              rating: this.rater.rate(player.steamID),
              team: player.teamID === 1 ? 1 : 0,
              members: [player.steamID],
            };
          } else {
            squadGroups[squadIndex].rating += this.rater.rate(player.steamID);
            squadGroups[squadIndex].team += player.teamID === 1 ? 1 : 0;
            squadGroups[squadIndex].members.push(player.steamID);
          }
        } else {
          individualGroups.push({ rating: this.rater.rate(player.steamID), members: [player.steamID], team: player.teamID === 1 ? 1 : 0 })
        }
      }
    }

    const groups = [];
    groups.push(...Object.values(clanGroups), ...Object.values(squadGroups), ...individualGroups);
    return groups
  }

  /** Calculate target teams for balanced match.
     * Keeps player groups together, groups could be squads, or clans.
     * minMoves - If true, will attempt to find the target teams with the fewest player team switches which satisfies balanceThreshold
     *            If balanceThreshold very close to 0.5 this will just be a slower version of running minMoves = false.
     * balanceThreshold - allowable skill difference between teams. */
  calculateTargetTeams(balanceThreshold = 0.75, minMoves = false) {
    if (balanceThreshold < 0.5 || balanceThreshold > 1) {
      throw new RangeError('Probability must be between 0.5 and 1.')
    }
    if (minMoves) {
      if (this.groups.length > 32) {
        return this.#fastBalanceMinMoves(this.rater.winProbabilityToAbsoluteDiff(balanceThreshold))
      } else {
        return this.#searchSwapsMinMoves(this.rater.winProbabilityToAbsoluteDiff(balanceThreshold))
      }
    } else {
      if (this.groups.length > 32) {
        return this.#fastBalance(this.rater.winProbabilityToAbsoluteDiff(balanceThreshold))
      } else {
        return this.#searchSwaps(this.rater.winProbabilityToAbsoluteDiff(balanceThreshold))
        // return this.#searchSwaps()
      }
    }
  }

  #preProcessSearchSwaps() {
    const groups = this.groups.slice(0).sort((a, b) => b.rating - a.rating);
    let totalSkill = 0;
    let totalPlayers = 0;
    groups.forEach((group, i) => {
      totalPlayers += group.members.length;
      totalSkill += group.rating;
    });
    const averageSkill = totalSkill / totalPlayers;
    const playerTarget = Math.ceil(totalPlayers / 2);
    const targetSkill = averageSkill * playerTarget;
    console.log(`totalSkill: ${totalSkill}`);
    console.log(`totalPlayers: ${totalPlayers}`);
    console.log(`Average Rating: ${averageSkill}`);

    const playersRemaining = new Uint8Array(groups.length).fill(0);
    const maxSkillFrom = new Float32Array(groups.length).fill(0);

    playersRemaining[playersRemaining.length - 1] = groups[groups.length - 1].members.length;
    maxSkillFrom[maxSkillFrom.length - 1] = groups[groups.length - 1].rating;
    for (let i = groups.length - 2; i >= 0; i--) {
      maxSkillFrom[i] = maxSkillFrom[i + 1] + groups[i].rating;
      playersRemaining[i] = playersRemaining[i + 1] + groups[i].members.length;
    }

    return { playerTarget, targetSkill, playersRemaining, maxSkillFrom, groups }
  }

  #searchSwaps(allowableGap) {
    const { playerTarget, targetSkill, playersRemaining, maxSkillFrom, groups } = this.#preProcessSearchSwaps();

    let currentBest = { finalTeam: null, teamSkill: null };

    let includedSkill = 0;
    let includedPlayers = 0;
    let playersNeeded = playerTarget - includedPlayers;
    let skillLowerBound = -Infinity;
    let i = 0;
    let iterations = 0;
    let stack = new Int8Array(groups.length);
    let stackPointer = 0;
    while (true) {
      iterations++;

      if (playersNeeded > playersRemaining[i]
        || (includedSkill + maxSkillFrom[i]) <= skillLowerBound
        || i == groups.length) {

        i = stack[--stackPointer];
        if (stackPointer < 0) {
          break;
        }

        includedPlayers -= groups[i].members.length;
        includedSkill -= groups[i].rating;
        playersNeeded = playerTarget - includedPlayers;
        i++;
        continue
      }

      if (groups[i].members.length <= playersNeeded) {
        includedPlayers += groups[i].members.length;
        includedSkill += groups[i].rating;
        playersNeeded = playerTarget - includedPlayers;
        stack[stackPointer++] = i;
      }

      if (playersNeeded == 0) {
        let skillGap = Math.abs(includedSkill - targetSkill);
        let oldSkillGap = Math.abs(currentBest.teamSkill - targetSkill);
        if (skillGap < oldSkillGap ?? Infinity) {
          skillLowerBound = targetSkill - skillGap;
          currentBest.finalTeam = stack.slice(0, stackPointer);
          currentBest.teamSkill = includedSkill;
          // console.log(`New Best: ${Math.abs(currentBest.teamSkill - targetSkill)}, ${this.#swapSearchStackToBitset(currentBest.finalTeam, groups)}`);
          // console.log(iterations);
        }

        if (i == stack[stackPointer - 1]) {
          includedPlayers -= groups[i].members.length;
          includedSkill -= groups[i].rating;
          playersNeeded = playerTarget - includedPlayers;
          stackPointer--;
        }
      }
      i++;
    }
    console.log(`Final Result: ${Math.abs(currentBest.teamSkill - targetSkill)}, ${this.#swapSearchStackToBitset(currentBest.finalTeam, groups)}`);
    console.log(iterations);

    if (currentBest.teamSkill == null) throw new Error('Failed to find any solution. Supplied groups are probably bad.')
    if ((Math.abs(currentBest.teamSkill - targetSkill) / playerTarget) > allowableGap) throw new Error('Balance is impossible with supplied groups, major clan stack likely. Disable clan preservation.')

    return this.#swapSearchStackToTeams(currentBest.finalTeam, groups)
  }

  #searchSwapsMinMoves(allowableGap) {
    if (allowableGap < 0) throw new RangeError('Range Error: allowableGap must be positiive.')
    const { playerTarget, targetSkill, playersRemaining, maxSkillFrom, groups } = this.#preProcessSearchSwaps();

    let currentBestMinMoves = { finalTeam: null, teamSkill: Infinity, movedPlayers: Infinity };

    let includedSkill = 0;
    let includedPlayers = 0;
    let movedPlayers = 0;
    let playersNeeded = playerTarget - includedPlayers;
    // let skillLowerBound = -Infinity;
    let i = 0;
    let iterations = 0;
    let stack = new Int8Array(groups.length);
    let stackPointer = 0;
    while (true) {
      iterations++;

      if (playersNeeded > playersRemaining[i]
        || movedPlayers > currentBestMinMoves.movedPlayers
        || Math.abs(includedSkill + maxSkillFrom[i] - targetSkill) <= allowableGap
        // || (movedPlayers === currentBestMinMoves.movedPlayers && includedSkill + maxSkillFrom[i] <= skillLowerBound)
        || i == groups.length) {

        stackPointer--;
        i = stack[stackPointer];
        if (stackPointer < 0) {
          break;
        }
        movedPlayers -= groups[i].members.length - groups[i].team;
        includedPlayers -= groups[i].members.length;
        includedSkill -= groups[i].rating;
        playersNeeded = playerTarget - includedPlayers;
        i++;
        continue
      }

      if (groups[i].members.length <= playersNeeded
        && movedPlayers + groups[i].team <= currentBestMinMoves.movedPlayers) {
        movedPlayers += groups[i].members.length - groups[i].team;
        includedPlayers += groups[i].members.length;
        includedSkill += groups[i].rating;
        playersNeeded = playerTarget - includedPlayers;
        stack[stackPointer++] = i;
      }

      if (playersNeeded == 0) {
        let skillGap = Math.abs(includedSkill - targetSkill);
        let oldSkillGapMinMoves = Math.abs(currentBestMinMoves.teamSkill - targetSkill);
        if ((movedPlayers < currentBestMinMoves.movedPlayers && skillGap < allowableGap)
          || (movedPlayers == currentBestMinMoves.movedPlayers && skillGap < oldSkillGapMinMoves)) {
          // skillLowerBound = targetSkill - skillGap;
          currentBestMinMoves.finalTeam = stack.slice(0, stackPointer);
          currentBestMinMoves.teamSkill = includedSkill;
          currentBestMinMoves.movedPlayers = movedPlayers;
          console.log(`New Best: ${currentBestMinMoves.movedPlayers}, ${Math.abs(currentBestMinMoves.teamSkill - targetSkill)}, ${this.#swapSearchStackToBitset(currentBestMinMoves.finalTeam, groups)}`);
          console.log(iterations);
        }
        if (i == stack[stackPointer - 1]) {
          movedPlayers -= groups[i].members.length - groups[i].team;
          includedPlayers -= groups[i].members.length;
          includedSkill -= groups[i].rating;
          playersNeeded = playerTarget - includedPlayers;
          stackPointer--;
        }
      }
      i++;
    }
    console.log(`Min Moves: ${currentBestMinMoves.movedPlayers}, ${Math.abs(currentBestMinMoves.teamSkill - targetSkill)}, ${this.#swapSearchStackToBitset(currentBestMinMoves.finalTeam, groups)}`);
    console.log(iterations);

    if ((Math.abs(currentBestMinMoves.teamSkill - targetSkill) / playerTarget) > allowableGap) throw new Error('Failed to find a solution under specified rating difference.')

    return this.#swapSearchStackToTeams(currentBestMinMoves.finalTeam, groups)
  }

  #swapSearchStackToTeams(stack, groups) {
    let team1 = [];
    let team2 = [];
    groups.forEach((group, i) => {
      if (stack.includes(i)) {
        team1.push(...group.members);
      } else {
        team2.push(...group.members);
      }
    })
    return { team1, team2 }
  }

  #swapSearchStackToBitset(stack, groups) {
    let bitset = '';
    for (let i = 0; i < groups.length; i++) {
      if (stack.includes(i)) {
        bitset += '1';
      } else {
        bitset += '0';
      }
    }
    return bitset
  }

  /** Assumes that group sizes are small enough that we can more or less treat them like individual players.
   * Should be very fast to compute but close enough to optimal balance.
   */
  #fastBalance(allowableGap) {
    let groups = this.groups.slice(0).sort((a, b) => this.rater.rateGroup(a.members) - this.rater.rateGroup(b.members));
    let remainingPlayers = groups.reduce((playerCount, group) => playerCount += group.members.length, 0);

    let team1Rating = 0;
    let team2Rating = 0;
    let team1Size = 0;
    let team2Size = 0;
    let groupAssignments = new Array(groups.length).fill(null);

    let i = 0;
    let group = null;
    let iterations = 0;
    let iterationLimit = groups.length * 1.5;
    while (i < groups.length) {
      // This shouldn't happen but good to know if it does.
      if (iterations > iterationLimit) throw new Error('Fast balance failed, exceeded iteration limit.');

      group = groups[i];

      if (team1Size < team2Size
        || (team1Size === team2Size && team1Rating < team2Rating)) {
        groupAssignments[i] = 1;
        team1Size += group.members.length;
        team1Rating += group.rating;
      } else {
        groupAssignments[i] = 2;
        team2Size += group.members.length;
        team2Rating += group.rating;
      }

      // Roll back assignments until added group won't cause imbalance.
      remainingPlayers -= group.members.length;
      let k = i;
      while (Math.abs(team1Size - team2Size) > remainingPlayers + 1) {
        if (i < 0) {
          throw new Error('Balance impossible, player group sizes are likely too big.')
        }

        let team = groupAssignments[i];
        if (team == 1) {
          team1Size -= groups[i].members.length;
          team1Rating -= groups[i].rating;
        } else {
          team2Size -= groups[i].members.length;
          team2Rating -= groups[i].rating;
        }
        groupAssignments[i] = null;
        i--;
      }
      // Change sort order of groups to put problem group earlier.
      move(groups, k, i);
      i++;
    }
    // This shouldn't happen but good to know if it does.
    if (Math.abs(team1Rating/team1Size - team2Rating/team2Size) > allowableGap) throw new Error('Fast balance unable to reach target balance gap.')

    let targetTeams = { team1: [], team2: [] };
    groupAssignments.forEach((assignment, i) => {
      if (assignment == 1) {
        targetTeams.team1.push(...groups[i].members);
      } else {
        targetTeams.team2.push(...groups[i].members);
      }
    });
    return targetTeams
  }

  #fastBalanceMinMoves() {
    throw new Error("Min Moves Balance is not implemented for this number of groups.")
    let team1 = { members: [], rating: 0 };
    let team2 = { members: [], rating: 0 };
    // let groupAssignments = new Array(groups.length).fill(null);

    this.groups.forEach((group) => {
      if (group.members.length - group.team > 0) {
        team1.rating += group.rating;
        team1.members.push(group);
      } else {
        team2.rating += group.rating;
        team2.members.push(group);
      }
    });

    team1.sort((a, b) => this.rater.rateGroup(a.members) - this.rater.rateGroup(b.members));
    team2.sort((a, b) => this.rater.rateGroup(a.members) - this.rater.rateGroup(b.members));

    let teamDiff = Math.abs(team1.rating - team2.rating);
    while (teamDiff > threshold) {
      if (team1.rating > team2.rating) {
        bestTeam = team1;
        worstTeam = team2;
      } else {
        bestTeam = team2;
        worstTeam = team1;
      }
      let i = bestTeam.members.findIndex(group => group.rating < teamDiff / 2)
      let bestGroup = bestTeam.members[i];
      let k = 0;
      let worstGroups = { members: [], players: 0, rating: 0 };
      let candidateGroup = null;
      while (worstGroups.rating < bestGroup.rating) {
        if (k == worstTeam.members.length) {
          // continue bestLabel
        }
        candidateGroup = worstTeam.members[k];
        if (worstGroups.players + candidateGroup.length < bestGroup.members.length) {
          worstGroups.members.push(candidateGroup);
          worstGroups.rating += candidateGroup.rating;
          worstGroups.players += candidateGroup.members.length;
        }
        k++;
      }
    }

    return { team1: team1, team2: team2 }
  }
}

function calculatePlayerFullBalanceMoves(players, ratingFunction) {
  let team1Rating = 0;
  let team2Rating = 0;
  let team1 = [];
  let team2 = [];

  let sortedPlayers = players.slice(0).sort((a, b) => ratingFunction(a.steamID) - ratingFunction(b.steamID));

  for (const player of sortedPlayers) {
    if (team1.length < team2.length
      || (team1.length === team2.length && team1Rating < team2Rating)) {
      team1.push(player.steamID);
      team1Rating += ratingFunction(player.steamID);
    } else {
      team2.push(player.steamID)
      team2Rating += ratingFunction(player.steamID);
    }
  }
  return { team1, team2 }
}

function move(array, from, to) {
  if (to === from) return array;

  const movedValue = array[from];
  if (from > to) {
    // Shift other elements up
    for (let i = from; i > to; i--) {
      array[i] = array[i - 1];
    }
  } else {
    // Shift other elements down
    for (let i = from; i < to; i++) {
      array[i] = array[i + 1];
    }
  }
  array[to] = movedValue;
  return array;
}

export function shouldBalance(players, rater, threshold) {
  let team1 = players.filter(player => player.teamID === 1);
  let winProbability = rater.winProbability(team1);
  if (winProbability > threshold || 1 - winProbability > threshold) {
    return true;
  }
  return false
}

/** Input SquadJS players array.
 * Output array of arrays of steamIDs corresponding to every squad in players array.
 */
export function playersToSquadSteamIDArrays(players) {
  let squads = {};
  for (const player of players) {
    let squadID = `${player.teamID} ${player.squadID}`;
    if (squads[squadID] == null) {
      squads[squadID] = [player.steamID];
    } else {
      squads[squadID].push(player.steamID)
    }
  }
  return Object.values(squads)
}

/** Input SquadJS players array.
 * Output array of steamIDs for each team.
 */
export function playersToTeamsSteamIDs(players) {
  let team1 = [], team2 = [];
  for (const player of players) {
    if (player.teamID == 1) {
      team1.push(player.steamID);
    } else {
      team2.push(player.steamID);
    }
  }
  return {team1, team2}
}

/** Input target teams as lists of steamIDs.
 * Players not assigned a team will be split between teams to balance player count.
 */
export async function swapToTargetTeams(server, team1, team2) {
  let playerTargetTeams = [];
  team1.forEach(steamID => playerTargetTeams[steamID] = 1);
  team2.forEach(steamID => playerTargetTeams[steamID] = 2);

  // TODO: Can this fail? Does it need to handle an error?
  await server.updatePlayerList();
  let players = server.players.slice(0);

  let team1Size = 0;
  let team2Size = 0;
  let unassignedPlayers = { team1: [], team2: [] };

  for (let player of players) {
    let targetTeam = playerTargetTeams[player.steamID] ?? null;
    if (targetTeam === null) {
      if (player.teamID == 1) {
        unassignedPlayers.team1.push(player);
      } else {
        unassignedPlayers.team2.push(player);
      }
    } else {
      targetTeam == 1 ? team1Size++ : team2Size++;
      if (player.teamID != targetTeam) {
        // TODO: Find out if there needs to be a delay between requests for this to work reliably.
        await this.server.rcon.switchTeam(player.eosID);
      }
    }
  }

  // Move players that weren't part of the target teams to equalise team size.
  let playerCountDifference = (team1Size + unassignedPlayers.team1.length) - (team2Size + unassignedPlayers.team2.length);
  if (playerCountDifference > 0) {
    unassignedPlayers.team1.slice(0, Math.min(Math.floor(playerCountDifference / 2), unassignedPlayers.team1.length)).forEach(async player => await this.server.rcon.switchTeam(player.eosID));
  } else if (playerCountDifference < 0) {
    unassignedPlayers.team2.slice(0, Math.min(Math.floor(playerCountDifference / 2), unassignedPlayers.team2.length)).forEach(async player => await this.server.rcon.switchTeam(player.eosID));
  }
}

async function balanceStragglers(server, teams, stragglers, clans) {
  // TODO: Find clans, if clan member team is more than remaining unassigned players, skip,

  // Sort players by rating
  // If team1 bigger, if team 2 better, send worst player to team 2, otherwise send best player.
  // If team1 smaller, if team 2 better, send best player to team 1, otherwise add worst player.

  let player = null;
  if (teams.team1.length > teams.team2.length) {
    if (teams.team1.rating > teams.team2.rating) {
      // Worst player
      player = stragglers.pop();
    } else {
      // Best player
      player = stragglers.shift();
    }
    if (player.teamID == 2) {
      await this.server.rcon.switchTeam(player.eosID);
    }
    teams.team1.rating += player.rating;
  } else {
    if (teams.team2.rating > teams.team1.rating) {
      // Worst player
      player = stragglers.pop();
    } else {
      // Best player
      player = stragglers.shift();
    }
    if (player.teamID == 1) {
      await this.server.rcon.switchTeam(player.eosID);
    }
    teams.team2.rating += player.rating;
  }
}