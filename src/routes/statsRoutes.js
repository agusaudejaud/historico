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

// GET Head-to-head 1v1 entre dos usuarios
router.get(
  "/stats/:username1/vs/:username2",
  authenticateToken,
  statsController.getHeadToHead1v1
);

// GET Head-to-head 2v2 entre dos parejas
router.get(
  "/stats/:username1/:username2/vs/:username3/:username4",
  authenticateToken,
  statsController.getHeadToHead2v2
);

router.get("/landing", statsController.getLandingPageStats);
module.exports = router;
