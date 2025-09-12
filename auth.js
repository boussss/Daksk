const jwt = require('jsonwebtoken');
const User = require('./models').User;
const config = require('./config');

const protect = async (req, res, next) => {
    let token;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        try {
            token = req.headers.authorization.split(' ')[1];
            const decoded = jwt.verify(token, config.jwtSecret);
            req.user = await User.findById(decoded.id).select('-password');

            if (!req.user) {
                return res.status(401).json({ message: 'Não autorizado, usuário não encontrado.' });
            }

            if (req.user.isBlocked) {
                return res.status(403).json({ message: 'Sua conta está bloqueada. Contacte o suporte.' });
            }
            
            next();
        } catch (error) {
            console.error('Erro de autenticação:', error.message);
            res.status(401).json({ message: 'Não autorizado, token inválido.' });
        }
    }

    if (!token) {
        res.status(401).json({ message: 'Não autorizado, nenhum token fornecido.' });
    }
};

const admin = (req, res, next) => {
    if (req.user && req.user.role === 'admin') {
        next();
    } else {
        res.status(403).json({ message: 'Acesso negado. Rota exclusiva para administradores.' });
    }
};

module.exports = { protect, admin };