const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// ==================
// ESQUEMA DO USUÁRIO
// ==================
const UserSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true, index: true },
  phoneNumber: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  profilePicture: { 
    type: String, 
    default: 'https://res.cloudinary.com/dje6f5k5u/image/upload/v1625247913/default_user_icon.png'
  },
  // --- CAMPOS DE CARTEIRA ATUALIZADOS ---
  country: { type: String, enum: ['MZ', 'AO', 'BR'], required: true }, // Moçambique, Angola, Brasil
  localCurrency: { type: String, enum: ['MT', 'AOA', 'BRL'], required: true }, // Metical, Kwanza, Real
  localWalletBalance: { type: Number, default: 0 }, // Carteira da moeda local
  usdtWalletBalance: { type: Number, default: 0 }, // Carteira de USDT
  
  invitedBy: { type: String, default: null },
  activePlans: [{
    planId: { type: mongoose.Schema.Types.ObjectId, ref: 'Plan' },
    investedAmount: Number,
    currency: { type: String, enum: ['LOCAL', 'USDT'] },
    dailyProfit: Number,
    startDate: { type: Date, default: Date.now },
    endDate: Date,
    lastCollectionDate: Date,
    totalEarned: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true }
  }],
  isBlocked: { type: Boolean, default: false },
}, { timestamps: true });

UserSchema.pre('save', async function(next) {
  if (!this.isModified('password')) {
    return next();
  }
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// =================
// ESQUEMA DO PLANO DE INVESTIMENTO
// =================
const PlanSchema = new mongoose.Schema({
  name: { type: String, required: true },
  // --- CAMPO DE MOEDA ADICIONADO ---
  currency: { type: String, enum: ['LOCAL', 'USDT'], required: true, default: 'LOCAL' },
  minAmount: { type: Number, required: true },
  maxAmount: { type: Number, required: true },
  dailyIncomeType: { type: String, enum: ['percentage', 'fixed'], required: true },
  dailyIncomeValue: { type: Number, required: true },
  duration: { type: Number, required: true },
  imageUrl: { type: String, required: true },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

// =================
// ESQUEMA DE TRANSAÇÕES
// =================
const TransactionSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: ['deposit', 'withdrawal', 'investment', 'earning', 'bonus', 'commission'], required: true },
    currency: { type: String, enum: ['MT', 'AOA', 'BRL', 'USDT'], required: true },
    amount: { type: Number, required: true },
    status: { type: String, enum: ['pending', 'completed', 'rejected'], default: 'pending' },
    proofScreenshot: { type: String },
    details: { type: String } // Ex: "Endereço da carteira para saque de USDT"
}, { timestamps: true });

// =================
// ESQUEMA DO ADMINISTRADOR
// =================
const AdminSchema = new mongoose.Schema({
    phoneNumber: { type: String, required: true, unique: true },
    password: { type: String, required: true }
}, { timestamps: true });

AdminSchema.pre('save', async function(next) {
    if (!this.isModified('password')) { return next(); }
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
});

// =================
// ESQUEMA DE CONFIGURAÇÕES GLOBAIS
// =================
const SettingsSchema = new mongoose.Schema({
    settingId: { type: String, default: "global_settings", unique: true },
    
    // --- BÔNUS DE BOAS-VINDAS POR PAÍS ---
    welcomeBonusMZ: { type: Number, default: 50 },
    welcomeBonusAO: { type: Number, default: 1000 },
    welcomeBonusBR: { type: Number, default: 10 },

    referralCommissionPercentage: { type: Number, default: 15 },
    dailyProfitSharePercentage: { type: Number, default: 5 },
    
    // --- CONTAS LOCAIS (APENAS MOÇAMBIQUE) ---
    mpesaNumber: { type: String, default: "" },
    mpesaHolderName: { type: String, default: "" },

    emolaNumber: { type: String, default: "" },
    emolaHolderName: { type: String, default: "" },

    // --- CONTA USDT (GLOBAL) ---
    usdtDepositAddress: { type: String, default: "" },

    // --- TAXAS DE CÂMBIO FIXAS ---
    usdtExchangeRates: {
        MZ: { type: Number, default: 65 },  // 1 USDT = 65 MT
        AO: { type: Number, default: 900 }, // 1 USDT = 900 AOA
        BR: { type: Number, default: 6 }    // 1 USDT = 6 BRL
    },

    luckWheelEnabled: { type: Boolean, default: false }
});

// =================
// ESQUEMA DOS BANNERS
// =================
const BannerSchema = new mongoose.Schema({
    imageUrl: { type: String, required: true },
    linkUrl: { type: String },
    isActive: { type: Boolean, default: true },
}, { timestamps: true });


// Exportando todos os modelos
const User = mongoose.model('User', UserSchema);
const Plan = mongoose.model('Plan', PlanSchema);
const Transaction = mongoose.model('Transaction', TransactionSchema);
const Admin = mongoose.model('Admin', AdminSchema);
const Settings = mongoose.model('Settings', SettingsSchema);
const Banner = mongoose.model('Banner', BannerSchema);

module.exports = { User, Plan, Transaction, Admin, Settings, Banner };