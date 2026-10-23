/* Shared by the smokes: the KYC a `sellers:register` call must carry.
 *
 *   req(u.sock, 'sellers:register', kyc(`My Store ${tag}`))
 *
 * Document URLs follow the platform-upload shape (`/uploads/<uuid>.png`), the same
 * check logos and banners pass.
 */
const { randomUUID } = require('crypto');
const API = process.env.API_URL ?? 'http://localhost:3001';

const kyc = (name, extra = {}) => ({
  name,
  legalName: `${name} SARL`,
  phone: '+243812345678',
  idNumber: `ID-${Date.now().toString().slice(-7)}`,
  rccm: `CD/KIN/RCCM/${Date.now().toString().slice(-5)}`,
  taxNumber: `A${Date.now().toString().slice(-7)}K`,
  documentUrls: [`${API}/uploads/${randomUUID()}.png`],
  acceptTerms: true,
  ...extra,
});

module.exports = { kyc };
