// routes.js
const express = require('express');
const { protectUser, protectAdmin } = require('./auth');

// Importaremos os controllers aqui (eles ainda serão criados)
const userController = require('./userController');
const adminController = require('./adminController');
const plansController = require('./plansController');
// const bonusController = require('./bonusController'); // Se necessário

// --- CONFIGURAÇÃO DOS ROUTERS ---
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
userRouter.post('/profile/picture', protectUser, userController.uploadProfilePicture); // Requer 'multer' para upload
userRouter.get('/dashboard', protectUser, userController.getDashboardData);

// --- Transações do Usuário (Rotas Protegidas) ---
userRouter.get('/transactions', protectUser, userController.getUserTransactions);
userRouter.post('/deposit', protectUser, userController.createDepositRequest); // Requer 'multer' para comprovante
userRouter.post('/withdraw', protectUser, userController.createWithdrawalRequest);

// --- Convites e Bônus (Rotas Protegidas) ---
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

// --- Gerenciamento de Usuários (Rotas Protegidas por Admin) ---
adminRouter.get('/users', protectAdmin, adminController.getAllUsers);
adminRouter.get('/users/search', protectAdmin, adminController.searchUserById); // Ex: /users/search?userId=12345
adminRouter.get('/users/:id', protectAdmin, adminController.getUserDetails);
adminRouter.put('/users/:id/block', protectAdmin, adminController.toggleUserBlock);
adminRouter.put('/users/:id/balance', protectAdmin, adminController.updateUserBalance);

// --- Gerenciamento de Planos (Rotas Protegidas por Admin) ---
adminRouter.post('/plans', protectAdmin, plansController.createPlan); // Requer 'multer' para imagem do plano
adminRouter.put('/plans/:id', protectAdmin, plansController.updatePlan); // Requer 'multer' para imagem do plano
adminRouter.delete('/plans/:id', protectAdmin, plansController.deletePlan);

// --- Gerenciamento de Transações (Rotas Protegidas por Admin) ---
adminRouter.get('/deposits', protectAdmin, adminController.getPendingDeposits);
adminRouter.post('/deposits/:transactionId/approve', protectAdmin, adminController.approveDeposit);
adminRouter.post('/deposits/:transactionId/reject', protectAdmin, adminController.rejectDeposit);

adminRouter.get('/withdrawals', protectAdmin, adminController.getPendingWithdrawals);
adminRouter.post('/withdrawals/:transactionId/approve', protectAdmin, adminController.approveWithdrawal);
adminRouter.post('/withdrawals/:transactionId/reject', protectAdmin, adminController.rejectWithdrawal);

// --- Configurações Gerais (Rotas Protegidas por Admin) ---
adminRouter.post('/settings/bonuses', protectAdmin, adminController.updateBonusSettings);
adminRouter.post('/banners', protectAdmin, adminController.createBanner); // Requer 'multer' para imagem do banner
adminRouter.delete('/banners/:bannerId', protectAdmin, adminController.deleteBanner);


// Exportando todos os routers para serem usados no server.js
module.exports = {
  userRouter,
  planRouter,
  adminRouter
};