const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

class ELO {
  // Configuración del sistema ELO
  static CONFIG = {
    DEFAULT_RATING: 1200,
    K_FACTOR: 32, // Factor K para jugadores normales
    K_FACTOR_NEW: 40, // Factor K para jugadores nuevos (<10 partidos)
    WIN_MULTIPLIER: 1.0,
    WIN_PENALTY_MULTIPLIER: 0.7, // Victoria por penales vale menos
    DRAW_MULTIPLIER: 0.5,
    GOAL_BONUS_THRESHOLD: 3, // Diferencia de goles para bonus
    GOAL_BONUS: 5, // Puntos extra por goleada
  };

  // Obtener leaderboard global (modificado para paginación)
  static async getGlobalLeaderboard(limit = 50, eloType = "global", page = 1) {
    try {
      const offset = (page - 1) * limit;

      // Mostrar todos los tipos de ELO disponibles
      const availableEloTypes = await prisma.user_elo_ratings.groupBy({
        by: ["elo_type"],
        _count: {
          elo_type: true,
        },
      });

      // Mapear tipos de ELO del parámetro a los valores del enum EloType en Prisma
      const eloTypeMapping = {
        global: "global",
        "1v1": "v1",
        "2v2": "v2",
        
      };

      const mappedEloType = eloTypeMapping[eloType];

      if (!mappedEloType) {
        throw new Error(`Tipo de ELO no válido: ${eloType}`);
      }

      // Contar registros con el tipo específico
      const countByType = await prisma.user_elo_ratings.count({
        where: {
          elo_type: mappedEloType,
        },
      });

      // Contar registros con rating no nulo
      const countWithRating = await prisma.user_elo_ratings.count({
        where: {
          elo_type: mappedEloType,
          current_rating: { not: null },
        },
      });

      // Para elo_history, usar el tipo original (ya que usa VarChar)
      const historyEloType =
        eloType === "v1" ? "1v1" : eloType === "v2" ? "2v2" : eloType;

      // Contar total de usuarios con rating en este tipo
      const total = countWithRating;

      if (total === 0) {
        return {
          data: [],
          total: 0,
          page,
          limit,
          elo_type: eloType,
          debug: {
            message: `No hay usuarios con rating en el tipo '${mappedEloType}'`,
            available_types: availableEloTypes,
            total_records: totalRecords,
          },
        };
      }

      // Obtener datos paginados
      const data = await prisma.user_elo_ratings.findMany({
        where: {
          elo_type: mappedEloType,
          current_rating: { not: null },
        },
        orderBy: {
          current_rating: "desc",
        },
        skip: offset,
        take: limit,
      });

      // Obtener información de usuarios por separado
      const userIds = data.map((item) => item.user_id);
      const users = await prisma.users.findMany({
        where: {
          id: { in: userIds },
        },
        select: {
          id: true,
          username: true,
        },
      });

      // Crear un mapa para acceso rápido a usuarios
      const userMap = users.reduce((map, user) => {
        map[user.id] = user;
        return map;
      }, {});

      // Formatear datos para mantener compatibilidad
      const formattedData = await Promise.all(
        data.map(async (item) => {
          // Contar matches y wins para este tipo específico
          const matches = await prisma.elo_history.count({
            where: {
              user_id: item.user_id,
              elo_type: historyEloType,
            },
          });

          const wins = await prisma.elo_history.count({
            where: {
              user_id: item.user_id,
              elo_type: historyEloType,
              result: "win",
            },
          });

          // Calcular winrate
          const winrate =
            matches > 0 ? Math.round((wins / matches) * 100 * 100) / 100 : 0;

          return {
            id: userMap[item.user_id]?.id || item.user_id,
            username: userMap[item.user_id]?.username || `User ${item.user_id}`,
            current_rating: item.current_rating,
            matches_played: matches,
            winrate,
          };
        })
      );

      return {
        data: formattedData,
        total,
        page,
        limit,
        elo_type: eloType,
      };
    } catch (error) {
      console.error("Error en getGlobalLeaderboard:", error);
      throw error;
    }
  }

