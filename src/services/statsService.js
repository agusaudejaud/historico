const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

class Stats {
  // Obtener estadísticas por parejas (2v2)
  static async getStatsByPair2v2(username1, username2) {
    try {
      // 1. Buscar los usuarios y verificar que existan (case insensitive)
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

      // 2. FIX: Usar nombres correctos de campos según el schema
      const matchesRaw = await prisma.$queryRaw`
    SELECT 
      m.id,
      m.teama_goals,
      m.teamb_goals,
      m.went_to_penalties,
      m.penalty_winner,
      m.created_at,
      mp1.team as player1_team,
      mp2.team as player2_team
    FROM matches m
    JOIN match_players mp1 ON m.id = mp1.match_id AND mp1.user_id = ${player1Id}
    JOIN match_players mp2 ON m.id = mp2.match_id AND mp2.user_id = ${player2Id}
    WHERE m.match_type = '2v2' 
      AND mp1.team = mp2.team
    ORDER BY m.created_at DESC
  `;

      // 3. Obtener el ELO de la pareja
      const pairElo = await prisma.pair_elo_ratings.findFirst({
        where: {
          OR: [
            { user1_id: player1Id, user2_id: player2Id },
            { user1_id: player2Id, user2_id: player1Id },
          ],
        },
      });

      // 4. Calcular estadísticas
      const stats = {
        partidos_jugados: matchesRaw.length,
        partidos_ganados: 0,
        partidos_perdidos: 0,
        partidos_empatados: 0,
        ganados_por_penales: 0,
        perdidos_por_penales: 0,
        goles_a_favor: 0,
        goles_en_contra: 0,
        diferencia_goles: 0,
        winrate: 0,
        winrate_with_penalties: 0,
        elo: pairElo?.current_rating || 1200,
      };

      matchesRaw.forEach((match) => {
        // El equipo de la pareja (ambos están en el mismo equipo)
        const team = match.player1_team; // o match.player2_team, son iguales

        // FIX: Usar nombres correctos de campos y convertir a números
        const gf =
          team === "A" ? Number(match.teama_goals) : Number(match.teamb_goals);
        const gc =
          team === "A" ? Number(match.teamb_goals) : Number(match.teama_goals);

        stats.goles_a_favor += gf;
        stats.goles_en_contra += gc;

        if (gf > gc) {
          stats.partidos_ganados++;
        } else if (gf < gc) {
          stats.partidos_perdidos++;
        } else {
          stats.partidos_empatados++;
          if (match.went_to_penalties) {
            if (match.penalty_winner === team) {
              stats.ganados_por_penales++;
            } else {
              stats.perdidos_por_penales++;
            }
          }
        }
      });

      // Calcular estadísticas finales
      stats.diferencia_goles = stats.goles_a_favor - stats.goles_en_contra;

      if (stats.partidos_jugados > 0) {
        stats.winrate = Number(
          ((stats.partidos_ganados / stats.partidos_jugados) * 100).toFixed(2)
        );
        stats.winrate_with_penalties = Number(
          (
            ((stats.partidos_ganados + stats.ganados_por_penales) /
              stats.partidos_jugados) *
            100
          ).toFixed(2)
        );
      }

      return {
        jugador1: {
          id: player1Id,
          username: user1.username,
        },
        jugador2: {
          id: player2Id,
          username: user2.username,
        },
        estadisticas: stats,
      };
    } catch (error) {
      console.error("Error en getStatsByPair2v2:", error);
      throw error;
    }
  }

