const { User } = require('./models');

/**
 * Gera um ID de usuário único, numérico e com 5 dígitos.
 * A função verifica no banco de dados para garantir a unicidade.
 * @returns {Promise<string>} Uma string contendo o ID único de 5 dígitos.
 */
const generateUniqueUserId = async () => {
  let userId;
  let isUnique = false;

  while (!isUnique) {
    // Gera um número aleatório entre 10000 e 99999
    const randomId = Math.floor(10000 + Math.random() * 90000);
    userId = randomId.toString();

    // Verifica se já existe um usuário com este ID no banco de dados
    const existingUser = await User.findOne({ userId: userId });
    
    // Se não encontrar nenhum usuário com esse ID, ele é único
    if (!existingUser) {
      isUnique = true;
    }
    // Se encontrar, o loop continuará para gerar um novo ID
  }
  
  return userId;
};

module.exports = {
  generateUniqueUserId,
};