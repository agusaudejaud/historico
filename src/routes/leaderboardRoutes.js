const express = require("express");
const router = express.Router();
const LeaderboardController = require("../controllers/LeaderboardController ");

// 🎯 Ranking inteligente (combina ELO + actividad + performance)
router.get("/", LeaderboardController.getSmartLeaderboard);

// 🎯 Ranking inteligente para PAREJAS
router.get("/teams/", LeaderboardController.getSmartPairLeaderboard);

module.exports = router;
