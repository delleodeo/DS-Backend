const sanitizeMongoInput = require('../../utils/sanitizeMongoInput');
const { ValidationError, formatErrorResponse } = require('../../utils/errorHandler');
const localLocations = require('./location.data');

// ─────────────────────────────────────────────────────────────────────────────
// PSGC Cloud API - Correct Endpoints (as per https://psgc.cloud/api-docs)
// ─────────────────────────────────────────────────────────────────────────────
// GET /api/regions                                    → List all regions
// GET /api/regions/{code}/provinces                   → Provinces of a region
// GET /api/provinces/{code}/cities-municipalities     → Cities/Municipalities of a province
// GET /api/cities-municipalities/{code}/barangays     → Barangays of a city/municipality
// ─────────────────────────────────────────────────────────────────────────────

const PSGC_BASE = 'https://psgc.cloud/api';

// Simple in-memory cache with TTL
const cache = new Map();
const CACHE_TTL_MS = 1000 * 60 * 60; // 1 hour

/**
 * Fetch JSON from URL with caching
 */
const fetchJson = async (url) => {
  const cached = cache.get(url);
  const now = Date.now();
  if (cached && cached.expires > now) {
    console.log(`[locations] Cache HIT: ${url}`);
    return cached.data;
  }

  console.log(`[locations] Fetching: ${url}`);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`PSGC API error: ${response.status} for ${url}`);
  }
  const data = await response.json();
  cache.set(url, { data, expires: now + CACHE_TTL_MS });
  return data;
};

// Local fallback data lookup
const localRegions = new Map(localLocations.regions.map((r) => [r.code, r]));

const fallbackRegions = () => localLocations.regions.map(({ code, name }) => ({ code, name }));

const fallbackBarangaysByCity = (cityCode) => {
  for (const region of localLocations.regions) {
    const municipality = region.municipalities?.find((m) => m.code === cityCode);
    if (municipality?.barangays?.length) {
      return municipality.barangays.map(({ name, zipCode }) => ({
        code: `${cityCode}-${name}`,
        name,
        zipCode,
      }));
    }
  }
  return [];
};

/**
 * GET /locations/regions
 * List all Philippine regions
 */
const listRegions = async (req, res) => {
  try {
    const url = `${PSGC_BASE}/regions`;
    const regions = await fetchJson(url);
    const mapped = regions.map(({ code, name }) => ({ code, name }));
    res.json({ success: true, data: mapped });
  } catch (error) {
    console.error('[locations] regions error:', error.message);
    const fallback = fallbackRegions();
    if (fallback.length) {
      return res.json({ success: true, data: fallback, fallback: true });
    }
    const err = new ValidationError('Unable to load regions');
    err.status = 502;
    res.status(err.status).json(formatErrorResponse(err));
  }
};

/**
 * GET /locations/regions/:regionCode/provinces
 * List provinces of a specific region
 */
const listProvinces = async (req, res) => {
  const regionCode = sanitizeMongoInput(req.params.regionCode);
  if (!regionCode) {
    const err = new ValidationError('Region code is required');
    err.status = 400;
    return res.status(err.status).json(formatErrorResponse(err));
  }

  try {
    // Correct PSGC endpoint: /api/regions/{code}/provinces
    const url = `${PSGC_BASE}/regions/${regionCode}/provinces`;
    const provinces = await fetchJson(url);
    const mapped = provinces.map(({ code, name }) => ({ code, name }));
    console.log(`[locations] Fetched ${mapped.length} provinces for region ${regionCode}`);
    res.json({ success: true, data: mapped });
  } catch (error) {
    console.error('[locations] provinces error:', error.message);
    const err = new ValidationError('Unable to load provinces');
    err.status = 502;
    res.status(err.status).json(formatErrorResponse(err));
  }
};

/**
 * GET /locations/provinces/:provinceCode/cities
 * List cities/municipalities of a specific province
 */
