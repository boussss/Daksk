// utils.js
const jwt = require('jsonwebtoken');
const config = require('./config');

/**
 * Gera um ID numérico de 5 dígitos.
 * A unicidade será verificada no banco de dados.
 * @returns {number} Um número de 5 dígitos.
 */
const generateUniqueUserId = () => {
  return Math.floor(10000 + Math.random() * 90000);
};

/**
 * Cria o link de convite único para um usuário, apontando para a página de registro.
 * @param {string} userId - O ID de 5 dígitos do usuário.
 * @returns {string} A URL completa de convite.
 */
const generateInviteLink = (userId) => {
  // Se a BASE_URL não estiver configurada, lança um erro para alertar o administrador.
  if (!config.baseUrl) {
    console.error("ERRO CRÍTICO: A variável BASE_URL não está definida no arquivo .env. Os links de convite não funcionarão.");
    return `Erro: BASE_URL não configurada.`;
  }
  // Constrói a URL completa, garantindo que a página de registro seja incluída.
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

module.exports = {
  generateUniqueUserId,
  generateInviteLink,
  generateToken,
};