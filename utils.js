// utils.js

const config = require('./config');

/**
 * Gera um ID numérico de 5 dígitos.
 * A unicidade deste ID deverá ser verificada na base de dados
 * no momento da criação do usuário.
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
  // Assumindo que a página de cadastro no seu HTML único terá um ID ou forma de ser acessada
  // e que ela irá ler o parâmetro 'ref' da URL.
  return `${config.baseUrl}?ref=${userId}`;
};


module.exports = {
  generateUniqueUserId,
  generateInviteLink,
};