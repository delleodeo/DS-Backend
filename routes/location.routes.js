const express = require('express');
const router = express.Router();
const rateLimiter = require('../utils/rateLimiter');
const {
  listRegions,
  listProvinces,
  listCities,
  listBarangays,
  getZipCode,
} = require('../modules/locations/location.controller');

router.get('/regions', rateLimiter({ windowSec: 60, maxRequests: 120, keyPrefix: 'locations-regions' }), listRegions);
router.get('/regions/:regionCode/provinces', rateLimiter({ windowSec: 60, maxRequests: 120, keyPrefix: 'locations-provinces' }), listProvinces);
router.get('/provinces/:provinceCode/cities', rateLimiter({ windowSec: 60, maxRequests: 120, keyPrefix: 'locations-cities' }), listCities);
router.get('/cities/:cityCode/barangays', rateLimiter({ windowSec: 60, maxRequests: 120, keyPrefix: 'locations-barangays' }), listBarangays);
router.get('/zipcodes', rateLimiter({ windowSec: 60, maxRequests: 120, keyPrefix: 'locations-zipcodes' }), getZipCode);

module.exports = router;