  static async getPairLeaderboard(limit = 50, page = 1) {
    try {
      const offset = (page - 1) * limit;

      // Contar total
      const total = await prisma.pair_elo_ratings.count({
        where: {
          current_rating: { not: null },
        },
      });

      // Obtener datos paginados
      const data = await prisma.pair_elo_ratings.findMany({
        where: {
          current_rating: { not: null },
        },
        include: {
          users_pair_elo_ratings_user1_idTousers: {
            select: {
              username: true,
            },
          },
          users_pair_elo_ratings_user2_idTousers: {
            select: {
              username: true,
            },
          },
        },
        orderBy: {
          current_rating: "desc",
        },
        skip: offset,
        take: limit,
      });

      // Formatear y calcular winrate para cada pareja
      const formattedData = await Promise.all(
        data.map(async (item) => {
          // Contar matches de la pareja
          const matches = await prisma.elo_history.count({
            where: {
              OR: [
                { user1_id: item.user1_id, user2_id: item.user2_id },
                { user1_id: item.user2_id, user2_id: item.user1_id },
              ],
              elo_type: "pair",
            },
          });

          const wins = await prisma.elo_history.count({
            where: {
              OR: [
                { user1_id: item.user1_id, user2_id: item.user2_id },
                { user1_id: item.user2_id, user2_id: item.user1_id },
              ],
              elo_type: "pair",
              result: "win",
            },
          });

          const winrate =
            matches > 0 ? Math.round((wins / matches) * 100 * 100) / 100 : 0;

          return {
            user1_username:
              item.users_pair_elo_ratings_user1_idTousers.username,
            user2_username:
              item.users_pair_elo_ratings_user2_idTousers.username,
            current_rating: item.current_rating,
            matches_played: matches,
            winrate,
          };
        })
      );

      return {
        data: formattedData,
        total,
        page,
        limit,
      };
    } catch (error) {
      throw error;
    }
  }

  // Obtener historial de ELO individual
  static async getELOHistory(
    username,
    eloType = "global",
    { page = 1, limit = 20 } = {}
  ) {
    try {
      const offset = (page - 1) * limit;

      // Mapear tipos para compatibilidad con elo_history (que usa varchar)
      const eloTypeMapping = {
        global: "global",
        "1v1": "1v1",
        "2v2": "2v2",
        v1: "1v1",
        v2: "2v2",
      };
      const mappedEloType = eloTypeMapping[eloType] || eloType;

      // Obtener usuario
      const user = await prisma.users.findUnique({
        where: { username },
      });

      if (!user) {
        return { total: 0, page, limit, data: [] };
      }

      // Contar total
      const total = await prisma.elo_history.count({
        where: {
          user_id: user.id,
          elo_type: mappedEloType,
          user2_id: null,
        },
      });

      // Obtener historial paginado
      const historyData = await prisma.elo_history.findMany({
        where: {
          user_id: user.id,
          elo_type: mappedEloType,
          user2_id: null,
        },
        include: {
          matches: {
            include: {
              match_players: {
                where: {
                  user_id: user.id,
                },
              },
            },
          },
        },
        orderBy: {
          match_id: "desc",
        },
        skip: offset,
        take: limit,
      });

      // Formatear datos
      const cleanedData = historyData.map((item) => {
        let formattedResult = item.result;
        if (item.matches.went_to_penalties) {
          const userTeam = item.matches.match_players[0]?.team;
          const wonPenalties = item.matches.penalty_winner === userTeam;
          formattedResult = wonPenalties ? "win (pen)" : "loss (pen)";
        }

        return {
          id: item.id,
          match_id: item.match_id,
          user_id: item.user_id,
          rating_before: item.rating_before,
          rating_after: item.rating_after,
          rating_change: item.rating_change,
          result: formattedResult,
          goal_bonus: item.goal_bonus,
          match_date: item.matches.created_at,
          match_type: item.matches.match_type,
        };
      });

      return {
        total,
        page,
        limit,
        username,
        elo_type: eloType,
        data: cleanedData,
      };
    } catch (error) {
      throw error;
    }
  }

