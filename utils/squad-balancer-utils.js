// const highs_promise = require("highs")(highs_settings);

// const PROBLEM = `Minimize
//  obj:
//     skillDiff
// Subject To
//  c1: x1.skill x1 + x2.skill x2 - 0.5 skillDiff <= totalSkill/2
//  c2: x1.skill x1 + x2.skill x2 + 0.5 skillDiff >= totalSkill/2
//  c3: (players/2)-1 <= x1.size x1 + x2.size x2 <= (players/2)+1
// Binary
//  x1
//  x2
// End`;


// const glpk = require('glpk.js');
// import { GLPK } from '../../../Testing/node_modules/glpk.js/dist/glpk.js';


function buildModel(groups) {
  // TODO use real values
  const totalPlayers = 100;
  const totalSkill = 5;
  const xNames = groups.map((g, i) => `x_${i}`);

  // Minimise skill gap, absolute value achieved via constraints 2 & 3
  const objective = {
    direction: glpk.GLP_MIN,
    name: 'min_abs_skill_gap',
    vars: [{ name: 'skillGap', coef: 1 }],
  };
  // Constraint 1: teamSize
  const cSize = {
    name: 'player_count',
    vars: xNames.map((name, i) => ({ name, coef: groups[i].size })),
    bnds: { type: glpk.GLP_DB, ub: Math.floor(totalPlayers / 2 + 1), lb: Math.floor(totalPlayers / 2 + 1) },
  };
  // Constraints 2 & 3, absolute skill difference
  const cSkillUpper = {
    name: 'skill_gap_upper',
    vars: [
      ...xNames.map((name, i) => ({ name, coef: groups[i].skill })),
      { name: 'skillGap', coef: -0.5 },
    ],
    bnds: { type: glpk.GLP_UP, ub: totalSkill / 2, lb: 0 }, // (2*S_A - totalSkill) - t <= 0  <=> <= totalSkill with -1*t? We'll fix by setting ub: 0 below.
  };
  const cSkillLower = {
    name: 'skill_gap_lower',
    vars: [
      ...xNames.map((name, i) => ({ name, coef: groups[i].skill })),
      { name: 'skillGap', coef: 0.5 },
    ],
    bnds: { type: glpk.GLP_LO, ub: 0, lb: totalSkill / 2 },
  };

  return {
    name: 'balanced_two_team_partition',
    objective: objective,
    subjectTo: [cSize, cSkillUpper, cSkillLower],
    binaries: [...xNames],
  };
}

function searchSwaps(groups, skillThreshold) {
  const totalSkill = groups.reduce((t, group) => t + group.rating, 0);
  console.log(`totalSkill: ${totalSkill}`);
  const totalPlayers = groups.reduce((t, group) => t + group.members.length, 0);
  console.log(`totalPlayers: ${totalPlayers}`);
  const averageSkill = totalSkill / totalPlayers;
  console.log(`Average Rating: ${averageSkill}`);
  const threshold = (totalSkill / 2) + 2 * averageSkill;

  const maxSwapOptions = 2 ** groups.length;
  let swapNumber = 0;

  let currentBest = { option: null, skillGap: Infinity, movedPlayers: Infinity };
  let currentBestMinMoves = { option: null, skillGap: Infinity, movedPlayers: Infinity };

  permutationLoop:
  for (swapNumber; swapNumber < maxSwapOptions; swapNumber++) {
    let bitset = swapNumber.toString(2);
    let includedPlayers = 0;
    let rejectedPlayers = 0;
    let includedSkill = 0;
    let rejectedSkill = 0;
    let movedPlayers = 0;
    for (let i = 0; i < groups.length; i++) {
      if (bitset[i] === '1') {
        includedPlayers += groups[i].members.length;
        includedSkill += groups[i].rating;
        movedPlayers += groups[i].members.length - groups[i].team;
      } else {
        rejectedPlayers += groups[i].members.length;
        rejectedSkill += groups[i].rating;
      }
      if (includedPlayers > totalPlayers / 2 || rejectedPlayers > totalPlayers / 2 || includedSkill >= threshold || rejectedSkill >= threshold) {
        continue permutationLoop
      }
    }
    let skillGap = Math.abs(includedSkill - totalSkill / 2);
    if (skillGap < currentBest.skillGap) {
      currentBest.option = bitset;
      currentBest.skillGap = skillGap;
      currentBest.movedPlayers = movedPlayers;
      console.log(`New Best: ${movedPlayers}, ${skillGap}, ${bitset}`);
    }
    if (movedPlayers <= currentBestMinMoves.movedPlayers) {
      if (skillGap < currentBestMinMoves.skillGap) {
        currentBestMinMoves.option = bitset;
        currentBestMinMoves.skillGap = skillGap;
        currentBestMinMoves.movedPlayers = movedPlayers;
      }
    }
  }
  let results = {
    best: currentBest.option,
    minMoves: currentBestMinMoves.option
  }
  return results
}

function bitsetToString(bitset) {
  let string = "";
  bitset.forEach(e => string += e ? 1 : 0);
  return string;
}

