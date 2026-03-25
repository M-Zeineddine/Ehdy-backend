'use strict';

const QRCode = require('qrcode');
require('dotenv').config();

/**
 * Generate a QR code data URL for a given redemption code.
 * @param {string} redemptionCode
 * @returns {Promise<string>} Base64 data URL
 */
async function generateQRCode(redemptionCode) {
  const frontendUrl = process.env.FRONTEND_URL || 'https://ehdy.app';
  const qrUrl = `${frontendUrl}/redeem/${redemptionCode}`;
  return await QRCode.toDataURL(qrUrl, {
    errorCorrectionLevel: 'H',
    width: 300,
    margin: 2,
    color: {
      dark: '#000000',
      light: '#FFFFFF',
    },
  });
}

/**
 * Generate a QR code SVG string.
 * @param {string} redemptionCode
 * @returns {Promise<string>} SVG string
 */
async function generateQRCodeSVG(redemptionCode) {
  const frontendUrl = process.env.FRONTEND_URL || 'https://ehdy.app';
  const qrUrl = `${frontendUrl}/redeem/${redemptionCode}`;
  return await QRCode.toString(qrUrl, {
    type: 'svg',
    errorCorrectionLevel: 'H',
    width: 300,
  });
}

/**
 * Generate a QR code for a raw URL (for share links, etc.).
 */
async function generateQRCodeForURL(url) {
  return await QRCode.toDataURL(url, {
    errorCorrectionLevel: 'H',
    width: 300,
    margin: 2,
  });
}

module.exports = {
  generateQRCode,
  generateQRCodeSVG,
  generateQRCodeForURL,
};
