const dotenv = require('dotenv');
const path = require('path');

// Carrega as variáveis de ambiente do arquivo .env
dotenv.config({ path: path.resolve(__dirname, '.env') });

module.exports = {
  mongoURI: process.env.MONGO_URI,
  port: process.env.PORT || 5000,
  jwtSecret: process.env.JWT_SECRET,
  cloudinary: {
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  },
  baseUrl: process.env.BASE_URL,
  // Configurações de bônus que o admin pode alterar
  bonusSettings: {
    welcomeBonus: 50, // Valor padrão, pode ser sobrescrito pelo admin no DB
    referralCommissionRate: 0.15, // 15% do valor do plano do convidado
    dailyCommissionRate: 0.05, // 5% do lucro diário do convidado
  },
  // URL de perfil padrão para novos usuários
  defaultProfilePic: 'https://res.cloudinary.com/dje6f5k5u/image/upload/v1677399539/default-user-icon_s6k6z6.png' // Exemplo de URL
};