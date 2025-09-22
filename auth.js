const jwt = require('jsonwebtoken');
const { User, Admin } = require('./models');
const dotenv = require('dotenv');

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET;

/**
 * Gera um token JWT para um ID específico.
 * @param {string} id - O ID do usuário ou admin do MongoDB.
 * @returns {string} O token JWT gerado.
 */
const generateToken = (id) => {
  return jwt.sign({ id }, JWT_SECRET, {
    expiresIn: '30d', // O token expira em 30 dias
  });
};

/**
 * Middleware para proteger rotas de usuários.
 * Verifica o token JWT no cabeçalho da requisição.
 */
const protectUser = async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      // Pega o token do cabeçalho (formato "Bearer TOKEN")
      token = req.headers.authorization.split(' ')[1];

      // Decodifica o token para obter o ID
      const decoded = jwt.verify(token, JWT_SECRET);

      // Encontra o usuário pelo ID e anexa o objeto do usuário à requisição (sem a senha)
      req.user = await User.findById(decoded.id).select('-password');
      
      if (!req.user) {
          return res.status(401).json({ message: 'Não autorizado, usuário não encontrado.' });
      }

      next(); // Passa para a próxima função/controller
    } catch (error) {
      console.error(error);
      return res.status(401).json({ message: 'Não autorizado, token inválido.' });
    }
  }

  if (!token) {
    return res.status(401).json({ message: 'Não autorizado, nenhum token fornecido.' });
  }
};

/**
 * Middleware para proteger rotas de administradores.
 * Verifica o token JWT e se o usuário é um admin.
 */
const protectAdmin = async (req, res, next) => {
    let token;
  
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      try {
        token = req.headers.authorization.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);
  
        // Encontra o admin pelo ID e anexa à requisição
        req.admin = await Admin.findById(decoded.id).select('-password');
        
        if (!req.admin) {
            return res.status(401).json({ message: 'Acesso negado. Apenas administradores.' });
        }

        next();
      } catch (error) {
        console.error(error);
        return res.status(401).json({ message: 'Não autorizado, token de admin inválido.' });
      }
    }
  
    if (!token) {
      return res.status(401).json({ message: 'Não autorizado, nenhum token de admin fornecido.' });
    }
};


module.exports = { generateToken, protectUser, protectAdmin };