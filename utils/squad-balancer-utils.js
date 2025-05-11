export default class SquadBalancerUtils {
  constructor(options = {}) {
    this.options = {
      splitSquadsIfNeeded: false,
      maxSkillDifference: 100,
      fallbackSkillRating: 1500,
      verboseLogging: false,
      ...options
    };
    
    this.logger = options.logger || {
      verbose: (level, msg) => console.log(`[INFO:${level}] ${msg}`)
    };
  }

  calculateSquadSkillRatings(teams, playerData) {
    const squadSkillData = {};
    
    for (const teamName in teams) {
      squadSkillData[teamName] = {};
      
      for (const squadID in teams[teamName]) {
        const squad = teams[teamName][squadID];
        
        if (!squad || squad.length === 0) continue;
        
        let totalSkill = 0;
        let playerCount = 0;
        
        for (const player of squad) {
          if (!player.steamID) continue;
          
          const playerSkillData = playerData[player.steamID];
          if (playerSkillData) {
            totalSkill += playerSkillData.skillRating;
            playerCount++;
          }
        }
        
        const avgSkill = playerCount > 0 ? totalSkill / playerCount : this.options.fallbackSkillRating;
        
        squadSkillData[teamName][squadID] = {
          avgSkill: parseFloat(avgSkill.toFixed(2)),
          totalSkill: totalSkill,
          playerCount: playerCount,
          size: squad.length
        };
        
        if (this.options.verboseLogging) {
          this.logger.verbose(2, `${teamName} Squad ${squadID}: Avg Elo = ${avgSkill.toFixed(2)}, Size = ${squad.length}`);
        }
      }
    }
    
    return squadSkillData;
  }

  calculateTeamSkillRatings(squadSkillData) {
    const teamSkills = {
      Team1: { totalSkill: 0, playerCount: 0 },
      Team2: { totalSkill: 0, playerCount: 0 }
    };
    
    for (const teamName of ['Team1', 'Team2']) {
      for (const squadID in squadSkillData[teamName]) {
        const squadData = squadSkillData[teamName][squadID];
        teamSkills[teamName].totalSkill += squadData.totalSkill;
        teamSkills[teamName].playerCount += squadData.playerCount;
      }
      
      teamSkills[teamName].avgSkill = teamSkills[teamName].playerCount > 0 ? 
                                      teamSkills[teamName].totalSkill / teamSkills[teamName].playerCount : 
                                      this.options.fallbackSkillRating;
    }
    
    return teamSkills;
  }

  calculateOptimalSquadMoves(squadSkillData) {
    const moves = [];
    
    const teamSkills = this.calculateTeamSkillRatings(squadSkillData);
    let team1Skill = teamSkills.Team1.totalSkill;
    let team2Skill = teamSkills.Team2.totalSkill;
    let team1Count = teamSkills.Team1.playerCount;
    let team2Count = teamSkills.Team2.playerCount;
    
    const team1Squads = {...squadSkillData.Team1};
    const team2Squads = {...squadSkillData.Team2};
    
    const initialAvgSkill1 = team1Count > 0 ? team1Skill / team1Count : this.options.fallbackSkillRating;
    const initialAvgSkill2 = team2Count > 0 ? team2Skill / team2Count : this.options.fallbackSkillRating;
    let skillDifference = Math.abs(initialAvgSkill1 - initialAvgSkill2);
    
    if (this.options.verboseLogging) {
      this.logger.verbose(2, `Initial skill difference: ${skillDifference.toFixed(2)} Elo points`);
    }
    
    if (skillDifference <= this.options.maxSkillDifference) {
      this.logger.verbose(1, `Teams are already balanced within threshold (${this.options.maxSkillDifference} Elo points)`);
      return moves;
    }
    
    let improved = true;
    let iterations = 0;
    const maxIterations = 10;
    
    while (improved && iterations < maxIterations) {
      improved = false;
      iterations++;
      
      const higherSkillTeam = (team1Count > 0 && team2Count > 0) ? 
                             ((team1Skill / team1Count) > (team2Skill / team2Count) ? "Team1" : "Team2") : 
                             (team1Count > 0 ? "Team1" : "Team2");
      const lowerSkillTeam = higherSkillTeam === "Team1" ? "Team2" : "Team1";
      
      const sourceSquads = higherSkillTeam === "Team1" ? team1Squads : team2Squads;
      
      const sortedSquadIDs = Object.keys(sourceSquads).sort((a, b) => 
        sourceSquads[b].avgSkill - sourceSquads[a].avgSkill
      );
      
      for (const squadID of sortedSquadIDs) {
        const squad = sourceSquads[squadID];
        
        if (!squad || squad.playerCount === 0) continue;
        
        const newTeam1Skill = higherSkillTeam === "Team1" 
          ? team1Skill - squad.totalSkill 
          : team1Skill + squad.totalSkill;
          
        const newTeam2Skill = higherSkillTeam === "Team2" 
          ? team2Skill - squad.totalSkill 
          : team2Skill + squad.totalSkill;
          
        const newTeam1Count = higherSkillTeam === "Team1" 
          ? team1Count - squad.playerCount 
          : team1Count + squad.playerCount;
          
        const newTeam2Count = higherSkillTeam === "Team2" 
          ? team2Count - squad.playerCount 
          : team2Count + squad.playerCount;
        
        const newAvgSkill1 = newTeam1Count > 0 ? newTeam1Skill / newTeam1Count : this.options.fallbackSkillRating;
        const newAvgSkill2 = newTeam2Count > 0 ? newTeam2Skill / newTeam2Count : this.options.fallbackSkillRating;
        const newSkillDifference = Math.abs(newAvgSkill1 - newAvgSkill2);
        
        if (newSkillDifference < skillDifference) {
          this.logger.verbose(1, `Moving Squad ${squadID} from ${higherSkillTeam} to ${lowerSkillTeam} improves balance: ${skillDifference.toFixed(2)} -> ${newSkillDifference.toFixed(2)} Elo difference`);
          
          if (higherSkillTeam === "Team1") {
            team1Skill = newTeam1Skill;
            team2Skill = newTeam2Skill;
            team1Count = newTeam1Count;
            team2Count = newTeam2Count;
            delete team1Squads[squadID];
            team2Squads[squadID] = squad;
          } else {
            team1Skill = newTeam1Skill;
            team2Skill = newTeam2Skill;
            team1Count = newTeam1Count;
            team2Count = newTeam2Count;
            delete team2Squads[squadID];
            team1Squads[squadID] = squad;
          }
          
          moves.push({
            sourceTeam: higherSkillTeam,
            targetTeam: lowerSkillTeam,
            squadID: squadID
          });
          
          skillDifference = newSkillDifference;
          improved = true;
          
          if (skillDifference <= this.options.maxSkillDifference) {
            this.logger.verbose(1, `Balance threshold reached (${skillDifference.toFixed(2)} <= ${this.options.maxSkillDifference} Elo points)`);
            break;
          }
        }
      }
    }
    
    if (this.options.verboseLogging) {
      this.logger.verbose(2, `Final simulated skill difference: ${skillDifference.toFixed(2)} Elo points`);
    }
    return moves;
  }

  calculateOptimalPlayerMoves(teams, playerData) {
    const moves = [];
    
    const team1Players = this.flattenTeam(teams.Team1);
    const team2Players = this.flattenTeam(teams.Team2);
    
    let team1Skill = 0;
    let team2Skill = 0;
    
    team1Players.forEach(player => {
      if (player.steamID && playerData[player.steamID]) {
        team1Skill += playerData[player.steamID].skillRating;
      } else {
        team1Skill += this.options.fallbackSkillRating;
      }
    });
    
    team2Players.forEach(player => {
      if (player.steamID && playerData[player.steamID]) {
        team2Skill += playerData[player.steamID].skillRating;
      } else {
        team2Skill += this.options.fallbackSkillRating;
      }
    });
    
    const team1Avg = team1Players.length > 0 ? team1Skill / team1Players.length : this.options.fallbackSkillRating;
    const team2Avg = team2Players.length > 0 ? team2Skill / team2Players.length : this.options.fallbackSkillRating;
    
    const higherSkillTeam = team1Avg > team2Avg ? "Team1" : "Team2";
    const lowerSkillTeam = higherSkillTeam === "Team1" ? "Team2" : "Team1";
    
    const sourcePlayers = higherSkillTeam === "Team1" ? team1Players : team2Players;
    
    const sortedPlayers = [...sourcePlayers].sort((a, b) => {
      const aSkill = a.steamID && playerData[a.steamID] ? 
                    playerData[a.steamID].skillRating : this.options.fallbackSkillRating;
      const bSkill = b.steamID && playerData[b.steamID] ? 
                    playerData[b.steamID].skillRating : this.options.fallbackSkillRating;
                    
      const teamAvg = higherSkillTeam === "Team1" ? team1Avg : team2Avg;
      return Math.abs(bSkill - teamAvg) - Math.abs(aSkill - teamAvg);
    });
    
    let currentDifference = Math.abs(team1Avg - team2Avg);
    
    for (const player of sortedPlayers) {
      if (!player.steamID) continue;
      
      const playerSkill = playerData[player.steamID] ? 
                         playerData[player.steamID].skillRating : this.options.fallbackSkillRating;
      
      const sourceTeamSize = higherSkillTeam === "Team1" ? team1Players.length : team2Players.length;
      const targetTeamSize = higherSkillTeam === "Team1" ? team2Players.length : team1Players.length;
      
      const newSourceTeamSkill = (higherSkillTeam === "Team1" ? team1Skill : team2Skill) - playerSkill;
      const newTargetTeamSkill = (higherSkillTeam === "Team1" ? team2Skill : team1Skill) + playerSkill;
      
      const newSourceTeamAvg = newSourceTeamSkill / (sourceTeamSize - 1);
      const newTargetTeamAvg = newTargetTeamSkill / (targetTeamSize + 1);
      
      const newDifference = Math.abs(newSourceTeamAvg - newTargetTeamAvg);
      
      if (newDifference < currentDifference) {
        this.logger.verbose(1, `Moving player ${player.name} from ${higherSkillTeam} to ${lowerSkillTeam} improves balance: ${currentDifference.toFixed(2)} -> ${newDifference.toFixed(2)} Elo difference`);
        
        if (higherSkillTeam === "Team1") {
          team1Skill = newSourceTeamSkill;
          team2Skill = newTargetTeamSkill;
        } else {
          team1Skill = newTargetTeamSkill;
          team2Skill = newSourceTeamSkill;
        }
        
        moves.push({
          sourceTeam: higherSkillTeam,
          targetTeam: lowerSkillTeam,
          playerID: player.steamID,
          playerName: player.name
        });
        
        currentDifference = newDifference;
        
        if (currentDifference <= this.options.maxSkillDifference) {
          this.logger.verbose(1, `Balance threshold reached (${currentDifference.toFixed(2)} <= ${this.options.maxSkillDifference} Elo points)`);
          break;
        }
      }
    }
    
    return moves;
  }
  
  flattenTeam(team) {
    const players = [];
    for (const squadID in team) {
      players.push(...team[squadID]);
    }
    return players;
  }

simulateBalancePlan(plan, squadSkillData) {
  const teamSkills = this.calculateTeamSkillRatings(squadSkillData);
  const simulated = {
    Team1: {...teamSkills.Team1},
    Team2: {...teamSkills.Team2}
  };
  
  for (const move of plan.squadMoves) {
    const squad = squadSkillData[move.sourceTeam][move.squadID];
    
    simulated[move.sourceTeam].totalSkill -= squad.totalSkill;
    simulated[move.sourceTeam].playerCount -= squad.playerCount;
    
    simulated[move.targetTeam].totalSkill += squad.totalSkill;
    simulated[move.targetTeam].playerCount += squad.playerCount;
  }
  
  if (plan.playerMoves) {
    for (const move of plan.playerMoves) {
    }
  }
  
  simulated.Team1.avgSkill = simulated.Team1.playerCount > 0 ? 
                             simulated.Team1.totalSkill / simulated.Team1.playerCount : 
                             this.options.fallbackSkillRating;
  simulated.Team2.avgSkill = simulated.Team2.playerCount > 0 ? 
                             simulated.Team2.totalSkill / simulated.Team2.playerCount : 
                             this.options.fallbackSkillRating;
  
  return simulated;
}


  createBalancingPlan(squadSkillData, playerData = null) {
    this.logger.verbose(1, "Creating balancing plan...");
    
    const teamSkills = this.calculateTeamSkillRatings(squadSkillData);
    if (this.options.verboseLogging) {
      this.logger.verbose(2, `Initial team skills: Team1=${teamSkills.Team1.avgSkill.toFixed(2)}, Team2=${teamSkills.Team2.avgSkill.toFixed(2)}`);
    }
    
    const plan = {
      squadMoves: [] 
    };
    
    if (!this.options.splitSquadsIfNeeded) {
      plan.squadMoves = this.calculateOptimalSquadMoves(squadSkillData);
    } else {
      plan.squadMoves = this.calculateOptimalSquadMoves(squadSkillData);
      
      const simulatedBalance = this.simulateBalancePlan(plan, squadSkillData);
      const skillDifference = Math.abs(simulatedBalance.Team1.avgSkill - simulatedBalance.Team2.avgSkill);
      
      if (skillDifference > this.options.maxSkillDifference && playerData) {
        this.logger.verbose(1, `Squad-based balance not sufficient (diff: ${skillDifference.toFixed(2)} Elo). Considering individual player moves.`);
        
        const teams = {
          Team1: {},
          Team2: {}
        };
        
        for (const teamName of ['Team1', 'Team2']) {
          for (const squadID in squadSkillData[teamName]) {
            const moveEntry = plan.squadMoves.find(move => 
              move.sourceTeam === teamName && move.squadID === squadID
            );
            
            if (moveEntry) {
              const targetTeam = moveEntry.targetTeam;
              teams[targetTeam][squadID] = squadSkillData[teamName][squadID];
            } else {
              teams[teamName][squadID] = squadSkillData[teamName][squadID];
            }
          }
        }
        
        plan.playerMoves = this.calculateOptimalPlayerMoves(teams, playerData);
      }
    }
    
    this.logger.verbose(1, `Balancing plan created with ${plan.squadMoves.length} squad moves`);
    if (plan.playerMoves) {
      this.logger.verbose(1, `And ${plan.playerMoves.length} individual player moves`);
    }
    
    return plan;
  }
}