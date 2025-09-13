// utils.js
const jwt = require('jsonwebtoken');
const config = require('./config');

/**
 * Gera um ID numérico de 5 dígitos.
 * A unicidade será verificada no banco de dados.
 * @returns {string} Um número de 5 dígitos como string.
 */
const generateUniqueUserId = () => {
  return Math.floor(10000 + Math.random() * 90000).toString(); // Garantir que retorna string
};

/**
 * Cria o link de convite único para um usuário, apontando para a página de registro.
 * @param {string} userId - O ID de 5 dígitos do usuário.
 * @returns {string} A URL completa de convite.
 */
const generateInviteLink = (userId) => {
  if (!config.baseUrl) {
    console.error("ERRO CRÍTICO: A variável BASE_URL não está definida no arquivo .env. Os links de convite não funcionarão.");
    return `Erro: BASE_URL não configurada.`;
  }
  return `${config.baseUrl}/register.html?ref=${userId}`;
};

/**
 * Gera um token JWT para um ID de usuário ou admin.
 * @param {string} id - O ID do documento do MongoDB.
 * @returns {string} O token JWT.
 */
const generateToken = (id) => {
  return jwt.sign({ id }, config.jwtSecret, {
    expiresIn: '30d', // O token expira em 30 dias
  });
};

/**
 * Gera um código alfanumérico aleatório para sorteio.
 * @param {number} length - O comprimento desejado para o código.
 * @returns {string} O código de sorteio gerado.
 */
const generateLotteryCode = (length = 8) => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
};

module.exports = {
  generateUniqueUserId,
  generateInviteLink,
  generateToken,
  generateLotteryCode, // NOVO: Exportar a função
};