function searchSwaps2(groups) {
  const totalSkill = groups.reduce((t, group) => t + group.rating, 0);
  console.log(`totalSkill: ${totalSkill}`);
  const totalPlayers = groups.reduce((t, group) => t + group.members.length, 0);
  console.log(`totalPlayers: ${totalPlayers}`);
  const averageSkill = totalSkill / totalPlayers;
  console.log(`Average Rating: ${averageSkill}`);
  const upperBound = (totalSkill / 2) + 2 * averageSkill;
  const lowerBound = (totalSkill / 2) - 2 * averageSkill;

  let currentBest = { option: null, skillGap: Infinity, movedPlayers: Infinity };
  let currentBestMinMoves = { option: null, skillGap: Infinity, movedPlayers: Infinity };

  let bitset = new Array(groups.length).fill(true);

  let i = 0;
  let includedPlayers = 0;
  let includedSkill = 0;
  let movedPlayers = 0;
  let iterations = 0;
  let done = false;
  while (!done) {
    iterations++;
    includedPlayers += groups[i].members.length;
    includedSkill += groups[i].rating;
    movedPlayers += groups[i].members.length - groups[i].team;
    if (includedPlayers > totalPlayers / 2 || includedSkill >= upperBound) {
      includedPlayers -= groups[i].members.length;
      includedSkill -= groups[i].rating;
      movedPlayers -= groups[i].members.length - groups[i].team;
      bitset[i] = false;
    }
    i++;
    if (i == groups.length) {
      if (iterations > 40000000) { break };
      if (includedPlayers == totalPlayers / 2) {
        let skillGap = Math.abs(includedSkill - totalSkill / 2);
        if (skillGap < currentBest.skillGap) {
          currentBest.option = bitset.slice(0);
          currentBest.skillGap = skillGap;
          currentBest.movedPlayers = movedPlayers;
          // console.log(`New Best: ${movedPlayers}, ${skillGap}, ${bitsetToString(bitset)}`);
          // console.log(iterations);
        }
        if (movedPlayers <= currentBestMinMoves.movedPlayers && skillGap < currentBestMinMoves.skillGap) {
          currentBestMinMoves.option = bitset.slice(0);
          currentBestMinMoves.skillGap = skillGap;
          currentBestMinMoves.movedPlayers = movedPlayers;
        }
      }
      i--;
      if (bitset[i]) {
        includedPlayers -= groups[i].members.length;
        includedSkill -= groups[i].rating;
        movedPlayers -= groups[i].members.length - groups[i].team;
        // TODO: Check if current value is better or not??? Maybe?
        bitset[i] = false;
      }
      while (!bitset[i] && i > 0) {
        bitset[i] = true;
        i--;
      }
      if (i == 0 && !bitset[i]) {
        done = true;
      } else {
        includedPlayers -= groups[i].members.length;
        includedSkill -= groups[i].rating;
        movedPlayers -= groups[i].members.length - groups[i].team;
        bitset[i] = false;
        i++;
      }
    }
  }
  console.log(`Final Result: ${currentBest.movedPlayers}, ${currentBest.skillGap}, ${bitsetToString(currentBest.option)}`);
  console.log(`Min Moves: ${currentBestMinMoves.movedPlayers}, ${currentBestMinMoves.skillGap}, ${bitsetToString(currentBestMinMoves.option)}`);
  console.log(iterations);
  let results = {
    best: currentBest.option,
    minMoves: currentBestMinMoves.option
  }

  return results
}