  // Obtener historial de ELO de parejas
  static async getPairELOHistory(
    username1,
    username2,
    { page = 1, limit = 20 } = {}
  ) {
    try {
      const offset = (page - 1) * limit;

      if (username1 === username2) {
        throw new Error("Los nombres de usuario deben ser diferentes");
      }

      // Obtener usuarios
      const users = await prisma.users.findMany({
        where: {
          username: {
            in: [username1, username2],
          },
        },
        orderBy: {
          id: "asc",
        },
      });

      if (users.length !== 2) {
        return {
          total: 0,
          page,
          limit,
          data: [],
          message: "Uno o ambos usuarios no existen",
        };
      }

      const [user1, user2] = users;
      const userId1 = user1.id;
      const userId2 = user2.id;

      // Contar total
      const total = await prisma.elo_history.count({
        where: {
          OR: [
            { user1_id: userId1, user2_id: userId2 },
            { user1_id: userId2, user2_id: userId1 },
          ],
          elo_type: "pair",
        },
      });

      // Obtener historial paginado
      const historyData = await prisma.elo_history.findMany({
        where: {
          OR: [
            { user1_id: userId1, user2_id: userId2 },
            { user1_id: userId2, user2_id: userId1 },
          ],
          elo_type: "pair",
        },
        include: {
          matches: {
            include: {
              match_players: true,
            },
          },
        },
        orderBy: {
          match_id: "desc",
        },
        skip: offset,
        take: limit,
      });

      // Formatear datos
      const cleanedData = historyData.map((item) => {
        let formattedResult = item.result;
        if (item.matches.went_to_penalties) {
          const player1Team = item.matches.match_players.find(
            (p) => p.user_id === userId1
          )?.team;
          const player2Team = item.matches.match_players.find(
            (p) => p.user_id === userId2
          )?.team;

          const wonPenalties =
            item.matches.penalty_winner === player1Team &&
            item.matches.penalty_winner === player2Team;

          formattedResult = wonPenalties ? "win (pen)" : "loss (pen)";
        }

        return {
          id: item.id,
          match_id: item.match_id,
          rating_before: item.rating_before,
          rating_after: item.rating_after,
          rating_change: item.rating_change,
          result: formattedResult,
          goal_bonus: item.goal_bonus,
          match_date: item.matches.created_at,
          match_type: item.matches.match_type,
        };
      });

      return {
        total,
        page,
        limit,
        username1: user1.username,
        username2: user2.username,
        data: cleanedData,
      };
    } catch (error) {
      throw error;
    }
  }

  // Procesar resultado de un partido específico
  static async processMatchResult(matchId) {
    try {
      // Obtener datos del partido
      const matchData = await this.getMatchData(matchId);

      // Procesar ELO global
      await this.processGlobalELO(matchData);

      // Procesar ELO específico por tipo de match
      await this.processSpecificELO(matchData);

      // Si es 2v2, procesar ELO de parejas
      if (matchData.match_type === "2v2") {
        await this.processPairELO(matchData);
      }

      return { success: true, matchId };
    } catch (error) {
      throw error;
    }
  }

  // Obtener datos completos del partido
  static async getMatchData(matchId) {
    try {
      const match = await prisma.matches.findUnique({
        where: { id: matchId },
        include: {
          match_players: {
            include: {
              users: {
                select: {
                  id: true,
                  username: true,
                },
              },
            },
            orderBy: [{ team: "asc" }, { user_id: "asc" }],
          },
        },
      });

      if (!match) {
        throw new Error("Match not found");
      }

      const teamA = match.match_players.filter((p) => p.team === "A");
      const teamB = match.match_players.filter((p) => p.team === "B");

      return {
        id: match.id,
        teamA_goals: match.teama_goals, // Corregir nombre de columna
        teamB_goals: match.teamb_goals, // Corregir nombre de columna
        match_type: match.match_type,
        went_to_penalties: match.went_to_penalties,
        penalty_winner: match.penalty_winner,
        teamA: teamA.map((p) => ({
          id: p.users.id,
          username: p.users.username,
        })),
        teamB: teamB.map((p) => ({
          id: p.users.id,
          username: p.users.username,
        })),
      };
    } catch (error) {
      throw error;
    }
  }

