const Match = require("../services/matchService");
const ELO = require("../services/eloService");

exports.createMatch = async (req, res) => {
  try {
    const userId = req.user.id;
    const matchData = {
      ...req.body,
      created_by: userId,
    };

    if (!matchData.teamA_players || !matchData.teamB_players) {
      return res.status(400).json({ error: "Faltan jugadores en los equipos" });
    }

    // 1. Crear el match
    const matchId = await Match.create(matchData);

    // 2. Procesar automáticamente el ELO del match recién creado
    try {
      await ELO.processMatchResult(matchId);
      console.log(`ELO procesado automáticamente para match ${matchId}`);
    } catch (eloError) {
      console.error(`Error procesando ELO para match ${matchId}:`, eloError);
      // No hacer que falle toda la creación del match por un error de ELO
      // Solo loggeamos el error y continuamos
    }

    res.status(201).json({
      message: "Partido creado exitosamente y ELO actualizado",
      matchId,
    });
  } catch (err) {
    console.error("Error al crear partido:", err);
    res.status(500).json({
      error: "Error al crear el partido",
      details: err.message,
    });
  }
};

exports.getMatches = async (req, res) => {
  try {
    // Get pagination and filter parameters
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const match_type = req.query.match_type; // '1v1' or '2v2'

    // Validate match type if provided
    if (match_type && !["1v1", "2v2"].includes(match_type)) {
      return res
        .status(400)
        .json({ error: 'Invalid match type. Use "1v1" or "2v2"' });
    }

    const result = await Match.getAll({ page, limit, match_type });

    if (!result || !result.data) {
      console.warn("getAll() returned undefined or null");
      return res.status(404).json({ error: "No matches found" });
    }

    res.json(result);
  } catch (err) {
    console.error("Detailed error getting matches:", {
      message: err.message,
      stack: err.stack,
      sqlMessage: err.sqlMessage,
    });

    res.status(500).json({
      error: "Error getting matches",
      details: err.message,
      sqlError: err.sqlMessage,
    });
  }
};

exports.getMatchesByUsername = async (req, res) => {
  const username = req.params.username;
  if (!username) {
    return res.status(400).json({ error: "Username not provided" });
  }

  try {
    // Get pagination and filter parameters
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const match_type = req.query.match_type; // '1v1' or '2v2'

    // Validate match type if provided
    if (match_type && !["1v1", "2v2"].includes(match_type)) {
      return res
        .status(400)
        .json({ error: 'Invalid match type. Use "1v1" or "2v2"' });
    }

    const result = await Match.getByUsername(username, {
      page,
      limit,
      match_type,
    });

    if (!result || !result.data || result.data.length === 0) {
      return res
        .status(404)
        .json({ message: "No matches found for this user" });
    }

    res.json(result);
  } catch (err) {
    console.error("Error getting user matches:", {
      username,
      error: err.stack,
      sqlError: err.sqlMessage,
    });

    if (err.message === "Usuario no encontrado") {
      return res.status(404).json({ error: err.message });
    }

    res.status(500).json({
      error: "Error getting user matches",
      details: err.message,
      sqlError: err.sqlMessage,
    });
  }
};

exports.getMatchesByPair2v2 = async (req, res) => {
  const { username1, username2 } = req.params;

  if (!username1 || !username2 || username1 === username2) {
    return res.status(400).json({ error: "Invalid or duplicate usernames" });
  }

  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;

    const result = await Match.getMatchesByPair2v2(username1, username2, {
      page,
      limit,
    });
    res.json(result);
  } catch (err) {
    console.error("Error getting matches by pair:", err);
    res.status(500).json({ error: "Internal error", details: err.message });
  }
};