function searchSwaps3(groups) {
  const totalSkill = groups.reduce((t, group) => t + group.rating, 0);
  console.log(`totalSkill: ${totalSkill}`);
  const totalPlayers = groups.reduce((t, group) => t + group.members.length, 0);
  console.log(`totalPlayers: ${totalPlayers}`);
  const averageSkill = totalSkill / totalPlayers;
  console.log(`Average Rating: ${averageSkill}`);
  const upperBound = (totalSkill / 2) + 2 * averageSkill;
  const lowerBound = (totalSkill / 2) - 2 * averageSkill;

  let currentBest = { option: null, skillGap: Infinity, movedPlayers: Infinity };
  let currentBestMinMoves = { option: null, skillGap: Infinity, movedPlayers: Infinity };

  let bitset = new Array(groups.length).fill(true);

  let i = 0;
  let includedPlayers = 0;
  let rejectedPlayers = 0;
  let includedSkill = 0;
  let rejectedSkill = 0;
  let movedPlayers = 0;
  let iterations = 0;
  let done = false;
  while (!done) {
    iterations++;
    bitset[i] = true;
    movedPlayers += groups[i].members.length - groups[i].team;
    includedPlayers += groups[i].members.length;
    includedSkill += groups[i].rating;
    if (includedPlayers > totalPlayers / 2 || includedSkill >= upperBound) {
      movedPlayers -= groups[i].members.length - groups[i].team;
      includedPlayers -= groups[i].members.length;
      rejectedPlayers += groups[i].members.length;
      includedSkill -= groups[i].rating;
      rejectedSkill += groups[i].rating;
      bitset[i] = false;
    }
    if ((totalSkill - rejectedSkill) < lowerBound || (totalPlayers - rejectedPlayers) < totalPlayers / 2) {
      // i--;
      // console.log(bitsetToString(bitset));
      bitset[i] = false;
      while (!bitset[i] && i > 0) {
        rejectedSkill -= groups[i].rating;
        rejectedPlayers -= groups[i].members.length;
        bitset[i] = true;
        i--;
      }
      movedPlayers -= groups[i].members.length - groups[i].team;
      includedPlayers -= groups[i].members.length;
      rejectedPlayers += groups[i].members.length;
      includedSkill -= groups[i].rating;
      rejectedSkill += groups[i].rating;
      bitset[i] = false;
    }
    i++;
    if (i == groups.length) {
      // console.log(bitsetToString(bitset));
      if (iterations > 40000000) { break };
      if (includedPlayers == totalPlayers / 2) {
        let skillGap = Math.abs(includedSkill - totalSkill / 2);
        if (skillGap < currentBest.skillGap) {
          currentBest.option = bitset.slice(0);
          currentBest.skillGap = skillGap;
          currentBest.movedPlayers = movedPlayers;
          // console.log(`New Best: ${movedPlayers}, ${skillGap}, ${bitsetToString(bitset)}`);
          // console.log(iterations);
        }
        if (movedPlayers <= currentBestMinMoves.movedPlayers && skillGap < currentBestMinMoves.skillGap) {
          currentBestMinMoves.option = bitset.slice(0);
          currentBestMinMoves.skillGap = skillGap;
          currentBestMinMoves.movedPlayers = movedPlayers;
        }
      }
      i--;
      if (bitset[i]) {
        movedPlayers -= groups[i].members.length - groups[i].team;
        includedPlayers -= groups[i].members.length;
        rejectedPlayers -= groups[i].members.length;
        includedSkill -= groups[i].rating;
        rejectedSkill -= groups[i].rating;
        // TODO: Check if current value is better or not??? Maybe?
        bitset[i] = false;
      }
      while (!bitset[i] && i > 0) {
        rejectedSkill -= groups[i].rating;
        rejectedPlayers -= groups[i].members.length;
        bitset[i] = true;
        i--;
      }
      if (i == 0 && !bitset[i]) {
        done = true;
      } else {
        movedPlayers -= groups[i].members.length - groups[i].team;
        includedPlayers -= groups[i].members.length;
        rejectedPlayers -= groups[i].members.length;
        includedSkill -= groups[i].rating;
        rejectedSkill -= groups[i].rating;
        bitset[i] = false;
        i++;
      }
    }
  }
  console.log(`Final Result: ${movedPlayers}, ${currentBestMinMoves.skillGap}, ${bitsetToString(currentBest.option)}`);
  console.log(iterations);
  let results = {
    best: currentBest.option,
    minMoves: currentBestMinMoves.option
  }

  return results
}

function findSkipAhead(arr, start, target) {
  let end = arr.length - 1;

  // Skip to end if target is too low.
  if (target < arr[end]) return end
  // No skip required
  if (target > arr[start]) return 0

  // Iterate while start not meets end
  while (start <= end) {

    // Find the mid index
    let mid = Math.floor((start + end) / 2);

    //look in left or
    // right half accordingly
    if (arr[mid] < target) {
      if (start === mid || start === end) {
        return start
      }
      start = mid + 1;
    } else {
      end = mid - 1;
    }
  }

  return start;
}