  // Procesar ELO global para todos los jugadores
  static async processGlobalELO(matchData) {
    const allPlayers = [...matchData.teamA, ...matchData.teamB];

    // Obtener ratings actuales
    const currentRatings = await this.getCurrentRatings(
      allPlayers.map((p) => p.id),
      "global"
    );

    // Calcular rating promedio por equipo
    const teamARating = this.calculateTeamRating(
      matchData.teamA,
      currentRatings
    );
    const teamBRating = this.calculateTeamRating(
      matchData.teamB,
      currentRatings
    );

    // Determinar resultado
    const result = this.determineMatchResult(matchData);

    // Calcular bonus por goles
    const goalBonus = this.calculateGoalBonus(matchData, result);

    // Procesar cada jugador
    for (const player of matchData.teamA) {
      await this.updatePlayerELO(
        player.id,
        "global",
        matchData.id,
        teamARating,
        teamBRating,
        result.teamA,
        goalBonus.teamA,
        matchData
      );
    }

    for (const player of matchData.teamB) {
      await this.updatePlayerELO(
        player.id,
        "global",
        matchData.id,
        teamBRating,
        teamARating,
        result.teamB,
        goalBonus.teamB,
        matchData
      );
    }
  }

  // Procesar ELO específico por tipo de match (1v1 o 2v2)
  static async processSpecificELO(matchData) {
    const eloTypeMapping = {
      "1v1": "v1",
      "2v2": "v2",
    };
    const eloType = eloTypeMapping[matchData.match_type];

    if (!eloType) return;

    const allPlayers = [...matchData.teamA, ...matchData.teamB];

    // Obtener ratings actuales para el tipo específico
    const currentRatings = await this.getCurrentRatings(
      allPlayers.map((p) => p.id),
      eloType
    );

    // Calcular rating promedio por equipo
    const teamARating = this.calculateTeamRating(
      matchData.teamA,
      currentRatings
    );
    const teamBRating = this.calculateTeamRating(
      matchData.teamB,
      currentRatings
    );

    // Determinar resultado
    const result = this.determineMatchResult(matchData);

    // Calcular bonus por goles
    const goalBonus = this.calculateGoalBonus(matchData, result);

    // Procesar cada jugador
    for (const player of matchData.teamA) {
      await this.updatePlayerELO(
        player.id,
        eloType,
        matchData.id,
        teamARating,
        teamBRating,
        result.teamA,
        goalBonus.teamA,
        matchData
      );
    }

    for (const player of matchData.teamB) {
      await this.updatePlayerELO(
        player.id,
        eloType,
        matchData.id,
        teamBRating,
        teamARating,
        result.teamB,
        goalBonus.teamB,
        matchData
      );
    }
  }

  // Procesar ELO de parejas para partidos 2v2
  static async processPairELO(matchData) {
    if (matchData.teamA.length !== 2 || matchData.teamB.length !== 2) return;

    const pairA = this.createPair(matchData.teamA[0].id, matchData.teamA[1].id);
    const pairB = this.createPair(matchData.teamB[0].id, matchData.teamB[1].id);

    // Obtener ratings de parejas
    const pairARating = await this.getPairRating(
      pairA.user1_id,
      pairA.user2_id
    );
    const pairBRating = await this.getPairRating(
      pairB.user1_id,
      pairB.user2_id
    );

    // Determinar resultado
    const result = this.determineMatchResult(matchData);

    // Calcular bonus por goles
    const goalBonus = this.calculateGoalBonus(matchData, result);

    // Actualizar ratings de parejas
    await this.updatePairELO(
      pairA,
      matchData.id,
      pairARating,
      pairBRating,
      result.teamA,
      goalBonus.teamA
    );
    await this.updatePairELO(
      pairB,
      matchData.id,
      pairBRating,
      pairARating,
      result.teamB,
      goalBonus.teamB
    );
  }

  // Calcular rating promedio del equipo
  static calculateTeamRating(team, currentRatings) {
    const ratings = team.map(
      (player) =>
        currentRatings[player.id]?.current_rating || this.CONFIG.DEFAULT_RATING
    );
    return Math.round(
      ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length
    );
  }

