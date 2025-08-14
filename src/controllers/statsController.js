const Stats = require("../services/statsService");

//estadisticas
exports.getStatsByUser = async (req, res) => {
  const username = req.params.username;
  if (!username) {
    return res.status(400).json({ error: "Username no proporcionado" });
  }

  try {
    const stats = await Stats.getStatsByUsername(username);
    res.json(stats);
  } catch (err) {
    console.error("Error al obtener estadísticas:", err);
    if (err.message === "Usuario no encontrado") {
      return res.status(404).json({ error: err.message });
    }
    res
      .status(500)
      .json({ error: "Error al obtener estadísticas", details: err.message });
  }
};

//Estadisticas de parejas

exports.getStatsForPair2v2 = async (req, res) => {
  const username1 = req.params.username1;
  const username2 = req.params.username2;

  if (!username1 || !username2 || username1 === username2) {
    return res.status(400).json({ error: "Usernames inválidos o repetidos" });
  }

  try {
    const result = await Stats.getStatsByPair2v2(username1, username2);
    res.json({
      team: `${result.jugador1.username} & ${result.jugador2.username}`,
      stats: result.estadisticas
    });
  } catch (err) {
    console.error("Error al obtener estadísticas para pareja:", err);
    if (err.message === "Uno o ambos usuarios no encontrados") {
      return res.status(404).json({ error: err.message });
    }
    res.status(500).json({ error: "Error interno", details: err.message });
  }
};

// Estadísticas cara a cara entre dos usuarios
exports.getHeadToHeadStats = async (req, res) => {
  const username1 = req.params.username1;
  const username2 = req.params.username2;

  if (!username1 || !username2 || username1 === username2) {
    return res.status(400).json({ 
      error: "Se requieren dos usernames diferentes" 
    });
  }

  try {
    const result = await Stats.getHeadToHeadStats(username1, username2);

    res.json({
      enfrentamiento: `${result.player1.username} vs ${result.player2.username}`,
      estadisticas: result.stats
    });
  } catch (err) {
    console.error("Error al obtener estadísticas cara a cara:", err);
    if (err.message === "Uno o ambos usuarios no encontrados") {
      return res.status(404).json({ error: err.message });
    }
    res.status(500).json({ 
      error: "Error interno al obtener estadísticas cara a cara", 
      details: err.message 
    });
  }
};

// Agregar este nuevo método al controlador
exports.getLandingPageStats = async (req, res) => {
  try {
    const stats = await Stats.getLandingPageStats();
    res.json({
      success: true,
      data: {
        topPlayers: stats.topPlayers,
        totalStats: {
          players: stats.totalPlayers,
          matches: stats.totalMatches
        }
      }
    });
  } catch (err) {
    console.error("Error al obtener estadísticas de landing:", err);
    res.status(500).json({ 
      success: false,
      error: "Error al obtener estadísticas generales",
      details: err.message 
    });
  }
};