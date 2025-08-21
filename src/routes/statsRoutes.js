const express = require("express");
const router = express.Router();
const statsController = require("../controllers/statsController");
const { authenticateToken } = require("../middleware/authMiddleware");

// GET estadísticas para pareja 2v2
router.get(
  "/stats/:username1/:username2",
  authenticateToken,
  statsController.getStatsForPair2v2
);

// GET Obtener estadísticas de un usuario específico
router.get(
  "/stats/:username",
  authenticateToken,
  statsController.getStatsByUser
);



router.get('/landing', statsController.getLandingPageStats);

module.exports = router;