  // Determinar resultado del partido
  static determineMatchResult(matchData) {
    const { teamA_goals, teamB_goals, went_to_penalties, penalty_winner } =
      matchData;

    if (went_to_penalties) {
      return penalty_winner === "A"
        ? {
            teamA: this.CONFIG.WIN_PENALTY_MULTIPLIER,
            teamB: 1 - this.CONFIG.WIN_PENALTY_MULTIPLIER,
            type: "penalty",
          }
        : {
            teamA: 1 - this.CONFIG.WIN_PENALTY_MULTIPLIER,
            teamB: this.CONFIG.WIN_PENALTY_MULTIPLIER,
            type: "penalty",
          };
    } else if (teamA_goals > teamB_goals) {
      return {
        teamA: this.CONFIG.WIN_MULTIPLIER,
        teamB: 0,
        type: "win",
      };
    } else if (teamB_goals > teamA_goals) {
      return {
        teamA: 0,
        teamB: this.CONFIG.WIN_MULTIPLIER,
        type: "win",
      };
    } else {
      return {
        teamA: this.CONFIG.DRAW_MULTIPLIER,
        teamB: this.CONFIG.DRAW_MULTIPLIER,
        type: "draw",
      };
    }
  }

  // Calcular bonus por goleada
  static calculateGoalBonus(matchData, result) {
    const { teamA_goals, teamB_goals } = matchData;
    const goalDifference = Math.abs(teamA_goals - teamB_goals);

    if (
      result.type === "win" &&
      goalDifference >= this.CONFIG.GOAL_BONUS_THRESHOLD
    ) {
      return teamA_goals > teamB_goals
        ? { teamA: this.CONFIG.GOAL_BONUS, teamB: 0 }
        : { teamA: 0, teamB: this.CONFIG.GOAL_BONUS };
    }

    return { teamA: 0, teamB: 0 };
  }

  // Obtener ratings actuales de jugadores
  static async getCurrentRatings(userIds, eloType) {
    try {
      if (userIds.length === 0) return {};

      const ratings = await prisma.user_elo_ratings.findMany({
        where: {
          user_id: { in: userIds },
          elo_type: eloType,
        },
      });

      const ratingsMap = {};
      ratings.forEach((rating) => {
        ratingsMap[rating.user_id] = rating;
      });

      return ratingsMap;
    } catch (error) {
      throw error;
    }
  }

  // Calcular probabilidad de victoria
  static calculateExpectedScore(ratingA, ratingB) {
    return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
  }

  // Calcular nuevo rating
  static calculateNewRating(
    currentRating,
    expectedScore,
    actualScore,
    goalBonus = 0
  ) {
    const kFactor = this.CONFIG.K_FACTOR;
    const baseChange = kFactor * (actualScore - expectedScore);
    const change = Math.round(baseChange + goalBonus);

    return {
      newRating: Math.max(100, currentRating + change),
      change: change,
    };
  }

