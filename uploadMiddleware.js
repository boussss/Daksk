// uploadMiddleware.js
const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cloudinary = require('cloudinary').v2;
const config = require('./config');

cloudinary.config(config.cloudinary);

const createStorage = (folderName) => {
  return new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
      folder: `chivo/${folderName}`,
      allowed_formats: ['jpg', 'png', 'jpeg'],
    },
  });
};

const uploadProfilePic = multer({ storage: createStorage('profile_pictures') });
const uploadDepositProof = multer({ storage: createStorage('deposit_proofs') });
const uploadPlanImage = multer({ storage: createStorage('plan_images') }); // Para o Admin
const uploadBanner = multer({ storage: createStorage('banners') }); // Adicione esta linha

module.exports = {
    uploadProfilePic,
    uploadDepositProof,
    uploadPlanImage,
    uploadBanner, // E adicione esta exportação
};