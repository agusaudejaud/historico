const { verifyToken } = require('../config/jwt');

const authenticateToken = (req, res, next) => {

  const token = req.cookies.token;
  
  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Token no proporcionado'
    });
  }
  
  try {
    const decoded = verifyToken(token);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(403).json({
      success: false,
      message: 'Token inválido'
    });
  }
};

module.exports = { authenticateToken };