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

// GET Head-to-head matches 1v1 entre dos usuarios
router.get(
  "/:username1/vs/:username2",
  authenticateToken,
  matchController.getHeadToHeadMatches1v1
);

// GET Head-to-head matches 2v2 entre dos parejas
router.get(
  "/:username1/:username2/vs/:username3/:username4",
  authenticateToken,
  matchController.getHeadToHeadMatches2v2
);
// SOLO CASO DE EMERGENCIA
// GET Obtener partido por ID
router.get("/match/:id", authenticateToken, matchController.getMatchById);

// PUT Actualizar partido
router.put(
  "/match/:id",
  authenticateToken,
  validateMatchCreation,
  matchController.updateMatch
);

// DELETE Eliminar partido
router.delete("/match/:id", authenticateToken, matchController.deleteMatch);
module.exports = router;
