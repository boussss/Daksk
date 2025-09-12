// routes.js
const express = require('express');
const { protectUser, protectAdmin } = require('./auth');
const { uploadProfilePic, uploadDepositProof, uploadPlanImage, uploadBanner } = require('./uploadMiddleware');

// --- Importação dos Controllers ---
const userController = require('./userController');
// --- CÓDIGO DE DIAGNÓSTICO ---
console.log('--- DIAGNÓSTICO: routes.js foi carregado ---');
console.log('--- DIAGNÓSTICO: userController é um objeto?', typeof userController === 'object' && userController !== null);
if (userController) {
    console.log('--- DIAGNÓSTICO: Funções disponíveis em userController:', Object.keys(userController));
}
// ------------------------------
const adminController = require('./adminController');
const plansController = require('./plansController');

const userRouter = express.Router();
const planRouter = express.Router();
const adminRouter = express.Router();

// ROTAS DE USUÁRIO
userRouter.post('/register', userController.registerUser);
userRouter.post('/login', userController.loginUser);
userRouter.get('/me', protectUser, userController.getUserProfile);
userRouter.get('/dashboard', protectUser, userController.getDashboardData);
userRouter.post('/profile/picture', protectUser, uploadProfilePic.single('image'), userController.uploadProfilePicture);
userRouter.get('/transactions', protectUser, userController.getUserTransactions);
userRouter.post('/deposit', protectUser, uploadDepositProof.single('proof'), userController.createDepositRequest);
userRouter.post('/withdraw', protectUser, userController.createWithdrawalRequest);
userRouter.get('/referrals', protectUser, userController.getReferralData);

// ROTAS DE PLANOS
planRouter.get('/', protectUser, plansController.getAllAvailablePlans);
planRouter.post('/:planId/activate', protectUser, plansController.activatePlan);
planRouter.post('/collect', protectUser, plansController.collectDailyProfit);

// ROTAS DE ADMINISTRAÇÃO
adminRouter.post('/login', adminController.loginAdmin);
adminRouter.get('/users', protectAdmin, adminController.getAllUsers);
adminRouter.get('/users/search', protectAdmin, adminController.searchUserById);
adminRouter.get('/users/:id', protectAdmin, adminController.getUserDetails);
adminRouter.put('/users/:id/block', protectAdmin, adminController.toggleUserBlock);
adminRouter.put('/users/:id/balance', protectAdmin, adminController.updateUserBalance);
adminRouter.post('/plans', protectAdmin, uploadPlanImage.single('image'), plansController.createPlan);
adminRouter.put('/plans/:id', protectAdmin, uploadPlanImage.single('image'), plansController.updatePlan);
adminRouter.delete('/plans/:id', protectAdmin, plansController.deletePlan);
adminRouter.get('/deposits', protectAdmin, adminController.getPendingDeposits);
adminRouter.post('/deposits/:transactionId/approve', protectAdmin, adminController.approveDeposit);
adminRouter.post('/deposits/:transactionId/reject', protectAdmin, adminController.rejectDeposit);
adminRouter.get('/withdrawals', protectAdmin, adminController.getPendingWithdrawals);
adminRouter.post('/withdrawals/:transactionId/approve', protectAdmin, adminController.approveWithdrawal);
adminRouter.post('/withdrawals/:transactionId/reject', protectAdmin, adminController.rejectWithdrawal);
adminRouter.post('/banners', protectAdmin, uploadBanner.single('image'), adminController.createBanner);
adminRouter.delete('/banners/:id', protectAdmin, adminController.deleteBanner);

module.exports = { userRouter, planRouter, adminRouter };