function preProcessGroups(groups) {

  let totalPlayers = 0;
  let totalSkill = 0;
  let occurences = new Array(MAX_SQUAD_SIZE + 1).fill(0).map(groupSize => groupSize = []);
  groups.forEach((group, i) => {
    totalPlayers += group.members.length;
    totalSkill += group.rating;
    occurences[group.members.length].push(i);
  });

  const minTeamSize = Math.floor(totalPlayers / 2) - ALLOWABLE_PLAYER_DIFFERENCE;
  const maxTeamSize = minTeamSize + 2 * ALLOWABLE_PLAYER_DIFFERENCE;

  let maxPossibleSkillForNext = new Array(maxTeamSize).map((playersNeeded, i) => playersNeeded = new Float32Array(maxPossibleSkillForNext.length - i - 1));
  // maxPossibleSkillForNext.forEach;

  let occurenceTrack = new Int8Array(occurences.length).fill(0);
  let currentOccurences = new Float32Array(occurences.length);
  let currentBest = new Float32Array(maxTeamSize).fill(NaN);
  occurences.forEach((groupSize, i) => { currentBest[i] = (groups[groupSize[0]]?.rating ?? NaN) });

  /** Pre-allocate processing block,
   * Each row of row number (n) contains sums of ratings of every combination of group size that can make up number (n).
   * Row lengths based on the combinations available to make each number.
   * e.g. 1 can only be 1, 2 can be made with 2 or 1+1, 3 can be made with 3 or 1+2, 4 with 4, 1+3, or 2+2.
   * Thus arrays are allocated with lengths 1, then 2 2, 3 3, etc.
   * Columns are based on combination, column 0 is groups of exactly size (n).
   * Column (k) is combination of (k) and (n)-(k).
   * Include empty row 0 because it makes the indexing logic slightly less confusing than it already is. */
  let processingBlock = new Array(Math.min(maxTeamSize, 20));
  let rowLength = 1;
  for (let k = 1; k < processingBlock.length; k++) {
    rowLength += (k - 1) % 2;
    processingBlock[k] = new Float32Array(rowLength);

    // Pre-fill with first occurence of base case i.e. group size == (n)
    if (k < occurences.length) {
      processingBlock[k][0] = groups[occurences[k][0]]?.rating ?? NaN;
    } else {
      processingBlock[k][0] = NaN;
    }
    // Fill remaing entries for row.
    for (let m = 1; m < processingBlock[k].length; m++) {
      let newValue = NaN;
      if (m === k - 1) {
        newValue = currentBest[k - 1] + groups[occurences[k - 1][occurenceTrack[k - 1]] + 1].rating;
      } else {
        newValue = currentBest[m] + currentBest[k - 1];
      }
      processingBlock[k][m] = newValue;

      if (newValue != NaN && (currentBest[m] === NaN || currentBest[m] < newValue)) {
        currentBest[k] = newValue;
      }
    }
  }

  let groupSize = null;
  groups.forEach((group, i) => {
    if (i == 0) {
      maxPossibleSkillForNext[0] = currentBest.slice(0);
    } else {
      groupSize = group.members.length;
      if (processingBlock[groupSize][0] == currentBest[groupSize]) {
        processingBlock[groupSize][0] = group.rating;
        occurenceTrack[groupSize] += 1;
        for (let k = groupSize + 1; k < processingBlock.length; k++) {
          for (let m = 1; m < k - groupSize + 1; m++) {
            let newValue = NaN;
            if (m === k) {
              processingBlock[k][m] = currentBest[m] + groups[occurences[k][occurenceTrack[k]] + 1].rating ?? NaN;
            } else {
              processingBlock[k][m] = currentBest[m] + currentBest[k - 1];
            }
            processingBlock[k][m] = newValue;

            if (newValue != NaN && (currentBest[m] === NaN || currentBest[m] < newValue)) {
              currentBest[m] = newValue;
            }
          }
        }
      } else {
        processingBlock[groupSize][0] = group.rating;
        occurenceTrack[groupSize] += 1;
      }
      maxPossibleSkillForNext[i] = currentBest.slice(0);
    }
  });

  let minSkillRemaining = new Float32Array(groups.length + 1);
}

/** Exhaustive search of all combinations to find optimal solution.
 * Only works for groups of size 1.
 * Not viable above ~32 groups.
 */
