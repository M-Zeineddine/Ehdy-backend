'use strict';

const router = require('express').Router();
const adminController = require('../controllers/adminController');
const { authenticateAdmin } = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimiter');
const { validate } = require('../middleware/validation');
const {
  adminLoginValidation,
  adminSetupValidation,
  adminUserStatusValidation,
  adminMerchantUpdateValidation,
  adminCreateMerchantValidation,
  adminItemUpdateValidation,
  adminCreateItemValidation,
  adminStoreCreditUpdateValidation,
  adminCreateStoreCreditValidation,
  paginationValidation,
  uuidParamValidation,
} = require('../utils/validators');

router.get('/auth/setup-status', adminController.getSetupStatus);
router.post('/auth/setup', authLimiter, adminSetupValidation, validate, adminController.setup);
router.post('/auth/login', authLimiter, adminLoginValidation, validate, adminController.login);

router.use(authenticateAdmin);

router.get('/me', adminController.me);
router.get('/dashboard', adminController.getDashboard);
router.get('/reference-data', adminController.getReferenceData);

router.get('/users', paginationValidation, validate, adminController.listUsers);
router.patch('/users/:id/status', uuidParamValidation(), adminUserStatusValidation, validate, adminController.updateUserStatus);

router.get('/merchants', paginationValidation, validate, adminController.listMerchants);
router.post('/merchants', adminCreateMerchantValidation, validate, adminController.createMerchant);
router.put('/merchants/:id', uuidParamValidation(), adminMerchantUpdateValidation, validate, adminController.updateMerchant);
router.patch('/merchants/:id/status', uuidParamValidation(), adminMerchantUpdateValidation, validate, adminController.updateMerchantStatus);

router.get('/items', paginationValidation, validate, adminController.listItems);
router.post('/items', adminCreateItemValidation, validate, adminController.createItem);
router.put('/items/:id', uuidParamValidation(), adminItemUpdateValidation, validate, adminController.updateItem);
router.patch('/items/:id/status', uuidParamValidation(), adminItemUpdateValidation, validate, adminController.updateItemStatus);

router.get('/store-credits', paginationValidation, validate, adminController.listStoreCredits);
router.post('/store-credits', adminCreateStoreCreditValidation, validate, adminController.createStoreCredit);
router.put('/store-credits/:id', uuidParamValidation(), adminStoreCreditUpdateValidation, validate, adminController.updateStoreCredit);
router.patch('/store-credits/:id/status', uuidParamValidation(), adminStoreCreditUpdateValidation, validate, adminController.updateStoreCreditStatus);

router.get('/purchases', paginationValidation, validate, adminController.listPurchases);
router.get('/gifts', paginationValidation, validate, adminController.listGifts);

module.exports = router;
