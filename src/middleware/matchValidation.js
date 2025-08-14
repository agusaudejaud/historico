const validateMatchCreation = (req, res, next) => {
  const {
    teamA_players,
    teamB_players,
    teamA_goals,
    teamB_goals,
    match_type,
    went_to_penalties,
  } = req.body;

  const errors = [];

  // Validar equipos
  if (!Array.isArray(teamA_players) || teamA_players.length === 0) {
    errors.push("Team A debe tener al menos un jugador");
  }
  if (!Array.isArray(teamB_players) || teamB_players.length === 0) {
    errors.push("Team B debe tener al menos un jugador");
  }

  // Validar jugadores duplicados
  const allPlayers = [...teamA_players, ...teamB_players];
  if (new Set(allPlayers).size !== allPlayers.length) {
    errors.push("Un jugador no puede estar en ambos equipos");
  }

  // Validar goles
  if (!Number.isInteger(teamA_goals) || teamA_goals < 0) {
    errors.push("Los goles del Team A deben ser un número entero >= 0");
  }
  if (!Number.isInteger(teamB_goals) || teamB_goals < 0) {
    errors.push("Los goles del Team B deben ser un número entero >= 0");
  }

  // Validar tipo de partido
  if (!["1v1", "2v2"].includes(match_type)) {
    errors.push('El tipo de partido debe ser "1v1" o "2v2"');
  }

  // Validar penales
  if (typeof went_to_penalties !== "boolean") {
    errors.push('El campo "went_to_penalties" debe ser booleano');
  }

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      message: "Errores de validación",
      errors,
    });
  }

  next();
};


module.exports = {
  validateMatchCreation,
};
