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
    console.log(matchData);
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