const listCities = async (req, res) => {
  const provinceCode = sanitizeMongoInput(req.params.provinceCode);
  if (!provinceCode) {
    const err = new ValidationError('Province code is required');
    err.status = 400;
    return res.status(err.status).json(formatErrorResponse(err));
  }

  try {
    // Correct PSGC endpoint: /api/provinces/{code}/cities-municipalities
    const url = `${PSGC_BASE}/provinces/${provinceCode}/cities-municipalities`;
    const cities = await fetchJson(url);
    const mapped = cities.map(({ code, name, zip_code }) => ({
      code,
      name,
      zipCode: zip_code || null,
    }));
    console.log(`[locations] Fetched ${mapped.length} cities for province ${provinceCode}`);
    res.json({ success: true, data: mapped });
  } catch (error) {
    console.error('[locations] cities error:', error.message);
    const err = new ValidationError('Unable to load cities/municipalities');
    err.status = 502;
    res.status(err.status).json(formatErrorResponse(err));
  }
};

/**
 * GET /locations/cities/:cityCode/barangays
 * List barangays of a specific city/municipality
 */
const listBarangays = async (req, res) => {
  const cityCode = sanitizeMongoInput(req.params.cityCode);
  if (!cityCode) {
    const err = new ValidationError('City code is required');
    err.status = 400;
    return res.status(err.status).json(formatErrorResponse(err));
  }

  try {
    // Correct PSGC endpoint: /api/cities-municipalities/{code}/barangays
    const url = `${PSGC_BASE}/cities-municipalities/${cityCode}/barangays`;
    const barangays = await fetchJson(url);
    const mapped = barangays.map(({ code, name }) => ({ code, name }));
    console.log(`[locations] Fetched ${mapped.length} barangays for city ${cityCode}`);
    res.json({ success: true, data: mapped });
  } catch (error) {
    console.error('[locations] barangays error:', error.message);
    const fallback = fallbackBarangaysByCity(cityCode);
    if (fallback.length) {
      return res.json({ success: true, data: fallback, fallback: true });
    }
    const err = new ValidationError('Unable to load barangays');
    err.status = 502;
    res.status(err.status).json(formatErrorResponse(err));
  }
};

/**
 * GET /locations/zipcodes?cityCode=XXX&barangay=YYY
 * Get zip code for a specific barangay
 */
const getZipCode = async (req, res) => {
  const cityCode = sanitizeMongoInput(req.query.cityCode);
  const barangayName = (sanitizeMongoInput(req.query.barangay) || '').toLowerCase();
  if (!cityCode || !barangayName) {
    const err = new ValidationError('cityCode and barangay are required');
    err.status = 400;
    return res.status(err.status).json(formatErrorResponse(err));
  }

  try {
    const url = `${PSGC_BASE}/cities-municipalities/${cityCode}/barangays`;
    const barangays = await fetchJson(url);
    const match = barangays.find((b) => b.name.toLowerCase() === barangayName);
    if (!match) {
      const err = new ValidationError('Barangay not found');
      err.status = 404;
      return res.status(err.status).json(formatErrorResponse(err));
    }
    // Note: PSGC barangays may not have zip_code; use city's zip if available
    res.json({ success: true, data: { zipCode: match.zip_code || null, barangay: match.name } });
  } catch (error) {
    console.error('[locations] zipcode error:', error.message);
    const fallback = fallbackBarangaysByCity(cityCode);
    const match = fallback.find((b) => b.name.toLowerCase() === barangayName);
    if (match) {
      return res.json({ success: true, data: { zipCode: match.zipCode, barangay: match.name }, fallback: true });
    }
    const err = new ValidationError('Unable to load zip code');
    err.status = 502;
    res.status(err.status).json(formatErrorResponse(err));
  }
};

module.exports = {
  listRegions,
  listProvinces,
  listCities,
  listBarangays,
  getZipCode,
};