  // Obtener estadísticas por username
  static async getStatsByUsername(username) {
    try {
      // 1. Obtener el usuario
      const user = await prisma.users.findUnique({
        where: { username },
      });

      if (!user) {
        throw new Error("Usuario no encontrado");
      }

      const userId = user.id;

      // 2. FIX: Usar nombres correctos de campos según el schema
      const matchesRaw = await prisma.$queryRaw`
      SELECT 
        m.id AS match_id,
        m.teama_goals,
        m.teamb_goals,
        m.went_to_penalties,
        m.penalty_winner,
        m.match_type,
        m.created_at,
        mp.team AS player_team
      FROM matches m
      JOIN match_players mp ON mp.match_id = m.id
      WHERE mp.user_id = ${userId}
      ORDER BY m.created_at DESC
    `;

      // 3. Obtener compañeros de equipo en partidos 2v2
      const partnersRaw = await prisma.$queryRaw`
      SELECT 
        u.id AS user_id,
        u.username,
        COUNT(*) as partidos_jugados,
        MAX(m.created_at) AS last_played
      FROM match_players mp1
      JOIN match_players mp2 
        ON mp1.match_id = mp2.match_id 
        AND mp1.user_id != mp2.user_id 
        AND mp1.team = mp2.team
      JOIN users u ON mp2.user_id = u.id
      JOIN matches m ON mp1.match_id = m.id
      WHERE mp1.user_id = ${userId} AND m.match_type = '2v2'
      GROUP BY u.id, u.username
      ORDER BY last_played DESC, partidos_jugados DESC
    `;

      // 4. Obtener ELO ratings del usuario
      const eloRatings = await prisma.user_elo_ratings.findMany({
        where: { user_id: userId },
      });

      // Inicializar estructura para global, 1v1 y 2v2
      const initStats = () => ({
        partidos_jugados: 0,
        partidos_ganados: 0,
        partidos_perdidos: 0,
        partidos_empatados: 0,
        ganados_por_penales: 0,
        perdidos_por_penales: 0,
        goles_a_favor: 0,
        goles_en_contra: 0,
        diferencia_goles: 0,
        winrate: 0,
        winrate_with_penalties: 0,
        elo: 0 || 1200,
      });

      const stats = {
        global: initStats(),
        "1v1": initStats(),
        "2v2": initStats(),
      };

      // Procesar matches
      matchesRaw.forEach((match) => {
        const matchType = match.match_type === "1v1" ? "1v1" : "2v2";
        const grupos = [stats.global, stats[matchType]];

        const es_teamA = match.player_team === "A";
        // FIX: Usar nombres correctos de campos
        const gf = es_teamA
          ? Number(match.teama_goals)
          : Number(match.teamb_goals);
        const gc = es_teamA
          ? Number(match.teamb_goals)
          : Number(match.teama_goals);

        grupos.forEach((st) => {
          st.partidos_jugados++;
          st.goles_a_favor += gf;
          st.goles_en_contra += gc;

          if (gf > gc) {
            st.partidos_ganados++;
          } else if (gf < gc) {
            st.partidos_perdidos++;
          } else {
            st.partidos_empatados++;
            if (match.went_to_penalties) {
              if (match.penalty_winner === match.player_team) {
                st.ganados_por_penales++;
              } else {
                st.perdidos_por_penales++;
              }
            }
          }
        });
      });

      // Calcular diferencia de goles y winrate para cada tipo
      ["global", "1v1", "2v2"].forEach((key) => {
        const s = stats[key];
        s.diferencia_goles = s.goles_a_favor - s.goles_en_contra;
        s.winrate =
          s.partidos_jugados > 0
            ? Number(
                ((s.partidos_ganados / s.partidos_jugados) * 100).toFixed(2)
              )
            : 0;
        s.winrate_with_penalties =
          s.partidos_jugados > 0
            ? Number(
                (
                  ((s.partidos_ganados + s.ganados_por_penales) /
                    s.partidos_jugados) *
                  100
                ).toFixed(2)
              )
            : 0;
      });

      eloRatings.forEach((rating) => {
        if (stats[rating.elo_type]) {
          stats[rating.elo_type].elo = rating.current_rating || 0; // Usar 0 o el valor por defecto que desees
        }
      });

      // Formatear parejas con más información
      stats.parejas = partnersRaw.map((row) => ({
        id: Number(row.user_id),
        username: row.username,
        partidos_jugados: Number(row.partidos_jugados),
        last_played: row.last_played,
      }));

      return stats;
    } catch (error) {
      console.error("Error en getStatsByUsername:", error);
      throw error;
    }
  }