function searchSwaps4(groups) {
  const totalSkill = groups.reduce((t, group) => t + group.rating, 0);
  const targetSkill = totalSkill / 2;
  console.log(`totalSkill: ${totalSkill}`);
  const totalPlayers = groups.reduce((t, group) => t + group.members.length, 0);
  console.log(`totalPlayers: ${totalPlayers}`);
  const averageSkill = totalSkill / totalPlayers;
  console.log(`Average Rating: ${averageSkill}`);

  const playersRemainingMap = new Array(groups.length);
  playersRemainingMap[playersRemainingMap.length - 1] = groups[groups.length - 1].members.length;
  for (let i = groups.length - 2; i >= 0; i--) {
    playersRemainingMap[i] = playersRemainingMap[i + 1] + groups[i].members.length;
  }


  const lowestPossibleSkillRemaining = new Array(groups.length + 1).fill(0);
  lowestPossibleSkillRemaining[0] = 0;
  for (let i = 1; i < lowestPossibleSkillRemaining.length; i++) {
    lowestPossibleSkillRemaining[i] = lowestPossibleSkillRemaining[i - 1] + groups[groups.length - i].rating;
  }

  const maxPossibleSkillForNext = new Array(totalPlayers + 1);
  for (let i = 0; i < maxPossibleSkillForNext.length; i++) {
    maxPossibleSkillForNext[i] = new Array(maxPossibleSkillForNext.length - i);
  }
  maxPossibleSkillForNext[0].fill(0);
  for (let j = 0; j < maxPossibleSkillForNext[1].length; j++) {
    maxPossibleSkillForNext[1][j] = groups[j].rating;
  }
  for (let i = 2; i < maxPossibleSkillForNext.length; i++) {
    for (let j = 0; j < maxPossibleSkillForNext[i].length; j++) {
      maxPossibleSkillForNext[i][j] = maxPossibleSkillForNext[i - 1][j] + maxPossibleSkillForNext[1][i - 1];
    }
  }

  let currentBest = { option: null, rating: Infinity, movedPlayers: Infinity };
  let currentBestMinMoves = { option: null, rating: Infinity, movedPlayers: Infinity };

  let bitset = new Array(groups.length).fill(null);

  const playerTarget = totalPlayers / 2;
  let includedPlayers = 0;
  let includedSkill = 0;
  let movedPlayers = 0;
  let playersNeeded = playerTarget - includedPlayers;
  let playersRemaining = totalPlayers;
  let skillUpperBound = Infinity;
  let skillLowerBound = -Infinity;
  let i = 0;
  let iterations = 0;
  let stack = new Int8Array(groups.length);
  let stackPointer = 0;
  while (true) {
    iterations++;

    // playersRemaining = playersRemainingMap[i]
    if (playersNeeded > playersRemainingMap[i]
      || (includedSkill + lowestPossibleSkillRemaining[playersNeeded]) > skillUpperBound
      || (includedSkill + maxPossibleSkillForNext[playersNeeded][i] ?? -Infinity) <= skillLowerBound
      // || (includedSkill + maxPossibleSkillForNext[i]) <= skillLowerBound
      || i == groups.length) {

      i = stack[--stackPointer];
      if (stackPointer < 0) {
        break;
      }

      movedPlayers -= groups[i].members.length - groups[i].team;
      includedPlayers -= groups[i].members.length;
      includedSkill -= groups[i].rating;
      playersNeeded = playerTarget - includedPlayers;
      bitset[i] = false;
      i++;
      continue
    }

    if (groups[i].members.length <= playersNeeded) {
      bitset[i] = true;
      movedPlayers += groups[i].members.length - groups[i].team;
      includedPlayers += groups[i].members.length;
      includedSkill += groups[i].rating;
      playersNeeded = playerTarget - includedPlayers;
      stack[stackPointer++] = i;
    } else {
      bitset[i] = false;
    }

    // console.log(bitsetToString(bitset));
    if (playersNeeded == 0) {
      let skillGap = Math.abs(includedSkill - targetSkill);
      let oldSkillGap = Math.abs(currentBest.rating - targetSkill);
      if (skillGap < oldSkillGap) {
        skillUpperBound = targetSkill + skillGap;
        skillLowerBound = targetSkill - skillGap;
        currentBest.option = bitset.slice(0);
        currentBest.rating = includedSkill;
        currentBest.movedPlayers = movedPlayers;
        // console.log(`New Best: ${movedPlayers}, ${Math.abs(currentBest.rating - targetSkill)}, ${bitsetToString(bitset)}`);
        // console.log(iterations);
      }
      if (i == stack[stackPointer - 1]) {
        movedPlayers -= groups[i].members.length - groups[i].team;
        includedPlayers -= groups[i].members.length;
        includedSkill -= groups[i].rating;
        playersNeeded = playerTarget - includedPlayers;
        stackPointer--;
        bitset[i] = false;
      }
    }
    i++;
  }
  console.log(`Final Result: ${currentBest.movedPlayers}, ${Math.abs(currentBest.rating - targetSkill)}, ${bitsetToString(currentBest.option)}`);
  console.log(iterations);
  let results = {
    best: currentBest.option,
    minMoves: currentBestMinMoves.option
  }

  return results
}

function searchSwaps5(inputGroups, threshold = -Infinity) {
  const groups = inputGroups.slice(0).sort((a, b) => b.rating - a.rating);
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

  let currentBest = { finalTeam: null, rating: Infinity, movedPlayers: Infinity };

  let includedSkill = 0;
  let includedPlayers = 0;
  let movedPlayers = 0;
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

      movedPlayers -= groups[i].members.length - groups[i].team;
      includedPlayers -= groups[i].members.length;
      includedSkill -= groups[i].rating;
      playersNeeded = playerTarget - includedPlayers;
      i++;
      continue
    }

    if (groups[i].members.length <= playersNeeded) {
      movedPlayers += groups[i].members.length - groups[i].team;
      includedPlayers += groups[i].members.length;
      includedSkill += groups[i].rating;
      playersNeeded = playerTarget - includedPlayers;
      stack[stackPointer++] = i;
    }

    if (playersNeeded == 0) {
      let skillGap = Math.abs(includedSkill - targetSkill);
      let oldSkillGap = Math.abs(currentBest.rating - targetSkill);
      if (skillGap < oldSkillGap) {
        skillLowerBound = targetSkill - skillGap;
        currentBest.finalTeam = stack.slice(0, stackPointer);
        currentBest.rating = includedSkill;
        currentBest.movedPlayers = movedPlayers;
        // console.log(`New Best: ${movedPlayers}, ${Math.abs(currentBest.rating - targetSkill)}, ${bitsetToString(bitset)}`);
        // console.log(iterations);
      }
      if (skillGap < threshold) break

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
  console.log(`Final Result: ${currentBest.movedPlayers}, ${Math.abs(currentBest.rating - targetSkill)}`);
  console.log(iterations);

  if (Math.abs(currentBest.rating - targetSkill) > threshold) throw new Error("Balancing Failed.")

  return currentBest.finalTeam
}

