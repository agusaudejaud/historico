const ELO = require("../services/eloService");

class LeaderboardController {
  // 🎯 Ranking inteligente
  static async getSmartLeaderboard(req, res) {
    try {
      const { limit = 50, type = "global", page = 1, min_matches } = req.query;

      let leaderboard;
      if (min_matches) {
        leaderboard = await ELO.getActivePlayersLeaderboard(
          parseInt(limit),
          type,
          parseInt(min_matches)
        );
      } else {
        leaderboard = await ELO.getSmartLeaderboard(
          parseInt(limit),
          type,
          parseInt(page)
        );
      }

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

  static async getSmartPairLeaderboard(req, res) {
    try {
      const { limit = 50, page = 1, min_matches } = req.query;

      let leaderboard;
      if (min_matches) {
        leaderboard = await ELO.getActivePairsLeaderboard(
          parseInt(limit),
          parseInt(min_matches)
        );
      } else {
        leaderboard = await ELO.getSmartPairLeaderboard(
          parseInt(limit),
          parseInt(page)
        );
      }

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