  static async getLandingPageStats() {
    try {
      // Top jugadores
      const topPlayers = await prisma.user_elo_ratings.findMany({
        where: {
          elo_type: "global",
        },
        orderBy: {
          current_rating: "desc",
        },
        take: 10,
        select: {
          current_rating: true,
          users: {
            select: {
              username: true,
              elo_history_elo_history_user_idTousers: {
                where: {
                  elo_type: "global",
                },
                select: {
                  id: true,
                },
              },
            },
          },
        },
      });

      // Formatear los datos de los jugadores
      const formattedTopPlayers = topPlayers.map((player) => ({
        username: player.users.username,
        rating: player.current_rating,
        matches_played:
          player.users.elo_history_elo_history_user_idTousers.length,
      }));

      // Estadísticas totales
      const totalPlayers = await prisma.users.count();
      const totalMatches = await prisma.matches.count();

      return {
        topPlayers: formattedTopPlayers,
        totalPlayers,
        totalMatches,
      };
    } catch (error) {
      throw error;
    } finally {
      await prisma.$disconnect();
    }
  }

  // Head-to-head 1v1 entre dos usuarios
  static async getHeadToHead1v1(username1, username2) {
    try {
      // 1. Verificar que los usuarios existan
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

      if (!user1 || !user2) {
        throw new Error("Error al encontrar los usuarios");
      }

      const player1Id = user1.id;
      const player2Id = user2.id;

      // 2. Buscar partidos 1v1 entre estos usuarios
      const matchesRaw = await prisma.$queryRaw`
        SELECT 
          m.id,
          m.teama_goals,
          m.teamb_goals,
          m.went_to_penalties,
          m.penalty_winner,
          m.created_at,
          mp1.team as player1_team,
          mp2.team as player2_team
        FROM matches m
        JOIN match_players mp1 ON m.id = mp1.match_id AND mp1.user_id = ${player1Id}
        JOIN match_players mp2 ON m.id = mp2.match_id AND mp2.user_id = ${player2Id}
        WHERE m.match_type = '1v1' 
          AND mp1.team != mp2.team
        ORDER BY m.created_at DESC
      `;

      // 3. Calcular estadísticas para jugador1
      const statsPlayer1 = {
        partidos_jugados: matchesRaw.length,
        partidos_ganados: 0,
        partidos_perdidos: 0,
        partidos_empatados: 0,
        ganados_por_penales: 0,
        perdidos_por_penales: 0,
        goles_a_favor: 0,
        goles_en_contra: 0,
        diferencia_goles: 0,
        winrate: 0,
        winrate_with_penalties: 0,
      };

      // 4. Obtener ELO ratings individuales de ambos jugadores
      const eloPlayer1 = await prisma.user_elo_ratings.findFirst({
        where: {
          user_id: player1Id,
          elo_type: "1v1",
        },
      });

      const eloPlayer2 = await prisma.user_elo_ratings.findFirst({
        where: {
          user_id: player2Id,
          elo_type: "1v1",
        },
      });

      // 5. Obtener últimos 5 partidos para cada jugador
      const last5MatchesPlayer1 = await prisma.$queryRaw`
      SELECT 
        m.id,
        m.teama_goals,
        m.teamb_goals,
        m.went_to_penalties,
        m.penalty_winner,
        mp.team,
        CASE 
          WHEN (mp.team = 'A' AND m.teama_goals > m.teamb_goals) OR 
               (mp.team = 'B' AND m.teamb_goals > m.teama_goals) THEN 'G'
          WHEN (mp.team = 'A' AND m.teama_goals < m.teamb_goals) OR 
               (mp.team = 'B' AND m.teamb_goals < m.teama_goals) THEN 'P'
          WHEN m.went_to_penalties = 1 THEN 'E'
          ELSE 'E'
        END as resultado
      FROM matches m
      JOIN match_players mp ON m.id = mp.match_id
      WHERE mp.user_id = ${player1Id} AND m.match_type = '1v1'
      ORDER BY m.created_at DESC
      LIMIT 5
    `;

      const last5MatchesPlayer2 = await prisma.$queryRaw`
      SELECT 
        m.id,
        m.teama_goals,
        m.teamb_goals,
        m.went_to_penalties,
        m.penalty_winner,
        mp.team,
        CASE 
          WHEN (mp.team = 'A' AND m.teama_goals > m.teamb_goals) OR 
               (mp.team = 'B' AND m.teamb_goals > m.teama_goals) THEN 'G'
          WHEN (mp.team = 'A' AND m.teama_goals < m.teamb_goals) OR 
               (mp.team = 'B' AND m.teamb_goals < m.teama_goals) THEN 'P'
          WHEN m.went_to_penalties = 1 THEN 'E'
          ELSE 'E'
        END as resultado
      FROM matches m
      JOIN match_players mp ON m.id = mp.match_id
      WHERE mp.user_id = ${player2Id} AND m.match_type = '1v1'
      ORDER BY m.created_at DESC
      LIMIT 5
    `;
      // Inicializar stats para jugador2 (será opuesto al jugador1)
      const statsPlayer2 = {
        partidos_jugados: matchesRaw.length,
        partidos_ganados: 0,
        partidos_perdidos: 0,
        partidos_empatados: 0,
        ganados_por_penales: 0,
        perdidos_por_penales: 0,
        goles_a_favor: 0,
        goles_en_contra: 0,
        diferencia_goles: 0,
        winrate: 0,
        winrate_with_penalties: 0,
      };

      matchesRaw.forEach((match) => {
        const player1Team = match.player1_team;
        const player2Team = match.player2_team;

        // Goles para jugador1
        const gf1 =
          player1Team === "A"
            ? Number(match.teama_goals)
            : Number(match.teamb_goals);
        const gc1 =
          player1Team === "A"
            ? Number(match.teamb_goals)
            : Number(match.teama_goals);

        // Goles para jugador2
        const gf2 =
          player2Team === "A"
            ? Number(match.teama_goals)
            : Number(match.teamb_goals);
        const gc2 =
          player2Team === "A"
            ? Number(match.teamb_goals)
            : Number(match.teama_goals);

        // Actualizar stats jugador1
        statsPlayer1.goles_a_favor += gf1;
        statsPlayer1.goles_en_contra += gc1;

        // Actualizar stats jugador2
        statsPlayer2.goles_a_favor += gf2;
        statsPlayer2.goles_en_contra += gc2;

        if (gf1 > gc1) {
          // Jugador1 gana
          statsPlayer1.partidos_ganados++;
          statsPlayer2.partidos_perdidos++;
        } else if (gf1 < gc1) {
          // Jugador2 gana
          statsPlayer1.partidos_perdidos++;
          statsPlayer2.partidos_ganados++;
        } else {
          // Empate
          statsPlayer1.partidos_empatados++;
          statsPlayer2.partidos_empatados++;

          if (match.went_to_penalties) {
            if (match.penalty_winner === player1Team) {
              statsPlayer1.ganados_por_penales++;
              statsPlayer2.perdidos_por_penales++;
            } else {
              statsPlayer1.perdidos_por_penales++;
              statsPlayer2.ganados_por_penales++;
            }
          }
        }
      });

      // Calcular estadísticas finales para ambos jugadores
      [statsPlayer1, statsPlayer2].forEach((stats) => {
        stats.diferencia_goles = stats.goles_a_favor - stats.goles_en_contra;

        if (stats.partidos_jugados > 0) {
          stats.winrate = Number(
            ((stats.partidos_ganados / stats.partidos_jugados) * 100).toFixed(2)
          );
          stats.winrate_with_penalties = Number(
            (
              ((stats.partidos_ganados + stats.ganados_por_penales) /
                stats.partidos_jugados) *
              100
            ).toFixed(2)
          );
        }
      });

      return {
        jugador1: {
          id: player1Id,
          username: user1.username,
          elo: eloPlayer1?.current_rating || 1200,
          ultimos_5_partidos: last5MatchesPlayer1.map(
            (match) => match.resultado
          ),
          estadisticas: statsPlayer1,
        },
        jugador2: {
          id: player2Id,
          username: user2.username,
          elo: eloPlayer2?.current_rating || 1200,
          ultimos_5_partidos: last5MatchesPlayer2.map(
            (match) => match.resultado
          ),
          estadisticas: statsPlayer2,
        },
      };
    } catch (error) {
      console.error("Error en getHeadToHead1v1:", error);
      throw error;
    }
  }

