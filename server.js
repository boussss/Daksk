const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
// **Linha crucial:** Importando e desestruturando o objeto do config.js
const { connectDB, cloudinary } = require('./config'); 
const { protectUser, protectAdmin } = require('./auth');
const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');

// Importar Models para inicialização
const { Admin, Settings } = require('./models');

// Importar Controllers
const userController = require('./userController');
const plansController = require('./plansController');
const bonusController = require('./bonusController');
const adminController = require('./adminController');

// Carregar variáveis de ambiente
dotenv.config();

// Conectar ao Banco de Dados - AGORA DEVE FUNCIONAR
connectDB();

const app = express();

// Configuração do CORS
const corsOptions = {
    origin: process.env.APP_URL || '*',
    methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
    credentials: true,
};
app.use(cors(corsOptions));

// Middleware para parsear JSON
app.use(express.json());

// Configuração do Multer para Upload no Cloudinary
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'indodax',
    format: async (req, file) => 'png',
    public_id: (req, file) => `${file.fieldname}_${Date.now()}`,
  },
});

const upload = multer({ storage: storage });

// ===================================
// INICIALIZAÇÃO DE DADOS PADRÃO
// ===================================
const initializeDefaultData = async () => {
    try {
        const adminExists = await Admin.findOne({ phoneNumber: process.env.ADMIN_DEFAULT_PHONE });
        if (!adminExists) {
            await Admin.create({
                phoneNumber: process.env.ADMIN_DEFAULT_PHONE,
                password: process.env.ADMIN_DEFAULT_PASSWORD
            });
            console.log('Administrador padrão criado com sucesso.');
        }

        const settingsExist = await Settings.findOne({ settingId: 'global_settings' });
        if (!settingsExist) {
            await Settings.create({});
            console.log('Configurações globais inicializadas com sucesso.');
        }
    } catch (error) {
        console.error('Erro ao inicializar dados padrão:', error);
    }
};

// =======================
// ROTAS DA API (sem alterações aqui, mantive para o arquivo ser completo)
// =======================

// --- Rotas de Usuário ---
app.post('/api/users/register', userController.registerUser);
app.post('/api/users/login', userController.loginUser);
app.get('/api/users/profile', protectUser, userController.getUserProfile);
app.put('/api/users/profile/picture', protectUser, upload.single('profilePicture'), userController.updateUserProfilePicture);
app.get('/api/users/referral', protectUser, userController.getReferralInfo);
app.post('/api/users/deposit', protectUser, upload.single('proofScreenshot'), userController.createDepositRequest);
app.post('/api/users/withdrawal', protectUser, userController.createWithdrawalRequest);
app.get('/api/users/transactions', protectUser, userController.getUserTransactions);

// --- Rotas de Planos ---
app.get('/api/plans', plansController.getAllPlans);
app.post('/api/plans/activate', protectUser, plansController.activatePlan);

// --- Rotas de Bônus e Coleta ---
app.post('/api/bonus/collect', protectUser, bonusController.collectDailyEarnings);
app.get('/api/bonus/history', protectUser, bonusController.getCollectionHistory);

// --- Rotas de Administrador ---
app.post('/api/admin/login', adminController.loginAdmin);
app.get('/api/admin/users', protectAdmin, adminController.getUsers);
app.get('/api/admin/users/:id', protectAdmin, adminController.getUserDetails);
app.put('/api/admin/users/:id/block', protectAdmin, adminController.toggleUserBlock);
app.put('/api/admin/users/:id/balance', protectAdmin, adminController.updateUserBalance);
app.put('/api/admin/users/:id/credentials', protectAdmin, adminController.updateUserCredentials);
app.post('/api/admin/plans', protectAdmin, upload.single('planImage'), adminController.createPlan);
app.put('/api/admin/plans/:id', protectAdmin, upload.single('planImage'), adminController.updatePlan);
app.delete('/api/admin/plans/:id', protectAdmin, adminController.deletePlan);
app.get('/api/admin/transactions/pending', protectAdmin, adminController.getPendingTransactions);
app.put('/api/admin/transactions/:id/status', protectAdmin, adminController.updateTransactionStatus);
app.get('/api/admin/settings', protectAdmin, adminController.getSettings);
app.put('/api/admin/settings', protectAdmin, adminController.updateSettings);
app.post('/api/admin/banners', protectAdmin, upload.single('bannerImage'), adminController.addBanner);
app.delete('/api/admin/banners/:id', protectAdmin, adminController.deleteBanner);

// Rota de Teste
app.get('/', (req, res) => {
  res.send('API da Indodax está funcionando!');
});

// =======================
// INICIALIZAÇÃO DO SERVIDOR
// =======================
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
  initializeDefaultData();
});