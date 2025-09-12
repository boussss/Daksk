// auth.js
const jwt = require('jsonwebtoken');
const { User, Admin } = require('./models');
const config = require('./config');

/**
 * Middleware para proteger rotas de usuário.
 */
const protectUser = async (req, res, next) => {
  let token;
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      token = req.headers.authorization.split(' ')[1];
      const decoded = jwt.verify(token, config.jwtSecret);
      req.user = await User.findById(decoded.id).select('-pin');
      if (!req.user || req.user.isBlocked) {
         return res.status(401).json({ message: 'Acesso não autorizado, usuário bloqueado ou não encontrado.' });
      }
      next();
    } catch (error) {
      return res.status(401).json({ message: 'Acesso não autorizado, token inválido.' });
    }
  } else {
    return res.status(401).json({ message: 'Acesso não autorizado, token não fornecido.' });
  }
};

/**
 * Middleware para proteger rotas de admin.
 */
const protectAdmin = async (req, res, next) => {
  let token;
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      token = req.headers.authorization.split(' ')[1];
      const decoded = jwt.verify(token, config.jwtSecret);
      req.admin = await Admin.findById(decoded.id).select('-password');
      if (!req.admin) {
        return res.status(401).json({ message: 'Acesso de administrador não autorizado.' });
      }
      next();
    } catch (error) {
      return res.status(401).json({ message: 'Acesso de administrador não autorizado, token inválido.' });
    }
  } else {
    return res.status(401).json({ message: 'Acesso de administrador não autorizado, token não fornecido.' });
  }
};

module.exports = {
  protectUser,
  protectAdmin,
};