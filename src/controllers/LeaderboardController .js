const ELO = require("../services/eloService");

class LeaderboardController {
  // 🎯 Ranking inteligente
  static async getSmartLeaderboard(req, res) {
    try {
      const {
        limit = 50,
        type = "global",
        page = 1,
        startDate,
        endDate,
      } = req.query;

      if (!startDate || !endDate) {
        return res.status(400).json({
          success: false,
          error: "Debes proporcionar startDate y endDate en la query",
        });
      }

      const leaderboard = await ELO.getSmartLeaderboard(
        parseInt(limit),
        type,
        parseInt(page),
        { startDate, endDate }
      );

      res.json({
        success: true,
        ...leaderboard,
      });
    } catch (error) {
      console.error("Error en getSmartLeaderboard controller:", error);
      res.status(500).json({
        success: false,
        error: "Error al obtener el ranking inteligente",
      });
    }
  }

  // 🎯 Ranking inteligente para parejas
  static async getSmartPairLeaderboard(req, res) {
    try {
      const { limit = 50, page = 1, startDate, endDate } = req.query;

      if (!startDate || !endDate) {
        return res.status(400).json({
          success: false,
          error: "Debes proporcionar startDate y endDate en la query",
        });
      }

      const leaderboard = await ELO.getSmartPairLeaderboard(
        parseInt(limit),
        parseInt(page),
        { startDate, endDate }
      );

      res.json({
        success: true,
        ...leaderboard,
      });
    } catch (error) {
      console.error("Error en getSmartPairLeaderboard controller:", error);
      res.status(500).json({
        success: false,
        error: "Error al obtener el ranking inteligente de parejas",
      });
    }
  }
}

module.exports = LeaderboardController;
