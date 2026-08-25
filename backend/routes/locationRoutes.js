const express = require('express');
const router = express.Router();
const db = require('../config/database');

router.get('/cities', async (req, res) => {
  try {
    const query = 'SELECT DISTINCT INITCAP(shop_city) as shop_city FROM shops WHERE shop_city IS NOT NULL ORDER BY shop_city';
    const result = await db.query(query);
    const cities = result.rows.map(row => row.shop_city);
    res.json({ success: true, data: cities });
  } catch (error) {
    console.error('Error fetching cities:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch cities' });
  }
});

router.get('/states', async (req, res) => {
  try {
    const query = 'SELECT DISTINCT INITCAP(shop_state) as shop_state FROM shops WHERE shop_state IS NOT NULL ORDER BY shop_state';
    const result = await db.query(query);
    const states = result.rows.map(row => row.shop_state);
    res.json({ success: true, data: states });
  } catch (error) {
    console.error('Error fetching states:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch states' });
  }
});

router.get('/countries', async (req, res) => {
  try {
    const query = 'SELECT DISTINCT INITCAP(shop_country) as shop_country FROM shops WHERE shop_country IS NOT NULL ORDER BY shop_country';
    const result = await db.query(query);
    const countries = result.rows.map(row => row.shop_country);
    res.json({ success: true, data: countries });
  } catch (error) {
    console.error('Error fetching countries:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch countries' });
  }
});

router.get('/shops', async (req, res) => {
  try {
    const { city, state, country, productType } = req.query;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;
    
    // Validate and sanitize parameters
    const validFilters = ['city', 'state', 'country', 'productType'];
    const filters = {};
    
    validFilters.forEach(key => {
      const value = req.query[key];
      if (value && value !== 'Any' && value.trim() !== '') {
        filters[key] = value.trim();
      }
    });
    
    let query = `SELECT shop_id, shop_name, shop_city, shop_state, shop_country, type 
                 FROM shops WHERE 1=1`;
    const params = [];
    let paramIndex = 1;
    
    if (filters.city) {
      query += ` AND LOWER(shop_city) = LOWER($${paramIndex})`;
      params.push(filters.city);
      paramIndex++;
    }
    
    if (filters.state) {
      query += ` AND LOWER(shop_state) = LOWER($${paramIndex})`;
      params.push(filters.state);
      paramIndex++;
    }
    
    if (filters.country) {
      query += ` AND LOWER(shop_country) = LOWER($${paramIndex})`;
      params.push(filters.country);
      paramIndex++;
    }

    if (filters.productType) {
      query += ` AND LOWER(type::text) = LOWER($${paramIndex})`;
      params.push(filters.productType);
      paramIndex++;
    }

    query += ` ORDER BY shop_name LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);
    
    const result = await db.query(query, params);
    const shops = result.rows.map(row => ({
      id: row.shop_id,
      name: row.shop_name,
      city: row.shop_city,
      state: row.shop_state,
      country: row.shop_country,
      type: row.type
    }));
    
    res.json({ 
      success: true, 
      data: shops,
      pagination: {
        page,
        limit,
        total: shops.length
      }
    });
  } catch (error) {
    console.error('Error fetching shops:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch shops' });
  }
});

module.exports = router;