exports.getHeadToHeadMatches1v1 = async (req, res) => {
  const { username1, username2 } = req.params;

  if (!username1 || !username2 || username1 === username2) {
    return res.status(400).json({ error: "Usernames inválidos o repetidos" });
  }

  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;

    const result = await Match.getHeadToHeadMatches1v1(username1, username2, {
      page,
      limit,
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (err) {
    console.error("Error al obtener head-to-head matches 1v1:", err);
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

// En matchController.js - Head-to-head matches 2v2
exports.getHeadToHeadMatches2v2 = async (req, res) => {
  const { username1, username2, username3, username4 } = req.params;
  const usernames = [username1, username2, username3, username4];

  // Validar que todos los usernames sean únicos
  const uniqueUsernames = [...new Set(usernames)];
  if (uniqueUsernames.length !== 4 || usernames.some(u => !u)) {
    return res.status(400).json({ 
      error: "Los 4 usuarios deben ser únicos y válidos" 
    });
  }

  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;

    const result = await Match.getHeadToHeadMatches2v2(
      username1,
      username2,
      username3,
      username4,
      { page, limit }
    );

    res.json({
      success: true,
      data: result,
    });
  } catch (err) {
    console.error("Error al obtener head-to-head matches 2v2:", err);
    if (err.message.includes("no encontrados") || err.message.includes("únicos")) {
      return res.status(404).json({ error: err.message });
    }
    res.status(500).json({
      success: false,
      error: "Error interno",
      details: err.message,
    });
  }
};

// solo caso de emergencia
exports.getMatchById = async (req, res) => {
  try {
    const matchId = parseInt(req.params.id);
    if (isNaN(matchId)) {
      return res.status(400).json({ error: "ID de partido inválido" });
    }

    const match = await Match.getById(matchId);
    res.json(match);
  } catch (err) {
    console.error("Error al obtener partido:", err);
    if (err.message === "Partido no encontrado") {
      return res.status(404).json({ error: err.message });
    }
    res
      .status(500)
      .json({ error: "Error al obtener el partido", details: err.message });
  }
};

exports.updateMatch = async (req, res) => {
  try {
    const matchId = parseInt(req.params.id);
    if (isNaN(matchId))
      return res.status(400).json({ error: "ID de partido inválido" });

    // 0) Partido actual (para saber quiénes estaban antes)
    const existingMatch = await Match.getById(matchId);

    // 🚫 Validar creador
    if (existingMatch.created_by !== req.user.id) {
      return res
        .status(403)
        .json({ error: "Solo el creador puede editar este partido" });
    }

    // 🚫 Validar tiempo (6 horas = 21600000 ms)
    const maxTimeMs = 6 * 60 * 60 * 1000;
    if (new Date() - new Date(existingMatch.created_at) > maxTimeMs) {
      return res
        .status(403)
        .json({
          error:
            "El partido solo puede editarse dentro de las 6 horas de creado",
        });
    }

    // Usuarios afectados: los que estaban, + (si vinieron) los nuevos
    let affectedUsers = [
      ...existingMatch.teamA_players,
      ...existingMatch.teamB_players,
    ];
    if (
      Array.isArray(req.body.teamA_players) ||
      Array.isArray(req.body.teamB_players)
    ) {
      const newUsers = [
        ...(req.body.teamA_players || []),
        ...(req.body.teamB_players || []),
      ];
      affectedUsers = [...new Set([...affectedUsers, ...newUsers])];
    }

    // 1) Revertir ELO de este partido
    try {
      await ELO.revertMatchResult(matchId);
    } catch (_) {}

    // 2) Actualizar el partido
    await Match.update(matchId, req.body);

    // 3) Recalcular ESTE partido
    try {
      await ELO.processMatchResult(matchId);
    } catch (_) {}

    // 4) Recalcular partidos posteriores donde participen usuarios afectados
    const eloTypes = ["global", "1v1", "2v2"];
    for (const eloType of eloTypes) {
      await ELO.recalculateSubsequentMatches(affectedUsers, eloType, matchId);
    }

    res.json({ message: "Partido actualizado y ELO recalculado", matchId });
  } catch (err) {
    console.error("Error al actualizar partido:", err);
    const status = err.message === "Partido no encontrado" ? 404 : 500;
    res
      .status(status)
      .json({ error: "Error al actualizar el partido", details: err.message });
  }
};

exports.deleteMatch = async (req, res) => {
  try {
    const matchId = parseInt(req.params.id);
    if (isNaN(matchId))
      return res.status(400).json({ error: "ID de partido inválido" });

    const existingMatch = await Match.getById(matchId);

    // 🚫 Validar creador
    if (existingMatch.created_by !== req.user.id) {
      return res
        .status(403)
        .json({ error: "Solo el creador puede eliminar este partido" });
    }

    // 🚫 Validar tiempo
    const maxTimeMs = 6 * 60 * 60 * 1000;
    if (new Date() - new Date(existingMatch.created_at) > maxTimeMs) {
      return res.status(403).json({
        error:
          "El partido solo puede eliminarse dentro de las 6 horas de creado",
      });
    }
    const affectedUsers = [
      ...existingMatch.teamA_players,
      ...existingMatch.teamB_players,
    ];

    try {
      await ELO.revertMatchResult(matchId);
    } catch (_) {}
    await Match.delete(matchId);

    const eloTypes = ["global", "1v1", "2v2"];
    for (const eloType of eloTypes) {
      await ELO.recalculateSubsequentMatches(affectedUsers, eloType, matchId);
    }

    res.json({ message: "Partido eliminado y ELO recalculado", matchId });
  } catch (err) {
    const status = err.message === "Partido no encontrado" ? 404 : 500;
    res
      .status(status)
      .json({ error: "Error al eliminar el partido", details: err.message });
  }
};
