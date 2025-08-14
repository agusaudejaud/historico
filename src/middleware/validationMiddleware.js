const validator = require("validator");

// Validación para registro

const validateRegister = (req, res, next) => {
  const { username, email, password } = req.body;
  const errors = [];

  // Validar username
  if (!username || typeof username !== "string") {
    errors.push("El nombre de usuario es requerido");
  } else {
    const trimmedUsername = username.trim();
    if (trimmedUsername.length < 3 || trimmedUsername.length > 20) {
      errors.push("El nombre de usuario debe tener entre 3 y 20 caracteres");
    }
    if (!/^[a-zA-ZñÑ0-9_]+$/.test(trimmedUsername)) {
      errors.push(
        "El nombre de usuario solo puede contener letras (incluyendo ñ), números y guiones bajos"
      );
    }
    req.body.username = trimmedUsername;
  }

  // Validar email
  if (!email || typeof email !== "string") {
    errors.push("El email es requerido");
  } else {
    const trimmedEmail = email.trim().toLowerCase();
    if (!validator.isEmail(trimmedEmail)) {
      errors.push("El formato del email no es válido");
    }
    if (trimmedEmail.length > 100) {
      errors.push("El email no puede exceder los 100 caracteres");
    }
    req.body.email = trimmedEmail;
  }

  // Validar password (requisitos más simples)
  if (!password || typeof password !== "string") {
    errors.push("La contraseña es requerida");
  } else {
    if (password.length < 6) {
      errors.push("La contraseña debe tener al menos 6 caracteres");
    }
    if (password.length > 128) {
      errors.push("La contraseña no puede exceder los 128 caracteres");
    }
    if (!/[a-zA-Z]/.test(password)) {
      errors.push("La contraseña debe contener al menos una letra");
    }
    if (!/[0-9]/.test(password)) {
      errors.push("La contraseña debe contener al menos un número");
    }
  }

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      message: "Errores de validación",
      errors: errors,
    });
  }

  next();
};

// Validación para login
const validateLogin = (req, res, next) => {
  const { email, password } = req.body;
  const errors = [];

  // Validar email
  if (!email || typeof email !== "string") {
    errors.push("El email es requerido");
  } else {
    const trimmedEmail = email.trim().toLowerCase();
    if (!validator.isEmail(trimmedEmail)) {
      errors.push("El formato del email no es válido");
    }
    req.body.email = trimmedEmail;
  }

  // Validar password
  if (!password || typeof password !== "string") {
    errors.push("La contraseña es requerida");
  } else {
    if (password.length < 1) {
      errors.push("La contraseña no puede estar vacía");
    }
    if (password.length > 128) {
      errors.push("La contraseña no puede exceder los 128 caracteres");
    }
  }

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      message: "Errores de validación",
      errors: errors,
    });
  }

  next();
};

// Middleware para sanitizar datos generales
const sanitizeBody = (req, res, next) => {
  if (req.body) {
    let allowedFields;

    if (req.path === "/change-password") {
      allowedFields = ["currentPassword", "newPassword"];
    } else if (req.path === "/update-profile") {
      allowedFields = ["username", "email"];
    } else {
      allowedFields = ["username", "email", "password"];
    }

    const sanitizedBody = {};
    for (const field of allowedFields) {
      if (req.body.hasOwnProperty(field)) {
        sanitizedBody[field] = req.body[field];
      }
    }

    req.body = sanitizedBody;
  }
  next();
};

// Middleware para prevenir ataques de fuerza bruta (básico)
const loginAttempts = new Map();

const rateLimitLogin = (req, res, next) => {
  const ip = req.ip || req.connection.remoteAddress;
  const now = Date.now();
  const windowMs = 10 * 60 * 1000; // 10 minutos
  const maxAttempts = 10;

  if (!loginAttempts.has(ip)) {
    loginAttempts.set(ip, { count: 1, resetTime: now + windowMs });
    return next();
  }

  const attempts = loginAttempts.get(ip);

  if (now > attempts.resetTime) {
    // Reiniciar contador
    attempts.count = 1;
    attempts.resetTime = now + windowMs;
    return next();
  }

  if (attempts.count >= maxAttempts) {
    return res.status(429).json({
      success: false,
      message: "Demasiados intentos de login. Intenta nuevamente en 5 minutos",
    });
  }

  attempts.count++;
  next();
};

const validateChangePassword = (req, res, next) => {
  const { currentPassword, newPassword } = req.body;
  const errors = [];

  if (!currentPassword || typeof currentPassword !== "string") {
    errors.push("La contraseña actual es requerida");
  }

  if (!newPassword || typeof newPassword !== "string") {
    errors.push("La nueva contraseña es requerida");
  } else {
    if (newPassword.length < 6) {
      errors.push("La nueva contraseña debe tener al menos 6 caracteres");
    }
    if (newPassword.length > 128) {
      errors.push("La nueva contraseña no puede exceder los 128 caracteres");
    }
    if (!/[a-zA-Z]/.test(newPassword)) {
      errors.push("La nueva contraseña debe contener al menos una letra");
    }
    if (!/[0-9]/.test(newPassword)) {
      errors.push("La nueva contraseña debe contener al menos un número");
    }
  }

  if (errors.length > 0) {
    return res.status(400).json({ success: false, errors });
  }

  next();
};

const validateUpdateProfile = (req, res, next) => {
  const { username, email } = req.body;
  const errors = [];

  // Validar username
  if (!username || typeof username !== "string") {
    errors.push("El nombre de usuario es requerido");
  } else {
    const trimmedUsername = username.trim();
    if (trimmedUsername.length < 3 || trimmedUsername.length > 20) {
      errors.push("El nombre de usuario debe tener entre 3 y 20 caracteres");
    }
    if (!/^[a-zA-ZñÑ0-9_]+$/.test(trimmedUsername)) {
      errors.push(
        "El nombre de usuario solo puede contener letras (incluyendo ñ), números y guiones bajos"
      );
    }
    req.body.username = trimmedUsername;
  }

  // Validar email
  if (!email || typeof email !== "string") {
    errors.push("El email es requerido");
  } else {
    const trimmedEmail = email.trim().toLowerCase();
    if (!validator.isEmail(trimmedEmail)) {
      errors.push("El formato del email no es válido");
    }
    if (trimmedEmail.length > 100) {
      errors.push("El email no puede exceder los 100 caracteres");
    }
    req.body.email = trimmedEmail;
  }

  if (errors.length > 0) {
    return res.status(400).json({ success: false, errors });
  }

  next();
};

module.exports = {
  validateRegister,
  validateLogin,
  sanitizeBody,
  rateLimitLogin,
  validateChangePassword,
  validateUpdateProfile,
};
