const express = require("express");
const router = express.Router();
const { authenticateToken } = require("../middleware/authMiddleware");
const eloController = require("../controllers/eloController");

// Rutas públicas - Rankings
router.get("/", authenticateToken, eloController.getGlobalLeaderboard);

router.get("/teams", authenticateToken, eloController.getPairLeaderboard);

// Rutas públicas - Historiales
router.get(
  "/history/:username",
  authenticateToken, authenticateToken,
  eloController.getELOHistory
);
router.get(
  "/history/:username1/:username2",
  authenticateToken,
  eloController.getPairELOHistory
);


router.get("/landing", eloController.getLandingStats);
module.exports = router;
