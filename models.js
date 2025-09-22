const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// ==================
// ESQUEMA DO USUÁRIO
// ==================
const UserSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true, index: true }, // ID único de 5 dígitos
  phoneNumber: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  profilePicture: { 
    type: String, 
    default: 'https://res.cloudinary.com/dje6f5k5u/image/upload/v1625247913/default_user_icon.png' // URL de um ícone de usuário padrão
  },
  walletBalance: { type: Number, default: 0 }, // Saldo real (depósitos + lucros coletados + saldo de boas-vindas)
  // O campo bonusBalance foi REMOVIDO daqui.
  invitedBy: { type: String, default: null }, // Armazena o userId de quem convidou
  activePlans: [{
    planId: { type: mongoose.Schema.Types.ObjectId, ref: 'Plan' },
    investedAmount: Number,
    dailyProfit: Number,
    startDate: { type: Date, default: Date.now },
    endDate: Date,
    lastCollectionDate: Date,
    totalEarned: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true }
  }],
  hasDeposited: { type: Boolean, default: false }, // Flag para permitir saques
  isBlocked: { type: Boolean, default: false },
}, { timestamps: true });

// Middleware para criptografar a senha antes de salvar
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
  minAmount: { type: Number, required: true },
  maxAmount: { type: Number, required: true },
  dailyIncomeType: { type: String, enum: ['percentage', 'fixed'], required: true },
  dailyIncomeValue: { type: Number, required: true },
  duration: { type: Number, required: true }, // Duração em dias
  imageUrl: { type: String, required: true },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

// =================
// ESQUEMA DE TRANSAÇÕES
// =================
const TransactionSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: ['deposit', 'withdrawal', 'investment', 'earning', 'bonus', 'commission'], required: true },
    amount: { type: Number, required: true },
    status: { type: String, enum: ['pending', 'completed', 'rejected'], default: 'pending' },
    proofScreenshot: { type: String }, // Para comprovantes de depósito
    details: { type: String } // Ex: "Lucro diário do Plano VIP"
}, { timestamps: true });

// =================
// ESQUEMA DO ADMINISTRADOR
// =================
const AdminSchema = new mongoose.Schema({
    phoneNumber: { type: String, required: true, unique: true },
    password: { type: String, required: true }
}, { timestamps: true });

// Middleware para criptografar a senha do admin antes de salvar
AdminSchema.pre('save', async function(next) {
    if (!this.isModified('password')) {
        return next();
    }
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
});

// =================
// ESQUEMA DE CONFIGURAÇÕES GLOBAIS
// =================
const SettingsSchema = new mongoose.Schema({
    settingId: { type: String, default: "global_settings", unique: true },
    welcomeBonus: { type: Number, default: 50 }, // Renomeado para "welcomeBonus" para clareza
    referralCommissionPercentage: { type: Number, default: 15 },
    dailyProfitSharePercentage: { type: Number, default: 5 },
    mpesaNumber: { type: String, default: "" },
    mpesaHolderName: { type: String, default: "" },
    emolaNumber: { type: String, default: "" },
    emolaHolderName: { type: String, default: "" },
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