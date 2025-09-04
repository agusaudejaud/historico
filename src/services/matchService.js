const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

class Match {
  static async create(data) {
    let {
      teamA_players,
      teamB_players,
      teamA_goals,
      teamB_goals,
      match_type,
      went_to_penalties,
      penalty_winner,
      created_by,
    } = data;

    // Mapear a los nombres que espera la DB
    const teama_goals = teamA_goals;
    const teamb_goals = teamB_goals;

    // Validación según tipo
    if (match_type === "1v1") {
      if (teamA_players.length !== 1 || teamB_players.length !== 1) {
        throw new Error("1v1 matches must have exactly 1 player per team");
      }
    } else if (match_type === "2v2") {
      if (teamA_players.length !== 2 || teamB_players.length !== 2) {
        throw new Error("2v2 matches must have exactly 2 players per team");
      }
    }

    // Ajustar penales
    if (teama_goals !== teamb_goals) {
      went_to_penalties = 0;
      penalty_winner = null;
    } else {
      went_to_penalties = went_to_penalties ? 1 : 0;
      if (went_to_penalties && !["A", "B"].includes(penalty_winner)) {
        throw new Error('Si hay penales, penalty_winner debe ser "A" o "B"');
      }
      if (!went_to_penalties) {
        penalty_winner = null;
      }
    }

    try {
      const result = await prisma.$transaction(async (tx) => {
        // Crear match
        const match = await tx.matches.create({
          data: {
            teama_goals,
            teamb_goals,
            match_type,
            went_to_penalties,
            penalty_winner,
            created_by,
            created_at: new Date(),
          },
        });

        // Crear jugadores
        const matchPlayers = [
          ...teamA_players.map((userId) => ({
            match_id: match.id,
            user_id: userId,
            team: "A",
          })),
          ...teamB_players.map((userId) => ({
            match_id: match.id,
            user_id: userId,
            team: "B",
          })),
        ];

        await tx.match_players.createMany({ data: matchPlayers });
        return match.id;
      });

      return result;
    } catch (error) {
      throw error;
    }
  }

  // Get all matches with pagination
  static async getAll({ page = 1, limit = 20, match_type } = {}) {
    try {
      const offset = (page - 1) * limit;

      // Construir el filtro where
      const where = {};
      if (match_type) {
        where.match_type = match_type;
      }

      // Obtener el total de matches con filtro
      const total = await prisma.matches.count({
        where,
      });

      // Obtener los matches con paginación y filtro
      const matches = await prisma.matches.findMany({
        where,
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
          },
          users: {
            select: {
              id: true,
              username: true,
            },
          },
        },
        orderBy: {
          created_at: "desc",
        },
        skip: offset,
        take: limit,
      });

      // Format data to match original structure
      const formattedData = matches.map((match) => {
        const teamA = match.match_players
          .filter((mp) => mp.team === "A")
          .map((mp) => ({
            id: mp.users.id, // Cambiado de user a users
            username: mp.users.username, // Cambiado de user a users
          }));

        const teamB = match.match_players
          .filter((mp) => mp.team === "B")
          .map((mp) => ({
            id: mp.users.id, // Cambiado de user a users
            username: mp.users.username, // Cambiado de user a users
          }));

        // Determine winner
        let winner;
        if (match.teama_goals > match.teamb_goals) {
          winner = "Team A";
        } else if (match.teamb_goals > match.teama_goals) {
          winner = "Team B";
        } else if (match.went_to_penalties) {
          winner =
            match.penalty_winner === "A" ? "Team A (pen)" : "Team B (pen)";
        } else {
          winner = "Empate";
        }

        return {
          match_id: match.id,
          created_by: match.users.username,
          created_at: match.created_at,
          match_type: match.match_type === "v1" ? "1v1" : "2v2",
          went_to_penalties: match.went_to_penalties,
          penalty_winner: match.penalty_winner,
          result: {
            teamA_goals: match.teama_goals,
            teamB_goals: match.teamb_goals,
            winner,
          },
          teams: {
            teamA,
            teamB,
          },
        };
      });

