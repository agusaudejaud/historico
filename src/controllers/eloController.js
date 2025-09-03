const ELO = require("../services/eloService");

// Obtener leaderboard global (modificado para paginación)
exports.getGlobalLeaderboard = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const page = parseInt(req.query.page) || 1;
    const eloType = req.query.type || "global";

    if (!["global", "1v1", "2v2"].includes(eloType)) {
      return res.status(400).json({
        error: "Tipo de ELO inválido. Usa: global, 1v1, o 2v2",
      });
    }

    const leaderboard = await ELO.getGlobalLeaderboard(limit, eloType, page);

    res.json({
      success: true,
      data: leaderboard.data,
      total: leaderboard.total,
      page,
      limit,
      elo_type: eloType,
    });
  } catch (error) {
    console.error("Error getting global leaderboard:", error);
    res.status(500).json({
      error: "Error al obtener el ranking global",
      details: error.message,
    });
  }
};

// Obtener leaderboard de parejas (modificado para paginación)
exports.getPairLeaderboard = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const page = parseInt(req.query.page) || 1;

    const leaderboard = await ELO.getPairLeaderboard(limit, page);

    res.json({
      success: true,
      data: leaderboard.data,
      total: leaderboard.total,
      page,
      limit,
      type: "pairs",
    });
  } catch (error) {
    console.error("Error getting pair leaderboard:", error);
    res.status(500).json({
      error: "Error al obtener el ranking de parejas",
      details: error.message,
    });
  }
};

exports.getELOHistory = async (req, res) => {
  try {
    const { username } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const eloType = req.query.type || "global";
    const { startDate, endDate } = req.query;

    if (!["global", "1v1", "2v2"].includes(eloType)) {
      return res.status(400).json({
        success: false,
        error: "Tipo de ELO inválido. Usa: global, 1v1, o 2v2",
      });
    }

    // Validación de fechas (opcional)
    if ((startDate && !endDate) || (!startDate && endDate)) {
      return res.status(400).json({
        success: false,
        error: "Si proporcionas fechas, debes incluir tanto startDate como endDate",
      });
    }

    const dateFilter = startDate && endDate ? { startDate, endDate } : undefined;

    const history = await ELO.getELOHistory(username, eloType, { 
      page, 
      limit,
      dateFilter 
    });

    res.json({
      success: true,
      ...history,
    });
  } catch (error) {
    console.error("Error getting ELO history:", error);
    res.status(500).json({
      success: false,
      error: "Error al obtener el historial de ELO",
      details: error.message,
    });
  }
};

// Controller para historial de parejas con fechas
exports.getPairELOHistory = async (req, res) => {
  try {
    const { username1, username2 } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const { startDate, endDate } = req.query;

    // Validación adicional
    if (!username1 || !username2) {
      return res.status(400).json({
        success: false,
        error: "Se requieren dos nombres de usuario",
      });
    }

    if (username1 === username2) {
      return res.status(400).json({
        success: false,
        error: "Los nombres de usuario deben ser diferentes",
      });
    }

    // Validación de fechas (opcional)
    if ((startDate && !endDate) || (!startDate && endDate)) {
      return res.status(400).json({
        success: false,
        error: "Si proporcionas fechas, debes incluir tanto startDate como endDate",
      });
    }

    const dateFilter = startDate && endDate ? { startDate, endDate } : undefined;

    const history = await ELO.getPairELOHistory(username1, username2, {
      page,
      limit,
      dateFilter
    });

    // Respuesta mejorada
    res.json({
      success: true,
      ...history,
    });
  } catch (error) {
    console.error("Error getting pair ELO history:", error);
    res.status(500).json({
      success: false,
      error: "Error al obtener el historial de ELO de la pareja",
      details: error.message,
      suggestion: "Verifica que ambos usuarios existan y hayan jugado juntos",
    });
  }
};


/* Recalcular ELO completo (función de admin)
exports.recalculateELO = async (req, res) => {
  try {
    console.log('Iniciando recálculo completo del sistema ELO...');
    
    const result = await ELO.recalculateAllELO();
    
    console.log('Recálculo completado exitosamente');
    
    res.json({
      success: true,
      message: 'Todo el sistema ELO ha sido recalculado desde cero',
      data: result
    });
  } catch (error) {
    console.error('Error recalculating ELO:', error);
    res.status(500).json({
      error: 'Error al recalcular ELO',
      details: error.message
    });
  }
}; 

// Procesar un match específico (función de admin)
exports.processMatch = async (req, res) => {
  try {
    const { matchId } = req.params;
    
    if (!matchId) {
      return res.status(400).json({
        error: 'ID de partido requerido'
      });
    }

    const result = await ELO.processMatchResult(parseInt(matchId));
    
    res.json({
      success: true,
      message: `Partido ${matchId} procesado correctamente`,
      data: result
    });
  } catch (error) {
    console.error('Error processing match:', error);
    res.status(500).json({
      error: 'Error al procesar el partido',
      details: error.message
    });
  }
}; */
