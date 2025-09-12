// server.js
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const config = require('./config');
const { userRouter, planRouter, adminRouter, settingsRouter } = require('./routes');
const { Admin } = require('./models'); // A importação de 'Plan' não é mais necessária aqui

// Inicializa a aplicação Express
const app = express();

// --- Middlewares Essenciais ---

// Habilita CORS para permitir que o frontend acesse a API.
app.use(cors());

// Habilita o parsing de requisições com corpo no formato JSON.
app.use(express.json());

// Habilita o parsing de requisições com corpo no formato URL-encoded.
app.use(express.urlencoded({ extended: true }));


// --- Funções de Inicialização do Servidor ---

/**
 * Verifica se algum administrador existe no banco de dados.
 * Se não existir, cria um administrador padrão com as credenciais do arquivo .env.
 */
const createDefaultAdmin = async () => {
  try {
    const adminExists = await Admin.countDocuments();
    if (adminExists === 0) {
      const { username, password } = config.defaultAdmin;
      if (!username || !password) {
        console.warn('--- Credenciais do admin padrão não definidas no .env. Pulando criação.');
        return;
      }
      
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password, salt);
      
      const admin = new Admin({
        username: username,
        password: hashedPassword,
      });

      await admin.save();
      console.log('>>> Administrador padrão criado com sucesso.');
    }
  } catch (error) {
    console.error('!!! Erro ao tentar criar o administrador padrão:', error);
  }
};


// --- Conexão com o Banco de Dados MongoDB ---
const connectDB = async () => {
  try {
    await mongoose.connect(config.mongodbUri);
    console.log('✅ MongoDB conectado com sucesso.');
    
    // Após conectar, executa a rotina de inicialização do admin
    await createDefaultAdmin();

  } catch (err) {
    console.error('❌ Falha na conexão com o MongoDB:', err.message);
    // Encerra o processo com falha se não conseguir conectar ao DB
    process.exit(1);
  }
};


// --- Definição das Rotas da API ---

// As rotas de usuário serão acessadas via /api/users
app.use('/api/users', userRouter);

// As rotas de planos serão acessadas via /api/plans
app.use('/api/plans', planRouter);

// As rotas de administração serão acessadas via /api/admin
app.use('/api/admin', adminRouter);

// As rotas de configurações públicas serão acessadas via /api/settings
app.use('/api/settings', settingsRouter);

// Rota raiz para uma verificação rápida de que a API está online
app.get('/', (req, res) => {
  res.status(200).json({ message: 'API do Chivo está online e funcionando!' });
});


// --- Inicialização do Servidor ---
const PORT = process.env.PORT || 5000;

// Primeiro, conecta ao banco de dados e só então inicia o servidor Express.
connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 Servidor rodando na porta: ${PORT}`);
  });
});