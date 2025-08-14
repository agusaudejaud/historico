const express = require("express");
const router = express.Router();
const {
  register,
  login,
  logout,
  profile,
  getUsernames,
  changePassword,
  updateProfile,
} = require("../controllers/authController");
const { authenticateToken } = require("../middleware/authMiddleware");
const {
  validateRegister,
  validateLogin,
  sanitizeBody,
  rateLimitLogin,
  validateChangePassword,
  validateUpdateProfile,
} = require("../middleware/validationMiddleware");

// Aplicar sanitización a todas las rutas
router.use(sanitizeBody);

// Registro - con validaciones completas
router.post("/register", validateRegister, register);

// Login - con validaciones y rate limiting
router.post("/login", validateLogin,rateLimitLogin, login);

// Logout
router.post("/logout", authenticateToken, logout);

// Perfil - requiere autenticación
router.get("/profile", authenticateToken, profile);
router.get("/usernames", getUsernames);

// Ruta para verificar el token (opcional)
router.get("/verify", authenticateToken, (req, res) => {
  res.json({
    success: true,
    message: "Token válido",
    user: req.user,
  });
});

router.put(
  "/change-password",
  authenticateToken,
  validateChangePassword,
  changePassword
);
router.put(
  "/update-profile",
  authenticateToken,
  validateUpdateProfile,
  updateProfile
);
module.exports = router;
