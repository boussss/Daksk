// routes.js
const express = require('express');
const { protectUser, protectAdmin } = require('./auth');
const { uploadProfilePic, uploadDepositProof, uploadPlanImage, uploadBanner } = require('./uploadMiddleware');

// --- Importação dos Controllers ---
const userController = require('./userController');
const adminController = require('./adminController');
const plansController = require('./plansController');

// --- Configuração dos Routers ---
const userRouter = express.Router();
const planRouter = express.Router();
const adminRouter = express.Router();


//=====================================================
//  ROTAS DE USUÁRIO (Acessíveis pelo App Mobile)
//=====================================================

// --- Autenticação e Cadastro ---
userRouter.post('/register', userController.registerUser);
userRouter.post('/login', userController.loginUser);

// --- Perfil e Dashboard (Rotas Protegidas) ---
userRouter.get('/me', protectUser, userController.getUserProfile);
userRouter.get('/dashboard', protectUser, userController.getDashboardData);
// CORREÇÃO: Adicionado o middleware 'uploadProfilePic.single('image')' para processar o upload da imagem
userRouter.post('/profile/picture', protectUser, uploadProfilePic.single('image'), userController.uploadProfilePicture);

// --- Transações do Usuário (Rotas Protegidas) ---
userRouter.get('/transactions', protectUser, userController.getUserTransactions);
// CORREÇÃO: Adicionado o middleware 'uploadDepositProof.single('proof')' para processar o upload do comprovante
userRouter.post('/deposit', protectUser, uploadDepositProof.single('proof'), userController.createDepositRequest);
userRouter.post('/withdraw', protectUser, userController.createWithdrawalRequest);

// --- Convites e Bônus (Rotas Protegidas) ---
// CORREÇÃO: A função para esta rota foi adicionada no userController.js
userRouter.get('/referrals', protectUser, userController.getReferralData);


//=====================================================
//  ROTAS DE PLANOS (Acessíveis pelo App Mobile)
//=====================================================

planRouter.get('/', protectUser, plansController.getAllAvailablePlans);
planRouter.post('/:planId/activate', protectUser, plansController.activatePlan);
planRouter.post('/collect', protectUser, plansController.collectDailyProfit);


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


// Exportando todos os routers para serem usados no server.js
module.exports = {
  userRouter,
  planRouter,
  adminRouter
};