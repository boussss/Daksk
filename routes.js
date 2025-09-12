// routes.js
const express = require('express');
const { protectUser, protectAdmin } = require('./auth');
const { uploadProfilePic, uploadDepositProof, uploadPlanImage, uploadBanner } = require('./uploadMiddleware');

// --- Importação dos Controllers ---
const userController = require('./userController');
const adminController = require('./adminController');
const plansController = require('./plansController');
const settingsController = require('./settingsController');

// --- Configuração dos Routers ---
const userRouter = express.Router();
const planRouter = express.Router();
const adminRouter = express.Router();
const settingsRouter = express.Router();


//=====================================================
//  ROTAS DE USUÁRIO (Acessíveis pelo App Mobile)
//=====================================================

// --- Autenticação e Cadastro ---
userRouter.post('/register', userController.registerUser);
userRouter.post('/login', userController.loginUser);

// --- Perfil e Dashboard (Rotas Protegidas) ---
userRouter.get('/me', protectUser, userController.getUserProfile);
userRouter.get('/dashboard', protectUser, userController.getDashboardData);
userRouter.post('/profile/picture', protectUser, uploadProfilePic.single('image'), userController.uploadProfilePicture);

// --- Transações do Usuário (Rotas Protegidas) ---
userRouter.get('/transactions', protectUser, userController.getUserTransactions);
userRouter.post('/deposit', protectUser, uploadDepositProof.single('proof'), userController.createDepositRequest);
userRouter.post('/withdraw', protectUser, userController.createWithdrawalRequest);

// --- Convites e Bônus (Rotas Protegidas) ---
userRouter.get('/referrals', protectUser, userController.getReferralData);


//=====================================================
//  ROTAS DE PLANOS (Acessíveis pelo App Mobile)
//=====================================================

planRouter.get('/', protectUser, plansController.getAllAvailablePlans);
planRouter.post('/:planId/activate', protectUser, plansController.activatePlan);
planRouter.post('/collect', protectUser, plansController.collectDailyProfit);
planRouter.post('/upgrade/:newPlanId', protectUser, plansController.upgradePlan); // Rota para upgrade


//=====================================================
//  ROTAS DE CONFIGURAÇÕES PÚBLICAS
//=====================================================

settingsRouter.get('/public', protectUser, settingsController.getPublicSettings);


//=====================================================
//  ROTAS DE ADMINISTRAÇÃO (Acessíveis pelo Painel Admin)
//=====================================================

// --- Autenticação do Admin ---
adminRouter.post('/login', adminController.loginAdmin);

// --- Gerenciamento de Usuários ---
adminRouter.get('/users', protectAdmin, adminController.getAllUsers);
adminRouter.get('/users/search', protectAdmin, adminController.searchUserById);
adminRouter.get('/users/:id', protectAdmin, adminController.getUserDetails);
adminRouter.put('/users/:id/block', protectAdmin, adminController.toggleUserBlock);
adminRouter.put('/users/:id/balance', protectAdmin, adminController.updateUserBalance);

// --- Gerenciamento de Planos ---
adminRouter.get('/plans', protectAdmin, plansController.getAllPlansForAdmin); // Rota para o admin listar os planos
adminRouter.post('/plans', protectAdmin, uploadPlanImage.single('image'), plansController.createPlan);
adminRouter.put('/plans/:id', protectAdmin, uploadPlanImage.single('image'), plansController.updatePlan);
adminRouter.delete('/plans/:id', protectAdmin, plansController.deletePlan);

// --- Gerenciamento de Transações ---
adminRouter.get('/deposits', protectAdmin, adminController.getPendingDeposits);
adminRouter.post('/deposits/:transactionId/approve', protectAdmin, adminController.approveDeposit);
adminRouter.post('/deposits/:transactionId/reject', protectAdmin, adminController.rejectDeposit);
adminRouter.get('/withdrawals', protectAdmin, adminController.getPendingWithdrawals);
adminRouter.post('/withdrawals/:transactionId/approve', protectAdmin, adminController.approveWithdrawal);
adminRouter.post('/withdrawals/:transactionId/reject', protectAdmin, adminController.rejectWithdrawal);

// --- Gerenciamento de Banners ---
adminRouter.post('/banners', protectAdmin, uploadBanner.single('image'), adminController.createBanner);
adminRouter.delete('/banners/:id', protectAdmin, adminController.deleteBanner);

// --- Gerenciamento de Configurações ---
adminRouter.get('/settings', protectAdmin, adminController.getSettings);
adminRouter.put('/settings', protectAdmin, adminController.updateSettings);


// Exportando todos os routers para serem usados no server.js
module.exports = {
  userRouter,
  planRouter,
  adminRouter,
  settingsRouter
};