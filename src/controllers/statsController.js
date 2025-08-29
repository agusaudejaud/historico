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
      stats: result.estadisticas,
    });
  } catch (err) {
    console.error("Error al obtener estadísticas para pareja:", err);
    if (err.message === "Uno o ambos usuarios no encontrados") {
      return res.status(404).json({ error: err.message });
    }
    res.status(500).json({ error: "Error interno", details: err.message });
  }
};

// Head-to-head 1v1
exports.getHeadToHead1v1 = async (req, res) => {
  const { username1, username2 } = req.params;

  if (!username1 || !username2 || username1 === username2) {
    return res.status(400).json({ error: "Usernames inválidos o repetidos" });
  }

  try {
    const result = await Stats.getHeadToHead1v1(username1, username2);
    res.json({
      success: true,
      data: result,
    });
  } catch (err) {
    console.error("Error al obtener head-to-head 1v1:", err);
    if (err.message === "Uno o ambos usuarios no encontrados") {
      return res.status(404).json({ error: err.message });
    }
    res.status(500).json({
      success: false,
      error: "Error interno",
      details: err.message,
    });
  }
};

// Head-to-head 2v2
exports.getHeadToHead2v2 = async (req, res) => {
  const { username1, username2, username3, username4 } = req.params;
  const usernames = [username1, username2, username3, username4];

  // Validar que todos los usernames sean únicos
  const uniqueUsernames = [...new Set(usernames)];
  if (uniqueUsernames.length !== 4 || usernames.some((u) => !u)) {
    return res.status(400).json({
      error: "Los 4 usuarios deben ser únicos y válidos",
    });
  }

  try {
    const result = await Stats.getHeadToHead2v2(
      username1,
      username2,
      username3,
      username4
    );
    res.json({
      success: true,
      data: result,
    });
  } catch (err) {
    console.error("Error al obtener head-to-head 2v2:", err);
    if (
      err.message.includes("no encontrados") ||
      err.message.includes("únicos")
    ) {
      return res.status(404).json({ error: err.message });
    }
    res.status(500).json({
      success: false,
      error: "Error interno",
      details: err.message,
    });
  }
};

exports.getLandingPageStats = async (req, res) => {
  try {
    const stats = await Stats.getLandingPageStats();
    res.json({
      success: true,
      data: {
        topPlayers: stats.topPlayers,
        totalStats: {
          players: stats.totalPlayers,
          matches: stats.totalMatches,
        },
      },
    });
  } catch (err) {
    console.error("Error al obtener estadísticas de landing:", err);
    res.status(500).json({
      success: false,
      error: "Error al obtener estadísticas generales",
      details: err.message,
    });
  }
};
