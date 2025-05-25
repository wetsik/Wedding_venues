const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const auth = require('../middleware/auth');
const router = express.Router();

// Регистрация владельца
router.post('/register', async (req, res) => {
  const { first_name, last_name, username, password } = req.body;
  if (!first_name || !last_name || !username || !password) {
    return res.status(400).json({ error: 'All fields are required' });
  }
  try {
    const existing = await pool.query('SELECT * FROM Venue_Owner WHERE username = $1', [username]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Username already exists' });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO Venue_Owner (first_name, last_name, username, password) VALUES ($1, $2, $3, $4) RETURNING *',
      [first_name, last_name, username, hashedPassword]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error.code === '23505') {
      return res.status(400).json({ error: 'Username already exists (database constraint)' });
    }
    res.status(500).json({ error: 'Server error while creating owner', details: error.message });
  }
});

// Логин владельца
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }
  try {
    const result = await pool.query('SELECT * FROM Venue_Owner WHERE username = $1', [username]);
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }
    const owner = result.rows[0];
    const isValid = await bcrypt.compare(password, owner.password);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }
    const token = jwt.sign({ id: owner.owner_id, role: 'owner' }, process.env.JWT_SECRET, { expiresIn: '1h' });
    res.json({ token, owner: { id: owner.owner_id, username: owner.username, first_name: owner.first_name, last_name: owner.last_name } });
  } catch (error) {
    res.status(500).json({ error: 'Server error during login', details: error.message });
  }
});

// Добавление тоʻйхоны
router.post('/venues', auth(['owner']), async (req, res) => {
  const { name, district_id, address, capacity, price_per_seat, phone_number } = req.body;
  if (!name || !district_id || !address || !capacity || !price_per_seat || !phone_number) {
    return res.status(400).json({ error: 'All fields are required' });
  }
  try {
    const district = await pool.query('SELECT * FROM District WHERE district_id = $1', [district_id]);
    if (district.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid district_id' });
    }
    const result = await pool.query(
      'INSERT INTO Venue (name, district_id, address, capacity, price_per_seat, phone_number, status, owner_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *',
      [name, district_id, address, capacity, price_per_seat, phone_number, 'unconfirmed', req.user.id]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error.code === '23503') {
      return res.status(400).json({ error: 'Invalid foreign key (district_id or other)', details: error.message });
    }
    res.status(500).json({ error: 'Server error while creating venue', details: error.message });
  }
});

// Обновление тоʻйхоны
router.put('/venues/:id', auth(['owner']), async (req, res) => {
  const { name, district_id, address, capacity, price_per_seat, phone_number } = req.body;
  if (!name || !district_id || !address || !capacity || !price_per_seat || !phone_number) {
    return res.status(400).json({ error: 'All fields are required' });
  }
  try {
    const district = await pool.query('SELECT * FROM District WHERE district_id = $1', [district_id]);
    if (district.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid district_id' });
    }
    const result = await pool.query(
      'UPDATE Venue SET name = $1, district_id = $2, address = $3, capacity = $4, price_per_seat = $5, phone_number = $6 WHERE venue_id = $7 AND owner_id = $8 RETURNING *',
      [name, district_id, address, capacity, price_per_seat, phone_number, req.params.id, req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Venue not found or not owned by you' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    if (error.code === '23503') {
      return res.status(400).json({ error: 'Invalid foreign key (district_id or other)', details: error.message });
    }
    res.status(500).json({ error: 'Server error while updating venue', details: error.message });
  }
});

// Получение бронирований для своей тоʻйхоны
router.get('/bookings', auth(['owner']), async (req, res) => {
  const { date, status } = req.query;
  let query = `
    SELECT b.*, v.name AS venue_name, d.name AS district_name, u.first_name, u.last_name, u.phone_number
    FROM Booking b
    JOIN Venue v ON b.venue_id = v.venue_id
    JOIN District d ON v.district_id = d.district_id
    JOIN Users u ON b.user_id = u.user_id
    WHERE v.owner_id = $1
  `;
  let params = [req.user.id];

  if (date) {
    query += ` AND b.booking_date = $${params.length + 1}`;
    params.push(date);
  }
  if (status) {
    query += ` AND b.status = $${params.length + 1}`;
    params.push(status);
  }

  try {
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Server error while fetching bookings', details: error.message });
  }
});

// Отмена бронирования
router.delete('/bookings/:id', auth(['owner']), async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM Booking WHERE booking_id = $1 AND venue_id IN (SELECT venue_id FROM Venue WHERE owner_id = $2) RETURNING *',
      [req.params.id, req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Booking not found or not associated with your venue' });
    }
    res.json({ message: 'Booking cancelled successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Server error while cancelling booking', details: error.message });
  }
});

module.exports = router;