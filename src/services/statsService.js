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

      //console.log(`Getting stats for user: ${username} (${userId})`); // Debug log

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

      //console.log(`Found ${matchesRaw.length} matches for user`); // Debug log

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

      //console.log('ELO ratings found:', eloRatings); // Debug log

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
        elo: 1200,
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

      // FIX: Corregir mapeo de ELO types según el enum en tu schema
      eloRatings.forEach((rating) => {
        const eloTypeMapping = {
          global: "global",
          v1: "1v1", // El enum tiene 'v1' que mapea a '1v1'
          v2: "2v2", // El enum tiene 'v2' que mapea a '2v2'
          pair: null, // Ignorar 'pair' para estas estadísticas
        };

        const statsKey = eloTypeMapping[rating.elo_type];
        if (statsKey && stats[statsKey]) {
          stats[statsKey].elo = rating.current_rating || 1200;
        }
      });

      // Formatear parejas con más información
      stats.parejas = partnersRaw.map((row) => ({
        id: Number(row.user_id),
        username: row.username,
        partidos_jugados: Number(row.partidos_jugados),
        last_played: row.last_played,
      }));

      /* console.log('Final stats:', {
      global: stats.global.partidos_jugados,
      '1v1': stats["1v1"].partidos_jugados,
      '2v2': stats["2v2"].partidos_jugados,
      parejas: stats.parejas.length
    }); // Debug log */

      return stats;
    } catch (error) {
      console.error("Error en getStatsByUsername:", error);
      throw error;
    }
  }

  // Obtener estadísticas de enfrentamientos cara a cara entre dos usuarios
  static async getHeadToHeadStats(username1, username2) {
    try {
      const username1Lower = username1.toLowerCase();
      const username2Lower = username2.toLowerCase();

      // 1. Buscar los usuarios
      const users = await prisma.users.findMany({
        where: {
          username: {
            in: [username1Lower, username2Lower],
          },
        },
      });

      if (users.length !== 2) {
        throw new Error("Uno o ambos usuarios no encontrados");
      }

      const user1 = users.find(
        (u) => u.username.toLowerCase() === username1Lower
      );
      const user2 = users.find(
        (u) => u.username.toLowerCase() === username2Lower
      );
      const player1Id = user1.id;
      const player2Id = user2.id;

      // 2. Buscar partidos donde se enfrentaron (equipos diferentes)
      const matchesRaw = await prisma.$queryRaw`
        SELECT 
          m.id AS match_id,
          m.teamA_goals,
          m.teamB_goals,
          m.went_to_penalties,
          m.penalty_winner,
          m.match_type,
          m.created_at,
          mp1.team AS player1_team,
          mp2.team AS player2_team
        FROM matches m
        JOIN match_players mp1 ON m.id = mp1.match_id AND mp1.user_id = ${player1Id}
        JOIN match_players mp2 ON m.id = mp2.match_id AND mp2.user_id = ${player2Id}
        WHERE mp1.team != mp2.team
        ORDER BY m.created_at DESC
      `;

      // Inicializar estructura para global, 1v1 y 2v2
      const initStats = () => ({
        partidos_jugados: 0,
        victorias_player1: 0,
        victorias_player2: 0,
        empates: 0,
        victorias_player1_penales: 0,
        victorias_player2_penales: 0,
        diferencia_victorias: 0,
        diferencia_victorias_with_penalties: 0,
        padre: null,
        hijo: null,
      });

      const stats = {
        global: initStats(),
        "1v1": initStats(),
        "2v2": initStats(),
      };

      matchesRaw.forEach((match) => {
        const matchType = match.match_type === "1v1" ? "1v1" : "2v2";
        const grupos = [stats.global, stats[matchType]];

        // Determinar goles de cada jugador según su equipo
        const player1_esTeamA = match.player1_team === "A";
        const goles_player1 = player1_esTeamA
          ? match.teamA_goals
          : match.teamB_goals;
        const goles_player2 = player1_esTeamA
          ? match.teamB_goals
          : match.teamA_goals;

        grupos.forEach((st) => {
          st.partidos_jugados++;

          if (goles_player1 > goles_player2) {
            st.victorias_player1++;
          } else if (goles_player1 < goles_player2) {
            st.victorias_player2++;
          } else {
            st.empates++;

            if (match.went_to_penalties) {
              if (match.penalty_winner === match.player1_team) {
                st.victorias_player1_penales++;
              } else {
                st.victorias_player2_penales++;
              }
            }
          }
        });
      });

      // Calcular estadísticas finales para cada tipo
      ["global", "1v1", "2v2"].forEach((key) => {
        const s = stats[key];

        // Calcular total de victorias incluyendo penales
        const totalVictorias1 =
          s.victorias_player1 + s.victorias_player1_penales;
        const totalVictorias2 =
          s.victorias_player2 + s.victorias_player2_penales;

        // Determinar padre e hijo basado en victorias totales (con penales)
        if (totalVictorias1 > totalVictorias2) {
          s.padre = user1.username;
          s.hijo = user2.username;
          s.diferencia_victorias = s.victorias_player1 - s.victorias_player2;
          s.diferencia_victorias_with_penalties =
            totalVictorias1 - totalVictorias2;
        } else if (totalVictorias2 > totalVictorias1) {
          s.padre = user2.username;
          s.hijo = user1.username;
          s.diferencia_victorias = s.victorias_player2 - s.victorias_player1;
          s.diferencia_victorias_with_penalties =
            totalVictorias2 - totalVictorias1;
        } else {
          s.padre = null;
          s.hijo = null;
          s.diferencia_victorias = 0;
          s.diferencia_victorias_with_penalties = 0;
        }
      });

      return {
        player1: {
          username: user1.username,
          id: player1Id,
        },
        player2: {
          username: user2.username,
          id: player2Id,
        },
        stats,
      };
    } catch (error) {
      console.error("Error en getHeadToHeadStats:", error);
      throw error;
    }
  }
}

module.exports = Stats;
