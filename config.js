// config.js
require('dotenv').config();

// Este módulo centraliza todas as variáveis de ambiente da aplicação.
module.exports = {
  // String de conexão com o banco de dados MongoDB Atlas.
  mongodbUri: process.env.MONGODB_URI,

  // Credenciais da API do Cloudinary para armazenamento e gerenciamento de imagens.
  cloudinary: {
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  },

  // URL base da aplicação, usada principalmente para construir os links de convite.
  baseUrl: process.env.BASE_URL,

  // Chave secreta usada para assinar e verificar os tokens de autenticação (JWT).
  jwtSecret: process.env.JWT_SECRET,
  
  // Credenciais para a criação do administrador padrão na primeira inicialização do servidor.
  defaultAdmin: {
    username: process.env.DEFAULT_ADMIN_USERNAME,
    password: process.env.DEFAULT_ADMIN_PASSWORD,
  },
};