  // Actualizar ELO de un jugador
 // Actualizar ELO de un jugador
static async updatePlayerELO(
  userId,
  eloType,
  matchId,
  playerTeamRating,
  opponentTeamRating,
  actualScore,
  goalBonus,
  matchData
) {
  try {
    // Verificar si el registro existe
    const existingRating = await prisma.user_elo_ratings.findUnique({
      where: {
        user_id_elo_type: {
          user_id: userId,
          elo_type: eloType,
        },
      },
    });

    let currentRating =
      existingRating?.current_rating || this.CONFIG.DEFAULT_RATING;

    // Calcular nuevo rating
    const expectedScore = this.calculateExpectedScore(
      playerTeamRating,
      opponentTeamRating
    );
    const { newRating, change } = this.calculateNewRating(
      currentRating,
      expectedScore,
      actualScore,
      goalBonus
    );

    // Determinar tipo de resultado y penales como entero
    let resultType;
    let penaltyResultInt = 0; // 0 por defecto

    if (matchData.went_to_penalties) {
      resultType = "draw";
      const playerTeam = matchData.teamA.some((p) => p.id === userId)
        ? "A"
        : "B";
      if (matchData.penalty_winner === playerTeam) {
        penaltyResultInt = 1; // ganó en penales
      }
    } else {
      if (actualScore === 1) resultType = "win";
      else if (actualScore === 0) resultType = "loss";
      else resultType = "draw";
    }

    // Mapear eloType para el historial
    const historyEloTypeMapping = {
      global: "global",
      v1: "1v1",
      v2: "2v2",
      pair: "pair",
    };
    const historyEloType = historyEloTypeMapping[eloType] || eloType;

    // Usar transacción para atomicidad
    await prisma.$transaction(async (tx) => {
      // Actualizar o crear rating
      await tx.user_elo_ratings.upsert({
        where: {
          user_id_elo_type: {
            user_id: userId,
            elo_type: eloType,
          },
        },
        update: {
          current_rating: newRating,
          last_updated: new Date(),
        },
        create: {
          user_id: userId,
          elo_type: eloType,
          current_rating: newRating,
          created_at: new Date(),
          last_updated: new Date(),
        },
      });

      // Crear registro en historial
      await tx.elo_history.create({
        data: {
          match_id: matchId,
          user_id: userId,
          elo_type: historyEloType,
          rating_before: currentRating,
          rating_after: newRating,
          rating_change: change,
          result: resultType,
          penalty_result: penaltyResultInt, // ✅ ahora es Int
          goal_bonus: goalBonus,
          created_at: new Date(),
        },
      });
    });

    return { userId, newRating, change };
  } catch (error) {
    throw error;
  }
}


  // Crear par ordenado para parejas
  static createPair(userId1, userId2) {
    return userId1 < userId2
      ? { user1_id: userId1, user2_id: userId2 }
      : { user1_id: userId2, user2_id: userId1 };
  }

  // Obtener rating de pareja
  static async getPairRating(user1Id, user2Id) {
    try {
      const pairRating = await prisma.pair_elo_ratings.findFirst({
        where: {
          OR: [
            { user1_id: user1Id, user2_id: user2Id },
            { user1_id: user2Id, user2_id: user1Id },
          ],
        },
      });

      return pairRating || { current_rating: this.CONFIG.DEFAULT_RATING };
    } catch (error) {
      throw error;
    }
  }

  // Actualizar ELO de pareja
  static async updatePairELO(
    pair,
    matchId,
    pairRating,
    opponentRating,
    actualScore,
    goalBonus
  ) {
    try {
      const currentRating =
        pairRating.current_rating || this.CONFIG.DEFAULT_RATING;
      const opponentCurrentRating =
        opponentRating.current_rating || this.CONFIG.DEFAULT_RATING;

      // Calcular nuevo rating
      const expectedScore = this.calculateExpectedScore(
        currentRating,
        opponentCurrentRating
      );
      const { newRating, change } = this.calculateNewRating(
        currentRating,
        expectedScore,
        actualScore,
        goalBonus
      );

      // Usar transacción
      await prisma.$transaction(async (tx) => {
        // Actualizar o crear pareja
        await tx.pair_elo_ratings.upsert({
          where: {
            user1_id_user2_id: {
              user1_id: pair.user1_id,
              user2_id: pair.user2_id,
            },
          },
          update: {
            current_rating: newRating,
            last_updated: new Date(),
          },
          create: {
            user1_id: pair.user1_id,
            user2_id: pair.user2_id,
            current_rating: newRating,
            created_at: new Date(),
            last_updated: new Date(),
          },
        });

        // Crear registro en historial
        await tx.elo_history.create({
          data: {
            match_id: matchId,
            user1_id: pair.user1_id,
            user2_id: pair.user2_id,
            elo_type: "pair",
            rating_before: currentRating,
            rating_after: newRating,
            rating_change: change,
            result:
              actualScore === 1 ? "win" : actualScore === 0 ? "loss" : "draw",
            goal_bonus: goalBonus,
            created_at: new Date(),
          },
        });
      });

      return {
        success: true,
        newRating,
        change,
      };
    } catch (error) {
      throw error;
    }
  }
}

module.exports = ELO;
