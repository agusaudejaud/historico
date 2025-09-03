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

      // Verificar que el tipo de ELO existe en la base de datos
      const eloTypeExists = await prisma.user_elo_ratings.findFirst({
        where: {
          elo_type: eloType,
        },
      });

      if (!eloTypeExists) {
        // Mostrar todos los tipos de ELO disponibles para debugging
        const availableEloTypes = await prisma.user_elo_ratings.groupBy({
          by: ["elo_type"],
          _count: {
            elo_type: true,
          },
        });

        throw new Error(
          `Tipo de ELO no válido: ${eloType}. Tipos disponibles: ${availableEloTypes
            .map((t) => t.elo_type)
            .join(", ")}`
        );
      }

      // Contar registros con rating no nulo
      const total = await prisma.user_elo_ratings.count({
        where: {
          elo_type: eloType,
          current_rating: { not: null },
        },
      });

      if (total === 0) {
        return {
          data: [],
          total: 0,
          page,
          limit,
          elo_type: eloType,
        };
      }

      // Obtener datos paginados
      const data = await prisma.user_elo_ratings.findMany({
        where: {
          elo_type: eloType,
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

      // Formatear datos
      const formattedData = await Promise.all(
        data.map(async (item) => {
          // Contar matches y wins para este tipo específico
          const matches = await prisma.elo_history.count({
            where: {
              user_id: item.user_id,
              elo_type: eloType, 
            },
          });

          const wins = await prisma.elo_history.count({
            where: {
              user_id: item.user_id,
              elo_type: eloType, 
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
    { page = 1, limit = 20, dateFilter = null } = {}
  ) {
    try {
      const offset = (page - 1) * limit;

      // Obtener usuario
      const user = await prisma.users.findUnique({
        where: { username },
      });

      if (!user) {
        return {
          total: 0,
          page,
          limit,
          data: [],
          message: "Usuario no encontrado",
        };
      }

      // Construir condición WHERE base
      const whereCondition = {
        user_id: user.id,
        elo_type: eloType,
        user2_id: null,
      };

      // Agregar filtro de fechas si se proporciona
      if (dateFilter) {
        whereCondition.matches = {
          created_at: {
            gte: new Date(dateFilter.startDate),
            lte: new Date(dateFilter.endDate),
          },
        };
      }

      // Contar total con filtros aplicados
      const total = await prisma.elo_history.count({
        where: whereCondition,
      });

      if (total === 0) {
        return {
          total: 0,
          page,
          limit,
          data: [],
          username,
          elo_type: eloType,
          date_filter: dateFilter,
          message: dateFilter
            ? "No hay registros en el rango de fechas especificado"
            : "No hay historial disponible",
        };
      }

      // Obtener historial paginado con filtros
      const historyData = await prisma.elo_history.findMany({
        where: whereCondition,
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
        date_filter: dateFilter,
        data: cleanedData,
      };
    } catch (error) {
      console.error("Error en getELOHistory:", error);
      throw error;
    }
  }

  // Obtener historial de ELO de parejas
  static async getPairELOHistory(
    username1,
    username2,
    { page = 1, limit = 20, dateFilter = null } = {}
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
          date_filter: dateFilter,
          message: "Uno o ambos usuarios no existen",
        };
      }

      const [user1, user2] = users;
      const userId1 = user1.id;
      const userId2 = user2.id;

      // Construir condición WHERE base
      const whereCondition = {
        OR: [
          { user1_id: userId1, user2_id: userId2 },
          { user1_id: userId2, user2_id: userId1 },
        ],
        elo_type: "pair",
      };

      // Agregar filtro de fechas si se proporciona
      if (dateFilter) {
        whereCondition.matches = {
          created_at: {
            gte: new Date(dateFilter.startDate),
            lte: new Date(dateFilter.endDate),
          },
        };
      }

      // Contar total con filtros aplicados
      const total = await prisma.elo_history.count({
        where: whereCondition,
      });

      if (total === 0) {
        return {
          total: 0,
          page,
          limit,
          data: [],
          username1: user1.username,
          username2: user2.username,
          date_filter: dateFilter,
          message: dateFilter
            ? "No hay registros en el rango de fechas especificado"
            : "Esta pareja no ha jugado juntos",
        };
      }

      // Obtener historial paginado con filtros
      const historyData = await prisma.elo_history.findMany({
        where: whereCondition,
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
        date_filter: dateFilter,
        data: cleanedData,
      };
    } catch (error) {
      console.error("Error en getPairELOHistory:", error);
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

  // Método processSpecificELO
  static async processSpecificELO(matchData) {
    // ✅ Usar directamente el match_type sin mapeo
    const eloType = matchData.match_type; // "1v1" o "2v2"

    if (!["1v1", "2v2"].includes(eloType)) return;

    const allPlayers = [...matchData.teamA, ...matchData.teamB];

    // Obtener ratings actuales para el tipo específico
    const currentRatings = await this.getCurrentRatings(
      allPlayers.map((p) => p.id),
      eloType // ✅ Sin mapeo
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
        eloType, // ✅ Sin mapeo
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
        eloType, // ✅ Sin mapeo
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

  // Actualizar rating de jugadores
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
            elo_type: eloType, // ✅ Sin mapeo
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
      let penaltyResultInt = 0;

      if (matchData.went_to_penalties) {
        resultType = "draw";
        const playerTeam = matchData.teamA.some((p) => p.id === userId)
          ? "A"
          : "B";
        if (matchData.penalty_winner === playerTeam) {
          penaltyResultInt = 1;
        }
      } else {
        if (actualScore === 1) resultType = "win";
        else if (actualScore === 0) resultType = "loss";
        else resultType = "draw";
      }

      // ✅ Usar directamente eloType sin mapeo
      await prisma.$transaction(async (tx) => {
        // Actualizar o crear rating
        await tx.user_elo_ratings.upsert({
          where: {
            user_id_elo_type: {
              user_id: userId,
              elo_type: eloType, // ✅ Sin mapeo
            },
          },
          update: {
            current_rating: newRating,
            last_updated: new Date(),
          },
          create: {
            user_id: userId,
            elo_type: eloType, // ✅ Sin mapeo
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
            elo_type: eloType, // ✅ Sin mapeo - usar directamente
            rating_before: currentRating,
            rating_after: newRating,
            rating_change: change,
            result: resultType,
            penalty_result: penaltyResultInt,
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
    goalBonus,
    matchData
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

      // Determinar tipo de resultado y penales como entero
      let resultType;
      let penaltyResultInt = 0;

      if (matchData.went_to_penalties) {
        resultType = "draw";
        const pairTeam = matchData.teamA.some(
          (p) => p.id === pair.user1_id || p.id === pair.user2_id
        )
          ? "A"
          : "B";
        if (matchData.penalty_winner === pairTeam) {
          penaltyResultInt = 1;
        }
      } else {
        if (actualScore === 1) resultType = "win";
        else if (actualScore === 0) resultType = "loss";
        else resultType = "draw";
      }

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
            result: resultType,
            penalty_result: penaltyResultInt,
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

  //*********  ELO SMARTS  *********//

  // Método para obtener el rating histórico de un jugador en una fecha específica
  static async getPlayerRatingAtDate(userId, eloType, endDate) {
    try {
      // Buscar el último registro de ELO antes o en la fecha especificada
      const lastEloRecord = await prisma.elo_history.findFirst({
        where: {
          user_id: userId,
          elo_type: eloType,
          user2_id: null, // Solo ratings individuales
          matches: {
            created_at: {
              lte: new Date(endDate),
            },
          },
        },
        include: {
          matches: true,
        },
        orderBy: {
          match_id: "desc", // El último match en el rango de fechas
        },
      });

      // Si no hay historial en ese rango de fechas, devolver rating por defecto
      if (!lastEloRecord) {
        return this.CONFIG.DEFAULT_RATING;
      }

      return lastEloRecord.rating_after;
    } catch (error) {
      console.error("Error obteniendo rating histórico:", error);
      return this.CONFIG.DEFAULT_RATING;
    }
  }

  // Método corregido para obtener métricas de jugadores con rating histórico
  static async getRecentPlayerMetrics(userId, eloType, { startDate, endDate }) {
    try {
      const whereCondition = {
        match_players: { some: { user_id: userId } },
        created_at: {
          gte: new Date(startDate),
          lte: new Date(endDate),
        },
      };

      if (eloType === "1v1") whereCondition.match_type = "1v1";
      if (eloType === "2v2") whereCondition.match_type = "2v2";

      const recentMatches = await prisma.matches.findMany({
        where: whereCondition,
        include: {
          match_players: { include: { users: true } },
          elo_history: {
            where: {
              user_id: userId,
              elo_type: eloType,
              user2_id: null, // Solo individual
            },
          },
        },
        orderBy: { created_at: "desc" },
      });

      if (recentMatches.length === 0) {
        return {
          matches_count: 0,
          winrate: 0,
          activity_score: 0,
          consistency: 0,
          historical_rating: this.CONFIG.DEFAULT_RATING, // Rating histórico
        };
      }

      // Obtener el rating que tenía al final del período
      const historicalRating = await this.getPlayerRatingAtDate(
        userId,
        eloType,
        endDate
      );

      // Winrate
        const wins = recentMatches.filter((match) => {
      const userTeam = match.match_players.find(
        (mp) => mp.user_id === userId
      )?.team;
      
      // Solo contar victorias que NO fueron por penales
      const isWinner = 
        (userTeam === "A" && match.teama_goals > match.teamb_goals && !match.went_to_penalties) ||
        (userTeam === "B" && match.teamb_goals > match.teama_goals && !match.went_to_penalties);
      
      return isWinner;
    }).length;
      const winrate = (wins / recentMatches.length) * 100;

      // Consistencia (desvío estándar de cambios de ELO)
      const eloChanges = recentMatches
        .map((match) => {
          const eloHistory = match.elo_history.find(
            (eh) => eh.user_id === userId
          );
          return eloHistory ? eloHistory.rating_change : null;
        })
        .filter((c) => c !== null && c !== 0);

      let consistency = 50;
      if (eloChanges.length > 1) {
        const avg = eloChanges.reduce((a, b) => a + b, 0) / eloChanges.length;
        const variance =
          eloChanges.reduce((a, b) => a + Math.pow(b - avg, 2), 0) /
          eloChanges.length;
        const stdDev = Math.sqrt(variance);
        consistency = Math.max(30, Math.min(100, 100 - stdDev * 2));
      }

      // Actividad (número de partidos en rango)
      const activity_score = Math.min(100, (recentMatches.length / 20) * 100);

      return {
        matches_count: recentMatches.length,
        winrate: Math.round(winrate),
        activity_score: Math.round(activity_score),
        consistency: Math.round(consistency),
        historical_rating: historicalRating, // Rating que tenía en esa fecha
      };
    } catch (error) {
      console.error("Error en getRecentPlayerMetrics:", error);
      return {
        matches_count: 0,
        winrate: 0,
        activity_score: 0,
        consistency: 0,
        historical_rating: this.CONFIG.DEFAULT_RATING,
      };
    }
  }

  // Método corregido para el Smart Leaderboard
  static async getSmartLeaderboard(
    limit = 50,
    eloType = "global",
    page = 1,
    { startDate, endDate }
  ) {
    try {
      const offset = (page - 1) * limit;

      // En lugar de usar getGlobalLeaderboard, obtenemos jugadores que tuvieron actividad en el rango
      const playersWithActivity = await prisma.elo_history.findMany({
        where: {
          elo_type: eloType,
          user2_id: null, // Solo individual
          matches: {
            created_at: {
              gte: new Date(startDate),
              lte: new Date(endDate),
            },
          },
        },
        include: {
          users_elo_history_user_idTousers: {
            select: {
              id: true,
              username: true,
            },
          },
          matches: true,
        },
        distinct: ["user_id"],
      });

      const playersWithRecentActivity = [];

      for (const playerRecord of playersWithActivity) {
        if (!playerRecord.users_elo_history_user_idTousers) continue;

        const player = playerRecord.users_elo_history_user_idTousers;
        const recentMetrics = await this.getRecentPlayerMetrics(
          player.id,
          eloType,
          { startDate, endDate }
        );

        if (recentMetrics.matches_count > 0) {
          // Contar matches totales para el winrate general (no solo del período)
          const totalMatches = await prisma.elo_history.count({
            where: {
              user_id: player.id,
              elo_type: eloType,
              user2_id: null,
            },
          });

          const totalWins = await prisma.elo_history.count({
            where: {
              user_id: player.id,
              elo_type: eloType,
              user2_id: null,
              result: "win",
            },
          });

          const overallWinrate =
            totalMatches > 0
              ? Math.round((totalWins / totalMatches) * 100 * 100) / 100
              : 0;

          playersWithRecentActivity.push({
            player: {
              id: player.id,
              username: player.username,
              current_rating: recentMetrics.historical_rating, // Usar rating histórico
              matches_played: totalMatches,
              winrate: overallWinrate,
            },
            recentMetrics,
          });
        }
      }

      // Calcular smart_score usando el rating histórico
      const enhancedPlayers = playersWithRecentActivity.map(
        ({ player, recentMetrics }) => {
          const weights = {
            rating: 0.35,
            consistency: 0.2,
            winrate: 0.35,
            activity: 0.1,
          };

          const smart_score =
            recentMetrics.historical_rating * weights.rating + // Usar rating histórico
            recentMetrics.consistency * weights.consistency +
            recentMetrics.winrate * weights.winrate +
            recentMetrics.activity_score * weights.activity;

          return {
            ...player,
            recent_metrics: recentMetrics,
            smart_score: Math.round(smart_score),
          };
        }
      );

      const sortedPlayers = enhancedPlayers.sort(
        (a, b) => b.smart_score - a.smart_score
      );
      const paginatedPlayers = sortedPlayers.slice(offset, offset + limit);

      return {
        data: paginatedPlayers,
        total: playersWithRecentActivity.length,
        page,
        limit,
        elo_type: eloType,
        ranking_type: "smart",
      };
    } catch (error) {
      console.error("Error en getSmartLeaderboard:", error);
      throw error;
    }
  }

  // Método similar para parejas - obtener rating histórico de pareja
  static async getPairRatingAtDate(user1Id, user2Id, endDate) {
    try {
      const lastEloRecord = await prisma.elo_history.findFirst({
        where: {
          OR: [
            { user1_id: user1Id, user2_id: user2Id },
            { user1_id: user2Id, user2_id: user1Id },
          ],
          elo_type: "pair",
          matches: {
            created_at: {
              lte: new Date(endDate),
            },
          },
        },
        include: {
          matches: true,
        },
        orderBy: {
          match_id: "desc",
        },
      });

      if (!lastEloRecord) {
        return this.CONFIG.DEFAULT_RATING;
      }

      return lastEloRecord.rating_after;
    } catch (error) {
      console.error("Error obteniendo rating histórico de pareja:", error);
      return this.CONFIG.DEFAULT_RATING;
    }
  }

  // Método corregido para métricas de parejas con rating histórico
  static async getRecentPairMetrics(user1Id, user2Id, { startDate, endDate }) {
    try {
      const recentMatches = await prisma.matches.findMany({
        where: {
          match_type: "2v2",
          created_at: {
            gte: new Date(startDate),
            lte: new Date(endDate),
          },
          AND: [
            { match_players: { some: { user_id: user1Id } } },
            { match_players: { some: { user_id: user2Id } } },
          ],
        },
        include: {
          match_players: { include: { users: true } },
          elo_history: {
            where: {
              OR: [
                { user1_id: user1Id, user2_id: user2Id },
                { user1_id: user2Id, user2_id: user1Id },
              ],
            },
          },
        },
        orderBy: { created_at: "desc" },
      });

      // Filtrar solo partidos donde jugaron en el mismo equipo
      const validMatches = recentMatches.filter((match) => {
        const t1 = match.match_players.find(
          (mp) => mp.user_id === user1Id
        )?.team;
        const t2 = match.match_players.find(
          (mp) => mp.user_id === user2Id
        )?.team;
        return t1 === t2;
      });

      if (validMatches.length === 0) {
        return {
          matches_count: 0,
          winrate: 0,
          activity_score: 0,
          consistency: 50,
          historical_rating: this.CONFIG.DEFAULT_RATING,
        };
      }

      // Obtener rating histórico de la pareja
      const historicalRating = await this.getPairRatingAtDate(
        user1Id,
        user2Id,
        endDate
      );

      // Winrate
       const wins = validMatches.filter((match) => {
      const team = match.match_players.find(
        (mp) => mp.user_id === user1Id
      )?.team;
      
      // Solo contar victorias que NO fueron por penales
      const isWinner = 
        (team === "A" && match.teama_goals > match.teamb_goals && !match.went_to_penalties) ||
        (team === "B" && match.teamb_goals > match.teama_goals && !match.went_to_penalties);
      
      return isWinner;
    }).length;
      const winrate = (wins / validMatches.length) * 100;

      // Consistencia
      const eloChanges = validMatches
        .map((m) => m.elo_history[0]?.rating_change ?? null)
        .filter((c) => c !== null && c !== 0);

      let consistency = 50;
      if (eloChanges.length > 1) {
        const avg = eloChanges.reduce((a, b) => a + b, 0) / eloChanges.length;
        const variance =
          eloChanges.reduce((a, b) => a + Math.pow(b - avg, 2), 0) /
          eloChanges.length;
        const stdDev = Math.sqrt(variance);
        consistency = Math.max(30, Math.min(100, 100 - stdDev * 2));
      }

      const activity_score = Math.min(100, (validMatches.length / 15) * 100);

      return {
        matches_count: validMatches.length,
        winrate: Math.round(winrate),
        activity_score: Math.round(activity_score),
        consistency: Math.round(consistency),
        historical_rating: historicalRating,
      };
    } catch (error) {
      console.error("Error en getRecentPairMetrics:", error);
      return {
        matches_count: 0,
        winrate: 0,
        activity_score: 0,
        consistency: 50,
        historical_rating: this.CONFIG.DEFAULT_RATING,
      };
    }
  }

  // Método corregido para Smart Pair Leaderboard
  static async getSmartPairLeaderboard(
    limit = 50,
    page = 1,
    { startDate, endDate }
  ) {
    try {
      const offset = (page - 1) * limit;

      // Obtener parejas que tuvieron actividad en el rango de fechas
      const pairsWithActivity = await prisma.elo_history.findMany({
        where: {
          elo_type: "pair",
          user1_id: { not: null },
          user2_id: { not: null },
          matches: {
            created_at: {
              gte: new Date(startDate),
              lte: new Date(endDate),
            },
          },
        },
        include: {
          users_elo_history_user1_idTousers: {
            select: {
              username: true,
            },
          },
          users_elo_history_user2_idTousers: {
            select: {
              username: true,
            },
          },
          matches: true,
        },
        distinct: ["user1_id", "user2_id"],
      });

      const pairsWithRecentActivity = [];

      for (const pairRecord of pairsWithActivity) {
        if (
          !pairRecord.users_elo_history_user1_idTousers ||
          !pairRecord.users_elo_history_user2_idTousers
        )
          continue;

        const recentMetrics = await this.getRecentPairMetrics(
          pairRecord.user1_id,
          pairRecord.user2_id,
          { startDate, endDate }
        );

        if (recentMetrics.matches_count > 0) {
          // Calcular matches totales para estadísticas generales
          const totalMatches = await prisma.elo_history.count({
            where: {
              OR: [
                {
                  user1_id: pairRecord.user1_id,
                  user2_id: pairRecord.user2_id,
                },
                {
                  user1_id: pairRecord.user2_id,
                  user2_id: pairRecord.user1_id,
                },
              ],
              elo_type: "pair",
            },
          });

          const totalWins = await prisma.elo_history.count({
            where: {
              OR: [
                {
                  user1_id: pairRecord.user1_id,
                  user2_id: pairRecord.user2_id,
                },
                {
                  user1_id: pairRecord.user2_id,
                  user2_id: pairRecord.user1_id,
                },
              ],
              elo_type: "pair",
              result: "win",
            },
          });

          const overallWinrate =
            totalMatches > 0
              ? Math.round((totalWins / totalMatches) * 100 * 100) / 100
              : 0;

          pairsWithRecentActivity.push({
            pair: {
              user1_username:
                pairRecord.users_elo_history_user1_idTousers.username,
              user2_username:
                pairRecord.users_elo_history_user2_idTousers.username,
              current_rating: recentMetrics.historical_rating, // Usar rating histórico
              matches_played: totalMatches,
              winrate: overallWinrate,
            },
            recentMetrics,
          });
        }
      }

      // Calcular smart_score usando rating histórico
      const enhancedPairs = pairsWithRecentActivity.map(
        ({ pair, recentMetrics }) => {
          const weights = {
            rating: 0.35,
            consistency: 0.2,
            winrate: 0.35,
            activity: 0.1,
          };

          const smart_score =
            recentMetrics.historical_rating * weights.rating + // Usar rating histórico
            recentMetrics.consistency * weights.consistency +
            recentMetrics.winrate * weights.winrate +
            recentMetrics.activity_score * weights.activity;

          return {
            ...pair,
            recent_metrics: recentMetrics,
            smart_score: Math.round(smart_score),
          };
        }
      );

      const sortedPairs = enhancedPairs.sort(
        (a, b) => b.smart_score - a.smart_score
      );
      const paginatedPairs = sortedPairs.slice(offset, offset + limit);

      return {
        data: paginatedPairs,
        total: pairsWithRecentActivity.length,
        page,
        limit,
        ranking_type: "smart_pairs",
      };
    } catch (error) {
      console.error("Error en getSmartPairLeaderboard:", error);
      throw error;
    }
  }

  //  SOLO CASO DE EMERGENCIA

  static async revertMatchResult(matchId) {
    try {
      console.log(`Revertiendo ELO para match ${matchId}...`);

      // Obtener todo el historial de ELO para este partido
      const eloHistory = await prisma.elo_history.findMany({
        where: { match_id: matchId },
      });

      console.log(
        `Encontradas ${eloHistory.length} entradas de ELO para revertir`
      );

      // Revertir cada entrada de ELO
      for (const eloRecord of eloHistory) {
        try {
          if (
            eloRecord.elo_type === "1v1" ||
            eloRecord.elo_type === "2v2" ||
            eloRecord.elo_type === "global"
          ) {
            // Revertir ELO individual
            await prisma.user_elo_ratings.update({
              where: {
                user_id_elo_type: {
                  user_id: eloRecord.user_id,
                  elo_type: eloRecord.elo_type,
                },
              },
              data: {
                current_rating: eloRecord.rating_before,
                last_updated: new Date(),
              },
            });
            console.log(
              `ELO individual revertido para usuario ${eloRecord.user_id}, tipo ${eloRecord.elo_type}`
            );
          } else if (eloRecord.elo_type === "pair") {
            // Revertir ELO de pareja
            const pairRating = await prisma.pair_elo_ratings.findFirst({
              where: {
                OR: [
                  {
                    user1_id: eloRecord.user1_id,
                    user2_id: eloRecord.user2_id,
                  },
                  {
                    user1_id: eloRecord.user2_id,
                    user2_id: eloRecord.user1_id,
                  },
                ],
              },
            });

            if (pairRating) {
              await prisma.pair_elo_ratings.update({
                where: { id: pairRating.id },
                data: {
                  current_rating: eloRecord.rating_before,
                  last_updated: new Date(),
                },
              });
              console.log(
                `ELO de pareja revertido para ${eloRecord.user1_id}-${eloRecord.user2_id}`
              );
            }
          }
        } catch (error) {
          console.error(`Error revirtiendo ELO record ${eloRecord.id}:`, error);
          // Continuar con los demás registros
        }
      }

      // Eliminar el historial de ELO de este partido
      await prisma.elo_history.deleteMany({
        where: { match_id: matchId },
      });

      console.log(`ELO revertido exitosamente para match ${matchId}`);
      return { success: true, matchId };
    } catch (error) {
      console.error(`Error revirtiendo ELO para match ${matchId}:`, error);
      throw error;
    }
  }

  static async recalculateSubsequentMatches(userIds, eloType, afterMatchId) {
    try {
      console.log(
        `Recalculando partidos posteriores para usuarios: ${userIds.join(
          ", "
        )}, tipo: ${eloType}`
      );

      // Obtener todos los partidos de estos usuarios después del match modificado
      const subsequentMatches = await prisma.matches.findMany({
        where: {
          id: { gt: afterMatchId },
          match_players: {
            some: {
              user_id: { in: userIds },
            },
          },
        },
        orderBy: { id: "asc" },
        include: {
          match_players: true,
        },
      });

      console.log(
        `Encontrados ${subsequentMatches.length} partidos posteriores para recalcular`
      );

      // Recalcular cada partido en orden cronológico
      for (const match of subsequentMatches) {
        try {
          await this.revertMatchResult(match.id);
          await this.processMatchResult(match.id);
          console.log(`Recalculado partido ${match.id}`);
        } catch (error) {
          console.error(`Error recalculando partido ${match.id}:`, error);
        }
      }

      return { recalculated: subsequentMatches.length };
    } catch (error) {
      console.error("Error en recalculateSubsequentMatches:", error);
      throw error;
    }
  }
}

module.exports = ELO;
