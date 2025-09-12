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
 * Cria o link de convite único para um usuário.
 * @param {string} userId - O ID de 5 dígitos do usuário.
 * @returns {string} A URL completa de convite.
 */
const generateInviteLink = (userId) => {
  return `${config.baseUrl}?ref=${userId}`;
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
  generateToken, // Exporte a nova função
};