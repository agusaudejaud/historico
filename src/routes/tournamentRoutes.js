const express = require("express");
const router = express.Router();
const tournamentController = require("../controllers/tournamentController");
const { authenticateToken } = require("../middleware/authMiddleware");

// GET todos los usuarios
router.get("/participants", authenticateToken, tournamentController.getUsers);

module.exports = router;