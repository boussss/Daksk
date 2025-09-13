// models.js
const mongoose = require('mongoose');

// --- ESQUEMA DO USUÁRIO ---
const UserSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  username: { type: String, required: true, unique: true, lowercase: true, trim: true },
  phone: { type: String, required: true, unique: true, trim: true },
  pin: { type: String, required: true, minlength: 4, maxlength: 6 },
  userId: { type: String, required: true, unique: true, minlength: 5, maxlength: 5 },
  profilePicture: { type: String, default: '' },
  walletBalance: { type: Number, default: 0 },
  bonusBalance: { type: Number, default: 0 },
  inviteLink: { type: String },
  invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  activePlanInstance: { type: mongoose.Schema.Types.ObjectId, ref: 'PlanInstance', default: null },
  hasDeposited: { type: Boolean, default: false },
  isBlocked: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});

// --- ESQUEMA DO PLANO (MODELO CRIADO PELO ADMIN) ---
const PlanSchema = new mongoose.Schema({
  name: { type: String, required: true },
  minAmount: { type: Number, required: true },
  maxAmount: { type: Number, required: true },
  dailyYieldType: { type: String, enum: ['percentage', 'fixed'], required: true },
  dailyYieldValue: { type: Number, required: true },
  durationDays: { type: Number, required: true },
  imageUrl: { type: String, default: '' },
  hashRate: {
    type: String, 
    default: 'N/A'
  },
});

// --- ESQUEMA DA INSTÂNCIA DO PLANO (PLANO ATIVO DE UM USUÁRIO) ---
const PlanInstanceSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  plan: { type: mongoose.Schema.Types.ObjectId, ref: 'Plan', required: true },
  investedAmount: { type: Number, required: true },
  dailyProfit: { type: Number, required: true },
  startDate: { type: Date, default: Date.now },
  endDate: { type: Date, required: true },
  lastCollectedDate: { type: Date },
  totalCollected: { type: Number, default: 0 },
  status: { type: String, enum: ['active', 'expired'], default: 'active' },
});

// --- ESQUEMA DE TRANSAÇÕES ---
const TransactionSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type: { type: String, enum: ['deposit', 'withdrawal', 'investment', 'collection', 'commission', 'welcome_bonus'], required: true },
  amount: { type: Number, required: true },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'approved' },
  description: String,
  transactionDetails: {
    type: Object,
    // Exemplos:
    // Depósito: { proofType: 'image', proofUrl: 'url' }
    // Saque: { destinationNumber: '84...', fee: 30, totalDeducted: 1030 }
  },
  createdAt: { type: Date, default: Date.now },
});

// --- ESQUEMA DO ADMIN ---
const AdminSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
});

// --- ESQUEMA DE BANNERS ---
const BannerSchema = new mongoose.Schema({
  imageUrl: { type: String, required: true },
  linkUrl: { type: String },
  isActive: { type: Boolean, default: true },
});

// --- ESQUEMA DE CONFIGURAÇÕES (ATUALIZADO) ---
const SettingsSchema = new mongoose.Schema({
    configKey: { type: String, default: "main_settings", unique: true }, 
    
    // Métodos de pagamento
    depositMethods: [{
        name: String,
        holderName: String,
        number: String,
        isActive: { type: Boolean, default: true }
    }],
    
    // Bônus e Comissões
    welcomeBonus: { type: Number, default: 50 },
    referralCommissionRate: { type: Number, default: 30 }, // Atualizado para 30%
    dailyCommissionRate: { type: Number, default: 15 },    // Atualizado para 15%

    // --- NOVOS CAMPOS PARA LIMITES E TAXAS ---
    depositMin: { type: Number, default: 50 },
    depositMax: { type: Number, default: 25000 },
    withdrawalMin: { type: Number, default: 100 },
    withdrawalMax: { type: Number, default: 25000 },
    withdrawalFee: { type: Number, default: 3 }, // Taxa em porcentagem (ex: 3 para 3%)
});

// Exportando todos os modelos
const User = mongoose.model('User', UserSchema);
const Plan = mongoose.model('Plan', PlanSchema);
const PlanInstance = mongoose.model('PlanInstance', PlanInstanceSchema);
const Transaction = mongoose.model('Transaction', TransactionSchema);
const Admin = mongoose.model('Admin', AdminSchema);
const Banner = mongoose.model('Banner', BannerSchema);
const Settings = mongoose.model('Settings', SettingsSchema);

module.exports = { User, Plan, PlanInstance, Transaction, Admin, Banner, Settings };