      return {
        total,
        page,
        limit,
        data: formattedData,
      };
    } catch (error) {
      console.error("Error in matches.getAll:", error);
      throw new Error("Failed to retrieve matches");
    }
  }

  // Get matches by username with pagination
  static async getByUsername(
    username,
    { page = 1, limit = 20, match_type } = {}
  ) {
    try {
      const offset = (page - 1) * limit;

      // Get user
      const user = await prisma.users.findUnique({
        where: { username },
      });

      if (!user) {
        throw new Error("Usuario no encontrado");
      }

      // Prepare where conditions
      const whereConditions = {
        match_players: {
          some: {
            user_id: user.id,
          },
        },
      };

      // FIX: Usar los valores directos del schema, no convertir
      if (match_type) {
        whereConditions.match_type = match_type; // Directamente "1v1" o "2v2"
      }

      // Get total count
      const total = await prisma.matches.count({
        where: whereConditions,
      });

      // Get matches with all related data
      const matches = await prisma.matches.findMany({
        where: whereConditions,
        include: {
          users: {
            select: {
              username: true,
            },
          },
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
        orderBy: {
          created_at: "desc",
        },
        skip: offset,
        take: limit,
      });

      // Get ELO changes for these matches
      const matchIds = matches.map((m) => m.id);
      let eloChanges = {};

      if (matchIds.length > 0) {
        const eloHistory = await prisma.elo_history.findMany({
          where: {
            user_id: user.id,
            match_id: { in: matchIds },
          },
          select: {
            match_id: true,
            rating_change: true,
          },
        });

        // Create ELO map
        eloHistory.forEach((elo) => {
          eloChanges[elo.match_id] = elo.rating_change;
        });
      }

      // Format data to match original structure
      const formattedData = matches.map((match) => {
        const teamA = match.match_players
          .filter((mp) => mp.team === "A")
          .map((mp) => ({
            id: mp.users.id, // FIX: Cambiar de mp.user a mp.users
            username: mp.users.username,
          }));

        const teamB = match.match_players
          .filter((mp) => mp.team === "B")
          .map((mp) => ({
            id: mp.users.id, // FIX: Cambiar de mp.user a mp.users
            username: mp.users.username,
          }));

        // Determine winner
        let winner;
        if (match.teama_goals > match.teamb_goals) {
          // FIX: Usar los nombres correctos del schema
          winner = "Team A";
        } else if (match.teamb_goals > match.teama_goals) {
          winner = "Team B";
        } else if (match.went_to_penalties) {
          winner =
            match.penalty_winner === "A" ? "Team A (pen)" : "Team B (pen)";
        } else {
          winner = "Empate";
        }

        return {
          match_id: match.id,
          created_by: match.users.username,
          created_at: match.created_at,
          match_type: match.match_type,
          went_to_penalties: match.went_to_penalties,
          penalty_winner: match.penalty_winner,
          result: {
            teamA_goals: match.teama_goals,
            teamB_goals: match.teamb_goals,
            winner,
          },
          teams: {
            teamA,
            teamB,
          },
          elo_change: eloChanges[match.id] || 0,
        };
      });

      return {
        total,
        page,
        limit,
        username,
        data: formattedData,
      };
    } catch (error) {
      console.error("Error in getByUsername:", error); // Debug log
      throw error;
    }
  }

  // Get matches by pair (2v2)
  static async getMatchesByPair2v2(
    username1,
    username2,
    { page = 1, limit = 20 } = {}
  ) {
    try {
      const offset = (page - 1) * limit;

      // Obtener los usuarios por su nombre
      const user1 = await prisma.users.findFirst({
        where: { username: { equals: username1 } },
      });

      const user2 = await prisma.users.findFirst({
        where: { username: { equals: username2 } },
      });

      if (!user1 || !user2) {
        return {
          total: 0,
          page,
          limit,
          team: `${username1} & ${username2}`,
          message: "Uno o ambos usuarios no encontrados",
          data: [],
        };
      }

      const player1Id = user1.id;
      const player2Id = user2.id;

      // Buscar matches donde ambos jugadores están en el mismo equipo y es 2v2
      const whereCondition = {
        match_type: "2v2",
        AND: [
          {
            match_players: {
              some: { user_id: player1Id },
            },
          },
          {
            match_players: {
              some: { user_id: player2Id },
            },
          },
        ],
      };

      // Obtener todos los matches que cumplen la condición básica
      const allMatches = await prisma.matches.findMany({
        where: whereCondition,
        include: {
          match_players: {
            select: {
              user_id: true,
              team: true,
            },
          },
        },
      });

      // Filtrar manualmente para asegurar que están en el mismo equipo
      const validMatches = allMatches.filter((match) => {
        const player1Team = match.match_players.find(
          (mp) => mp.user_id === player1Id
        )?.team;
        const player2Team = match.match_players.find(
          (mp) => mp.user_id === player2Id
        )?.team;
        return player1Team === player2Team;
      });

      const totalCount = validMatches.length;

      if (totalCount === 0) {
        return {
          total: totalCount,
          page,
          limit,
          team: `${user1.username} & ${user2.username}`,
          data: [],
        };
      }

      // Aplicar paginación manualmente
      const sortedMatches = validMatches.sort(
        (a, b) => new Date(b.created_at) - new Date(a.created_at)
      );
      const paginatedMatchIds = sortedMatches
        .slice(offset, offset + limit)
        .map((match) => match.id);

      // Obtener los datos completos de los matches paginados
      const matches = await prisma.matches.findMany({
        where: {
          id: { in: paginatedMatchIds },
        },
        include: {
          users: {
            select: {
              username: true,
            },
          },
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
        orderBy: {
          created_at: "desc",
        },
      });

      // Get ELO changes for the pair
      const eloHistory = await prisma.elo_history.findMany({
        where: {
          match_id: { in: paginatedMatchIds },
          elo_type: "pair",
          OR: [
            { user1_id: player1Id, user2_id: player2Id },
            { user1_id: player2Id, user2_id: player1Id },
          ],
        },
        select: {
          match_id: true,
          rating_change: true,
        },
      });

      // Create ELO map
      const eloChanges = {};
      eloHistory.forEach((elo) => {
        eloChanges[elo.match_id] = elo.rating_change;
      });

      // Format data
      const formattedData = matches.map((match) => {
        const teamA = match.match_players
          .filter((mp) => mp.team === "A")
          .map((mp) => ({
            id: mp.users.id,
            username: mp.users.username,
          }));

        const teamB = match.match_players
          .filter((mp) => mp.team === "B")
          .map((mp) => ({
            id: mp.users.id,
            username: mp.users.username,
          }));

        // Determine winner
        let winner;
        if (match.teama_goals > match.teamb_goals) {
          winner = "Team A";
        } else if (match.teamb_goals > match.teama_goals) {
          winner = "Team B";
        } else if (match.went_to_penalties) {
          winner =
            match.penalty_winner === "A" ? "Team A (pen)" : "Team B (pen)";
        } else {
          winner = "Empate";
        }

        return {
          match_id: match.id,
          created_by: match.users.username,
          created_at: match.created_at,
          match_type: "2v2",
          went_to_penalties: match.went_to_penalties,
          penalty_winner: match.penalty_winner,
          result: {
            teamA_goals: match.teama_goals,
            teamB_goals: match.teamb_goals,
            winner,
          },
          teams: {
            teamA,
            teamB,
          },
          elo_change: eloChanges[match.id] || 0,
        };
      });

      return {
        total: totalCount,
        page,
        limit,
        team: `${user1.username} & ${user2.username}`,
        data: formattedData,
      };
    } catch (error) {
      console.error("Error in getMatchesByPair2v2:", error);
      throw error;
    }
  }

  static async getHeadToHeadMatches1v1(
    username1,
    username2,
    { page = 1, limit = 20 } = {}
  ) {
    try {
      const offset = (page - 1) * limit;

      // Verificar que los usuarios existan
      const users = await prisma.users.findMany({
        where: {
          OR: [
            { username: { equals: username1, mode: "insensitive" } },
            { username: { equals: username2, mode: "insensitive" } },
          ],
        },
      });

      if (users.length !== 2) {
        throw new Error("Uno o ambos usuarios no encontrados");
      }

      const user1 = users.find(
        (u) => u.username.toLowerCase() === username1.toLowerCase()
      );
      const user2 = users.find(
        (u) => u.username.toLowerCase() === username2.toLowerCase()
      );

      const player1Id = user1.id;
      const player2Id = user2.id;

      // Buscar todos los partidos 1v1 entre estos usuarios
      const allMatches = await prisma.matches.findMany({
        where: {
          match_type: "1v1",
          AND: [
            {
              match_players: {
                some: { user_id: player1Id },
              },
            },
            {
              match_players: {
                some: { user_id: player2Id },
              },
            },
          ],
        },
        include: {
          match_players: {
            select: {
              user_id: true,
              team: true,
            },
          },
        },
        orderBy: { created_at: "desc" },
      });

      // Filtrar solo los que estén en equipos diferentes
      const headToHeadMatches = allMatches.filter((match) => {
        const player1Team = match.match_players.find(
          (mp) => mp.user_id === player1Id
        )?.team;
        const player2Team = match.match_players.find(
          (mp) => mp.user_id === player2Id
        )?.team;
        return player1Team !== player2Team;
      });

      const total = headToHeadMatches.length;
      const paginatedMatchIds = headToHeadMatches
        .slice(offset, offset + limit)
        .map((match) => match.id);

      if (paginatedMatchIds.length === 0) {
        return {
          total: 0,
          page,
          limit,
          jugador1: user1.username,
          jugador2: user2.username,
          data: [],
        };
      }

      // Obtener datos completos de los matches paginados
      const matches = await prisma.matches.findMany({
        where: {
          id: { in: paginatedMatchIds },
        },
        include: {
          users: {
            select: {
              id: true,
              username: true,
            },
          },
          match_players: {
            include: {
              users: {
                select: {
                  id: true,
                  username: true,
                },
              },
            },
          },
        },
        orderBy: {
          created_at: "desc",
        },
      });

      // Obtener cambios de ELO
      const eloChanges = await prisma.elo_history.findMany({
        where: {
          match_id: { in: paginatedMatchIds },
          user_id: { in: [player1Id, player2Id] },
          elo_type: "1v1",
        },
        select: {
          match_id: true,
          user_id: true,
          rating_change: true,
        },
      });

      const eloChangeMap = {};
      eloChanges.forEach((elo) => {
        if (!eloChangeMap[elo.match_id]) {
          eloChangeMap[elo.match_id] = {};
        }
        eloChangeMap[elo.match_id][elo.user_id] = elo.rating_change;
      });

      // Formatear datos
      const formattedData = matches.map((match) => {
        const teamA = match.match_players
          .filter((mp) => mp.team === "A")
          .map((mp) => ({
            id: mp.users.id,
            username: mp.users.username,
          }));

        const teamB = match.match_players
          .filter((mp) => mp.team === "B")
          .map((mp) => ({
            id: mp.users.id,
            username: mp.users.username,
          }));

        let winner;
        if (match.teama_goals > match.teamb_goals) {
          winner = "Team A";
        } else if (match.teamb_goals > match.teama_goals) {
          winner = "Team B";
        } else if (match.went_to_penalties) {
          winner =
            match.penalty_winner === "A" ? "Team A (pen)" : "Team B (pen)";
        } else {
          winner = "Empate";
        }

        return {
          match_id: match.id,
          created_by: match.users.username,
          created_at: match.created_at,
          match_type: match.match_type,
          went_to_penalties: match.went_to_penalties,
          penalty_winner: match.penalty_winner,
          result: {
            teamA_goals: match.teama_goals,
            teamB_goals: match.teamb_goals,
            winner,
          },
          teams: {
            teamA,
            teamB,
          },
          elo_changes: {
            [user1.username]: eloChangeMap[match.id]?.[player1Id] || 0,
            [user2.username]: eloChangeMap[match.id]?.[player2Id] || 0,
          },
        };
      });

      return {
        total,
        page,
        limit,
        jugador1: user1.username,
        jugador2: user2.username,
        data: formattedData,
      };
    } catch (error) {
      console.error("Error en getHeadToHeadMatches1v1:", error);
      throw error;
    }
  }
  static async getHeadToHeadMatches2v2(
    username1,
    username2,
    username3,
    username4,
    { page = 1, limit = 20 } = {}
  ) {
    try {
      const offset = (page - 1) * limit;
      const usernames = [username1, username2, username3, username4];
      const uniqueUsernames = [
        ...new Set(usernames.map((u) => u.toLowerCase())),
      ];

      if (uniqueUsernames.length !== 4) {
        throw new Error("Los 4 usuarios deben ser únicos");
      }

      const users = await prisma.users.findMany({
        where: {
          OR: usernames.map((username) => ({
            username: { equals: username, mode: "insensitive" },
          })),
        },
      });

      if (users.length !== 4) {
        throw new Error("Uno o más usuarios no encontrados");
      }

      // Mapear usuarios
      const userMap = {};
      users.forEach((user) => {
        userMap[user.username.toLowerCase()] = user;
      });

      const user1 = userMap[username1.toLowerCase()];
      const user2 = userMap[username2.toLowerCase()];
      const user3 = userMap[username3.toLowerCase()];
      const user4 = userMap[username4.toLowerCase()];

      // Buscar partidos donde estén las dos parejas
      const allMatches = await prisma.matches.findMany({
        where: {
          match_type: "2v2",
          AND: [
            {
              match_players: {
                some: { user_id: user1.id },
              },
            },
            {
              match_players: {
                some: { user_id: user2.id },
              },
            },
            {
              match_players: {
                some: { user_id: user3.id },
              },
            },
            {
              match_players: {
                some: { user_id: user4.id },
              },
            },
          ],
        },
        include: {
          match_players: {
            select: {
              user_id: true,
              team: true,
            },
          },
        },
        orderBy: { created_at: "desc" },
      });

      // Filtrar partidos donde user1&user2 vs user3&user4
      const headToHeadMatches = allMatches.filter((match) => {
        const user1Team = match.match_players.find(
          (mp) => mp.user_id === user1.id
        )?.team;
        const user2Team = match.match_players.find(
          (mp) => mp.user_id === user2.id
        )?.team;
        const user3Team = match.match_players.find(
          (mp) => mp.user_id === user3.id
        )?.team;
        const user4Team = match.match_players.find(
          (mp) => mp.user_id === user4.id
        )?.team;

        return (
          user1Team === user2Team &&
          user3Team === user4Team &&
          user1Team !== user3Team
        );
      });

      const total = headToHeadMatches.length;
      const paginatedMatchIds = headToHeadMatches
        .slice(offset, offset + limit)
        .map((match) => match.id);

      if (paginatedMatchIds.length === 0) {
        return {
          total: 0,
          page,
          limit,
          pareja1: `${user1.username} & ${user2.username}`,
          pareja2: `${user3.username} & ${user4.username}`,
          data: [],
        };
      }

      // Obtener datos completos
      const matches = await prisma.matches.findMany({
        where: {
          id: { in: paginatedMatchIds },
        },
        include: {
          users: {
            select: {
              id: true,
              username: true,
            },
          },
          match_players: {
            include: {
              users: {
                select: {
                  id: true,
                  username: true,
                },
              },
            },
          },
        },
        orderBy: {
          created_at: "desc",
        },
      });

      // Obtener cambios de ELO para parejas
      const eloChanges = await prisma.elo_history.findMany({
        where: {
          match_id: { in: paginatedMatchIds },
          elo_type: "pair",
          OR: [
            { user1_id: user1.id, user2_id: user2.id },
            { user1_id: user2.id, user2_id: user1.id },
            { user1_id: user3.id, user2_id: user4.id },
            { user1_id: user4.id, user2_id: user3.id },
          ],
        },
        select: {
          match_id: true,
          user1_id: true,
          user2_id: true,
          rating_change: true,
        },
      });

      const eloChangeMap = {};
      eloChanges.forEach((elo) => {
        eloChangeMap[elo.match_id] = eloChangeMap[elo.match_id] || {};
        const pairKey = `${elo.user1_id}-${elo.user2_id}`;
        eloChangeMap[elo.match_id][pairKey] = elo.rating_change;
      });

      const formattedData = matches.map((match) => {
        const teamA = match.match_players
          .filter((mp) => mp.team === "A")
          .map((mp) => ({
            id: mp.users.id,
            username: mp.users.username,
          }));

        const teamB = match.match_players
          .filter((mp) => mp.team === "B")
          .map((mp) => ({
            id: mp.users.id,
            username: mp.users.username,
          }));

        let winner;
        if (match.teama_goals > match.teamb_goals) {
          winner = "Team A";
        } else if (match.teamb_goals > match.teama_goals) {
          winner = "Team B";
        } else if (match.went_to_penalties) {
          winner =
            match.penalty_winner === "A" ? "Team A (pen)" : "Team B (pen)";
        } else {
          winner = "Empate";
        }

        return {
          match_id: match.id,
          created_by: match.users.username,
          created_at: match.created_at,
          match_type: match.match_type,
          went_to_penalties: match.went_to_penalties,
          penalty_winner: match.penalty_winner,
          result: {
            teamA_goals: match.teama_goals,
            teamB_goals: match.teamb_goals,
            winner,
          },
          teams: {
            teamA,
            teamB,
          },
          elo_changes: {
            [`${user1.username} & ${user2.username}`]:
              eloChangeMap[match.id]?.[`${user1.id}-${user2.id}`] ||
              eloChangeMap[match.id]?.[`${user2.id}-${user1.id}`] ||
              0,
            [`${user3.username} & ${user4.username}`]:
              eloChangeMap[match.id]?.[`${user3.id}-${user4.id}`] ||
              eloChangeMap[match.id]?.[`${user4.id}-${user3.id}`] ||
              0,
          },
        };
      });

      return {
        total,
        page,
        limit,
        pareja1: `${user1.username} & ${user2.username}`,
        pareja2: `${user3.username} & ${user4.username}`,
        data: formattedData,
      };
    } catch (error) {
      console.error("Error en getHeadToHeadMatches2v2:", error);
      throw error;
    }
  }
}

module.exports = Match;
