const express = require("express");
const router = express.Router();
const matchController = require("../controllers/matchController");
const { authenticateToken } = require("../middleware/authMiddleware");
const { validateMatchCreation } = require("../middleware/matchValidation");

// POST Crear match (requiere autenticación)
router.post(
  "/matches",
  authenticateToken,
  validateMatchCreation,
  matchController.createMatch
);

// GET Obtener todos los matches
router.get("/matches", authenticateToken, matchController.getMatches);

// GET Obtener matches por usuario
router.get(
  "/matches/:username",
  authenticateToken,
  matchController.getMatchesByUsername
);

router.get(
  "/matches/:username1/:username2",
  authenticateToken,
  matchController.getMatchesByPair2v2
);

module.exports = router;
