const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors'); // Importamos o cors
const { connectDB, cloudinary } = require('./config');
const { protectUser, protectAdmin } = require('./auth');
const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');

// Importar Models e Controllers
const { Admin, Settings } = require('./models');
const userController = require('./userController');
const plansController = require('./plansController');
const bonusController = require('./bonusController');
const adminController = require('./adminController');

dotenv.config();
connectDB();

const app = express();

// ===============================================================
// CORREÇÃO DO CORS: Esta é a principal mudança.
// app.use(cors(corsOptions)); se torna -> app.use(cors());
// Isso habilita o CORS para todas as requisições, resolvendo o erro.
app.use(cors());
// ===============================================================

app.use(express.json());

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'indodax',
    format: async (req, file) => 'png',
    public_id: (req, file) => `${file.fieldname}_${Date.now()}`,
  },
});
const upload = multer({ storage: storage });

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

// --- ROTAS DA API (sem alterações) ---
app.post('/api/users/register', userController.registerUser);
app.post('/api/users/login', userController.loginUser);
app.get('/api/users/profile', protectUser, userController.getUserProfile);
app.put('/api/users/profile/picture', protectUser, upload.single('profilePicture'), userController.updateUserProfilePicture);
app.get('/api/users/referral', protectUser, userController.getReferralInfo);
app.post('/api/users/deposit', protectUser, upload.single('proofScreenshot'), userController.createDepositRequest);
app.post('/api/users/withdrawal', protectUser, userController.createWithdrawalRequest);
app.get('/api/users/transactions', protectUser, userController.getUserTransactions);
app.get('/api/plans', plansController.getAllPlans);
app.post('/api/plans/activate', protectUser, plansController.activatePlan);
app.post('/api/bonus/collect', protectUser, bonusController.collectDailyEarnings);
app.get('/api/bonus/history', protectUser, bonusController.getCollectionHistory);
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
app.get('/', (req, res) => res.send('API da Indodax está funcionando!'));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
  initializeDefaultData();
});