  // Head-to-head 2v2 entre dos parejas
  static async getHeadToHead2v2(username1, username2, username3, username4) {
    try {
      // 1. Verificar que los 4 usuarios existan y sean únicos
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

      if (!user1 || !user2 || !user3 || !user4) {
        throw new Error("Error al mapear usuarios");
      }

      // 2. Buscar partidos donde estén las dos parejas enfrentadas
      const matchesRaw = await prisma.$queryRaw`
        SELECT 
          m.id,
          m.teama_goals,
          m.teamb_goals,
          m.went_to_penalties,
          m.penalty_winner,
          m.created_at,
          mp1.team as user1_team,
          mp2.team as user2_team,
          mp3.team as user3_team,
          mp4.team as user4_team
        FROM matches m
        JOIN match_players mp1 ON m.id = mp1.match_id AND mp1.user_id = ${user1.id}
        JOIN match_players mp2 ON m.id = mp2.match_id AND mp2.user_id = ${user2.id}
        JOIN match_players mp3 ON m.id = mp3.match_id AND mp3.user_id = ${user3.id}
        JOIN match_players mp4 ON m.id = mp4.match_id AND mp4.user_id = ${user4.id}
        WHERE m.match_type = '2v2'
          AND mp1.team = mp2.team
          AND mp3.team = mp4.team
          AND mp1.team != mp3.team
        ORDER BY m.created_at DESC
      `;

      // 3. Calcular estadísticas
      const statsPair1 = {
        partidos_jugados: matchesRaw.length,
        partidos_ganados: 0,
        partidos_perdidos: 0,
        partidos_empatados: 0,
        ganados_por_penales: 0,
        perdidos_por_penales: 0,
        goles_a_favor: 0,
        goles_en_contra: 0,
        diferencia_goles: 0,
        winrate: 0,
        winrate_with_penalties: 0,
      };

      const statsPair2 = {
        partidos_jugados: matchesRaw.length,
        partidos_ganados: 0,
        partidos_perdidos: 0,
        partidos_empatados: 0,
        ganados_por_penales: 0,
        perdidos_por_penales: 0,
        goles_a_favor: 0,
        goles_en_contra: 0,
        diferencia_goles: 0,
        winrate: 0,
        winrate_with_penalties: 0,
      };

      // 4. Obtener ELO de las parejas
      const pair1Elo = await prisma.pair_elo_ratings.findFirst({
        where: {
          OR: [
            { user1_id: user1.id, user2_id: user2.id },
            { user1_id: user2.id, user2_id: user1.id },
          ],
        },
      });

      const pair2Elo = await prisma.pair_elo_ratings.findFirst({
        where: {
          OR: [
            { user1_id: user3.id, user2_id: user4.id },
            { user1_id: user4.id, user2_id: user3.id },
          ],
        },
      });

      // 5. Obtener últimos 5 partidos para cada pareja
      const last5MatchesPair1 = await prisma.$queryRaw`
      SELECT 
        m.id,
        m.teama_goals,
        m.teamb_goals,
        m.went_to_penalties,
        m.penalty_winner,
        mp1.team,
        CASE 
          WHEN (mp1.team = 'A' AND m.teama_goals > m.teamb_goals) OR 
               (mp1.team = 'B' AND m.teamb_goals > m.teama_goals) THEN 'G'
          WHEN (mp1.team = 'A' AND m.teama_goals < m.teamb_goals) OR 
               (mp1.team = 'B' AND m.teamb_goals < m.teama_goals) THEN 'P'
          WHEN m.went_to_penalties = 1 THEN 'E'
          ELSE 'E'
        END as resultado
      FROM matches m
      JOIN match_players mp1 ON m.id = mp1.match_id
      JOIN match_players mp2 ON m.id = mp2.match_id
      WHERE mp1.user_id = ${user1.id} 
        AND mp2.user_id = ${user2.id}
        AND mp1.team = mp2.team
        AND m.match_type = '2v2'
      ORDER BY m.created_at DESC
      LIMIT 5
    `;

      const last5MatchesPair2 = await prisma.$queryRaw`
      SELECT 
        m.id,
        m.teama_goals,
        m.teamb_goals,
        m.went_to_penalties,
        m.penalty_winner,
        mp1.team,
        CASE 
          WHEN (mp1.team = 'A' AND m.teama_goals > m.teamb_goals) OR 
               (mp1.team = 'B' AND m.teamb_goals > m.teama_goals) THEN 'G'
          WHEN (mp1.team = 'A' AND m.teama_goals < m.teamb_goals) OR 
               (mp1.team = 'B' AND m.teamb_goals < m.teama_goals) THEN 'P'
          WHEN m.went_to_penalties = 1 THEN 'E'
          ELSE 'E'
        END as resultado
      FROM matches m
      JOIN match_players mp1 ON m.id = mp1.match_id
      JOIN match_players mp2 ON m.id = mp2.match_id
      WHERE mp1.user_id = ${user3.id} 
        AND mp2.user_id = ${user4.id}
        AND mp1.team = mp2.team
        AND m.match_type = '2v2'
      ORDER BY m.created_at DESC
      LIMIT 5
    `;
      const matchDetails = [];

      matchesRaw.forEach((match) => {
        // Asumimos que user1 y user2 están en el mismo equipo (pareja 1)
        // y user3 y user4 están en el mismo equipo (pareja 2)
        const pair1Team = match.user1_team; // También debería ser igual a user2_team
        const pair2Team = match.user3_team; // También debería ser igual a user4_team

        // Goles para pareja 1
        const gf1 =
          pair1Team === "A"
            ? Number(match.teama_goals)
            : Number(match.teamb_goals);
        const gc1 =
          pair1Team === "A"
            ? Number(match.teamb_goals)
            : Number(match.teama_goals);

        // Goles para pareja 2
        const gf2 =
          pair2Team === "A"
            ? Number(match.teama_goals)
            : Number(match.teamb_goals);
        const gc2 =
          pair2Team === "A"
            ? Number(match.teamb_goals)
            : Number(match.teama_goals);

        // Actualizar estadísticas
        statsPair1.goles_a_favor += gf1;
        statsPair1.goles_en_contra += gc1;
        statsPair2.goles_a_favor += gf2;
        statsPair2.goles_en_contra += gc2;

        if (gf1 > gc1) {
          // Pareja 1 gana
          statsPair1.partidos_ganados++;
          statsPair2.partidos_perdidos++;
        } else if (gf1 < gc1) {
          // Pareja 2 gana
          statsPair1.partidos_perdidos++;
          statsPair2.partidos_ganados++;
        } else {
          // Empate
          statsPair1.partidos_empatados++;
          statsPair2.partidos_empatados++;

          if (match.went_to_penalties) {
            if (match.penalty_winner === pair1Team) {
              statsPair1.ganados_por_penales++;
              statsPair2.perdidos_por_penales++;
            } else {
              statsPair1.perdidos_por_penales++;
              statsPair2.ganados_por_penales++;
            }
          }
        }
      });

      // Calcular estadísticas finales
      [statsPair1, statsPair2].forEach((stats) => {
        stats.diferencia_goles = stats.goles_a_favor - stats.goles_en_contra;

        if (stats.partidos_jugados > 0) {
          stats.winrate = Number(
            ((stats.partidos_ganados / stats.partidos_jugados) * 100).toFixed(2)
          );
          stats.winrate_with_penalties = Number(
            (
              ((stats.partidos_ganados + stats.ganados_por_penales) /
                stats.partidos_jugados) *
              100
            ).toFixed(2)
          );
        }
      });

      return {
        pareja1: {
          nombre_pareja: `${user1.username} & ${user2.username}`,
          elo: pair1Elo?.current_rating || 1200,
          ultimos_5_partidos: last5MatchesPair1.map((match) => match.resultado),
          estadisticas: statsPair1,
        },
        pareja2: {
          nombre_pareja: `${user3.username} & ${user4.username}`,
          elo: pair2Elo?.current_rating || 1200,
          ultimos_5_partidos: last5MatchesPair2.map((match) => match.resultado),
          estadisticas: statsPair2,
        },
      };
    } catch (error) {
      console.error("Error en getHeadToHead2v2:", error);
      throw error;
    }
  }
}

module.exports = Stats;