function searchSwaps6(inputGroups, threshold) {
  const groups = inputGroups.slice(0).sort((a, b) => b.rating - a.rating);
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

  let currentBestMinMoves = { finalTeam: null, rating: Infinity, movedPlayers: Infinity };

  let includedSkill = 0;
  let includedPlayers = 0;
  let movedPlayers = 0;
  let playersNeeded = playerTarget - includedPlayers;
  let skillLowerBound = -Infinity;
  let i = 0;
  let iterations = 0;
  let stack = new Int8Array(groups.length);
  let stackPointer = 0;
  while (true) {
    iterations++;

    if (playersNeeded > playersRemaining[i]
      || movedPlayers > currentBestMinMoves.movedPlayers
      || includedSkill + maxSkillFrom[i] <= targetSkill - threshold
      || (movedPlayers === currentBestMinMoves.movedPlayers && includedSkill + maxSkillFrom[i] <= skillLowerBound)
      || i == groups.length) {

      i = stack[--stackPointer];
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
      let oldSkillGapMinMoves = Math.abs(currentBestMinMoves.rating - targetSkill);
      if ((movedPlayers < currentBestMinMoves.movedPlayers && skillGap < threshold)
        || (movedPlayers == currentBestMinMoves.movedPlayers && skillGap < oldSkillGapMinMoves)) {
        skillLowerBound = targetSkill - skillGap;
        currentBestMinMoves.finalTeam = stack.slice(0, stackPointer);
        currentBestMinMoves.rating = includedSkill;
        currentBestMinMoves.movedPlayers = movedPlayers;
        // console.log(`New Best: ${currentBestMinMoves.movedPlayers}, ${Math.abs(currentBestMinMoves.rating - targetSkill)}, ${bitsetToString(bitset)}`);
        // console.log(iterations);
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
  console.log(`Min Moves: ${currentBestMinMoves.movedPlayers}, ${Math.abs(currentBestMinMoves.rating - targetSkill)}`);
  console.log(iterations);

  if (Math.abs(currentBestMinMoves.rating - targetSkill) > threshold) throw new Error("Balancing Failed.")

  return currentBestMinMoves.finalTeam
}

function searchSwaps7(groups, threshold = 0.005, minMoves = false) {
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

  let currentBest = { finalTeam: null, rating: Infinity, movedPlayers: Infinity };
  let currentBestMinMoves = { finalTeam: null, rating: Infinity, movedPlayers: Infinity };

  let includedSkill = 0;
  let includedPlayers = 0;
  let movedPlayers = 0;
  let playersNeeded = playerTarget - includedPlayers;
  let skillLowerBound = -Infinity;
  let i = 0;
  let iterations = 0;
  let stack = new Int8Array(groups.length);
  let stackPointer = 0;
  while (true) {
    iterations++;

    if (playersNeeded > playersRemaining[i]
      || (!minMoves && (includedSkill + maxSkillFrom[i]) <= skillLowerBound)
      || (minMoves && (
        (includedSkill + maxSkillFrom[i] <= targetSkill - threshold)
        || movedPlayers > currentBestMinMoves.movedPlayers)
        || (movedPlayers === currentBestMinMoves.movedPlayers && includedSkill + maxSkillFrom[i] <= skillLowerBound))
      || i == groups.length) {

      i = stack[--stackPointer];
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

    if ((!minMoves && groups[i].members.length <= playersNeeded)
      || (minMoves && groups[i].members.length <= playersNeeded
        && movedPlayers + groups[i].team <= currentBestMinMoves.movedPlayers)
    ) {
      movedPlayers += groups[i].members.length - groups[i].team;
      includedPlayers += groups[i].members.length;
      includedSkill += groups[i].rating;
      playersNeeded = playerTarget - includedPlayers;
      stack[stackPointer++] = i;
    }

    if (playersNeeded == 0) {
      let skillGap = Math.abs(includedSkill - targetSkill);
      let oldSkillGap = Math.abs(currentBest.rating - targetSkill);
      let oldSkillGapMinMoves = Math.abs(currentBestMinMoves.rating - targetSkill);
      if (minMoves) {
        if ((movedPlayers < currentBestMinMoves.movedPlayers && skillGap < threshold)
          || (movedPlayers == currentBestMinMoves.movedPlayers && skillGap < oldSkillGapMinMoves)) {
          skillLowerBound = targetSkill - skillGap;
          currentBestMinMoves.finalTeam = stack.slice(0, stackPointer);
          currentBestMinMoves.rating = includedSkill;
          currentBestMinMoves.movedPlayers = movedPlayers;
          // console.log(`New Best: ${currentBestMinMoves.movedPlayers}, ${Math.abs(currentBestMinMoves.rating - targetSkill)}, ${bitsetToString(bitset)}`);
          // console.log(iterations);
        }
      } else if (skillGap < oldSkillGap) {
        skillLowerBound = targetSkill - skillGap;
        currentBest.finalTeam = stack.slice(0, stackPointer);
        currentBest.rating = includedSkill;
        currentBest.movedPlayers = movedPlayers;
        // console.log(`New Best: ${movedPlayers}, ${Math.abs(currentBest.rating - targetSkill)}, ${bitsetToString(bitset)}`);
        // console.log(iterations);
        if (skillGap < threshold) {
          break
        }
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
  console.log(`Final Result: ${currentBest.movedPlayers}, ${Math.abs(currentBest.rating - targetSkill)}`);
  console.log(`Min Moves: ${currentBestMinMoves.movedPlayers}, ${Math.abs(currentBestMinMoves.rating - targetSkill)}`);
  console.log(iterations);
  let results = {
    best: currentBest.finalTeam,
    minMoves: currentBestMinMoves.finalTeam
  }

  return results
}

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
}

/** Logistic regression model based on MySquadStats data. */
export class LogisticRegressionRater {
  constructor(playerStats) {
    super();
    this.playerStats = playerStats;
    this.avgStats = playerStats.values().reduce((total, x) => {
      total.kdr += x.kdr;
      total.playTime += x.playTime;
      total.score += x.score;
      total.count += x.count;
      return total
    },
      { kdr: 0, playTime: 0, score: 0, count: 0 });
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
    return this.logisticRegressionFormula(playerStats, this.avgStats)
  }

  rateGroup(steamIDs) {
    const average = this.averageStats(steamIDs);
    return this.logisticRegressionFormula(average, this.avgStats)
  }

  /** Calculate probability of teamA winning over teamB. */
  winProbability(teamA, teamB) {
    const averageA = this.averageStats(teamA);
    const averageB = this.averageStats(teamB);
    return this.logisticRegressionFormula(averageA, averageB)
  }

  logisticRegressionFormula(statsA, statsB) {
    const diff = {};
    diff.kdr = statsA.kdr - statsB.kdr;
    diff.playTime = statsA.playTime - statsB.playTime;
    diff.score = statsA.score - statsB.score;
    // TODO: use actual formula.
    return 1 * (diff.kdr)
  }

  averageStats(players) {
    const avgStats = {
      kdr: 0,
      playTime: 0,
      score: 0,
      count: 0,
    }

    for (const player of players) {
      const stats = this.playerStats[player.steamID];
      if (stats == null) {
        console.log(`Missing stats for playerID: ${player.steamID}`);
        continue
      }
      avgStats.kdr += stats.kdr;
      avgStats.playTime += stats.playTime;
      avgStats.score += stats.score;
      avgStats.count += 1;
    }

    avgStats.kdr /= avgStats.count;
    avgStats.playTime /= avgStats.count;
    avgStats.score /= avgStats.count;

    return avgStats
  }
}

export function shouldBalance(winProbability, threshold) {
  if (winProbability > threshold || 1 - winProbability > threshold) {
    return true;
  }
  return false
}

/** Input SquadJS players array.
 * Output array of arrays of steamIDs corresponding to every squad in players array. */
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

export async function balanceStragglers(server, teams, stragglers, clans) {
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

/** Calculate target teams for balanced match.
   * Keeps supplied playerGroups together, groups could be squads, or clans.
   * squads - List of lists of steam IDs. Each list represents a squad or grouping of players that will be kept together.
   * clans - Grouped before squads so clan members in a pub squad will be moved with their clan, not their squad.
   * minMoves - If true, will attempt to find the target teams with the fewest player team switches which satisfies threshold
   *            If threshold is < 0 this will just be a slower version of running without minMoves.
   * threshold - allowable skill difference between teams. */
export function calculateTargetTeams(rater, players, squads = [], clans = [], threshold = 0, minMoves = false) {
  const clanGroups = {};
  const squadGroups = {};
  const individualGroups = [];

  for (const player of players) {
    // TODO: Decide on format of clans we pass in.
    const clan = clans.find(clan => clan.some(member => member === player.steamID));
    if (clan != null) {
      if (clanGroups[clan.ID] == null) {
        clanGroups[clan.ID] = {
          rating: rater.rate(player.steamID),
          team: player.teamID === 1 ? 1 : 0,
          members: [player.steamID],
        };
      } else {
        clanGroups[clan.ID].rating += rater.rate(player.steamID);
        clanGroups[clan.ID].team += player.teamID === 1 ? 1 : 0;
        clanGroups[clan.ID].members.push(player.steamID);
      }
    } else {
      const squadIndex = squads.findIndex(squad => squad.some(member => member.steamID === player.steamID));
      if (squadIndex > 0) {
        if (squadGroups[squadIndex] == null) {
          squadGroups[squadIndex] = {
            rating: rater.rate(player.steamID),
            team: player.teamID === 1 ? 1 : 0,
            members: [player.steamID],
          };
        } else {
          squadGroups[squadIndex].rating += rater.rate(player.steamID);
          squadGroups[squadIndex].team += player.teamID === 1 ? 1 : 0;
          squadGroups[squadIndex].members.push(player.steamID);
        }
      } else {
        individualGroups.push({ rating: rater.rate(player.steamID), members: [player.steamID], team: player.teamID === 1 ? 1 : 0 })
      }
    }
  }

  const groups = [];
  groups.push(...Object.values(clanGroups), ...Object.values(squadGroups), ...individualGroups);

  if (minMoves) {
    if (groups.length > 30) {
      return this.fastBalanceMinMoves(groups, threshold)
    } else {
      return searchSwaps6(groups, threshold)
    }
  } else {
    if (groups.length > 30) {
      return this.fastBalance(groups, rater.rateGroup)
    } else {
      return searchSwaps5(groups)
    }
  }

  // groups.sort((a, b) => a.members.length - b.members.length);
  // const result1 = searchSwaps2(groups)

  // groups.sort((a, b) => a.rating - b.rating);
  // groups.sort((a, b) => b.rating - a.rating);
  // groups.sort((a, b) => b.members.length - a.members.length);
  // const result2 = searchSwaps2(groups)

  // const problem = buildModel(groups);
  // const result = glpk.solve(problem, { tmlim: 30 });
  // const result1 = searchSwaps(groups)
  // groups.sort((a, b) => a.rating - b.rating);

  // let result2 = searchSwaps2(groups)
  // groups.sort((a, b) => b.rating - a.rating);
  // result2 = searchSwaps2(groups)
  // groups.sort((a, b) => a.rating - b.rating);
  // result2 = searchSwaps2(groups)
  // groups.sort((a, b) => b.members.length - a.members.length);
  // result2 = searchSwaps2(groups)
  // groups.sort((a, b) => a.members.length - b.members.length);
  // result2 = searchSwaps2(groups)

  groups.sort((a, b) => b.rating - a.rating);
  // let result4 = searchSwaps4(groups)
  // let result5 = searchSwaps5(groups);
  let result6 = searchSwaps6(groups, 0.005, false);
  // result6 = searchSwaps6(groups, true);



  const team1Players = [];
  const team2Players = [];
  groups.forEach((group, i) => {
    if (result.vars[`x_${i}`]) {
      team1Players.push(...group.members);
    } else {
      team1Players.push(...group.members);
    }
  });

  return [team1Players, team2Players]
}

/** Assumes that group sizes are small enough that we can more or less treat them like individual players.
   * Should be very fast to compute but close enough to optimal balance.
   */
function fastBalance(groups, groupRatingFunction) {
  let team1Rating = 0;
  let team2Rating = 0;
  let team1Size = 0;
  let team2Size = 0;
  let groupAssignments = new Array(groups.length).fill(null);

  let remainingPlayers = groups.reduce((playerCount, group) => playerCount += group.members.length, 0);
  let workingGroups = groups.slice(0).sort((a, b) => groupRatingFunction(a.members) - groupRatingFunction(b.members));

  let i = 0;
  let group = null;
  let iterations = 0;
  let iterationLimit = workingGroups.length * 1.5;
  while (i < workingGroups.length) {
    // This shouldn't happen but good to know if it can.
    if (iterations > iterationLimit) throw new Error('Balance impossible, exceeded iteration limit.');

    group = workingGroups[i];

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
    move(workingGroups, k, i);
    i++;
  }
  let targetTeams = { team1: [], team2: [] };
  groupAssignments.forEach((assignment, i) => {
    if (assignment == 1) {
      targetTeams.team1.push(...workingGroups[i].members);
    } else {
      targetTeams.team2.push(...workingGroups[i].members);
    }
  });
  return targetTeams
}

function fastBalanceMinMoves(groups, groupRatingFunction) {
  let team1 = { members: [], rating: 0 };
  let team2 = { members: [], rating: 0 };
  // let groupAssignments = new Array(groups.length).fill(null);

  groups.forEach((group) => {
    if (group.members.length - group.team > 0) {
      team1.rating += group.rating;
      team1.members.push(group);
    } else {
      team2.rating += group.rating;
      team2.members.push(group);
    }
  });

  team1.sort((a, b) => groupRatingFunction(a.members) - groupRatingFunction(b.members));
  team2.sort((a, b) => groupRatingFunction(a.members) - groupRatingFunction(b.members));

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

function calculatePlayerFullBalanceMoves(players, ratingFunction) {
  let team1Rating = 0;
  let team2Rating = 0;
  let team1Players = [];
  let team2Players = [];

  let sortedPlayers = players.slice(0).sort((a, b) => ratingFunction(a.steamID) - ratingFunction(b.steamID));

  for (const player of sortedPlayers) {
    if (team1Players.length < team2Players.length
      || (team1Players.length === team2Players.length && team1Rating < team2Rating)) {
      team1Players.push(player.steamID);
      team1Rating += ratingFunction(player.steamID);
    } else {
      team2Players.push(player.steamID)
      team2Rating += ratingFunction(player.steamID);
    }
  }
  return { team1: team1Players, team2: team2Players }
}

/** Input active players, and squads you want to keep together.
 * Remove players that are no longer active from each squad, discard squads of one person. */
function filterSquads(players, squads) {
  const filteredSquads = squads.map(squad =>
    squad.filter(player =>
      players.some(p =>
        p.steamID === player.steamID)));
  return filteredSquads.filter(squad => squad.length > 1);
}

export class SquadBalancerUtils {
  constructor(options = {}) {
    this.logger = options.logger || {
      verbose: (level, msg) => console.log(`[INFO:${level}] ${msg}`)
    };
  }
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