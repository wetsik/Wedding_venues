const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const auth = require('../middleware/auth');
const router = express.Router();

// Регистрация админа
router.post('/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }
  try {
    const existing = await pool.query('SELECT * FROM Admin WHERE username = $1', [username]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Username already exists' });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO Admin (username, password) VALUES ($1, $2) RETURNING admin_id, username',
      [username, hashedPassword]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error.code === '23505') {
      return res.status(400).json({ error: 'Username already exists (database constraint)' });
    }
    res.status(500).json({ error: 'Server error while creating admin', details: error.message });
  }
});

// Логин админа
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }
  try {
    const result = await pool.query('SELECT * FROM Admin WHERE username = $1', [username]);
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }
    const admin = result.rows[0];
    const isValid = await bcrypt.compare(password, admin.password);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }
    const token = jwt.sign({ id: admin.admin_id, role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '1h' });
    res.json({ token, admin: { id: admin.admin_id, username: admin.username } });
  } catch (error) {
    res.status(500).json({ error: 'Server error during login', details: error.message });
  }
});

// Получение всех админов
router.get('/admins', auth(['admin']), async (req, res) => {
  try {
    const result = await pool.query('SELECT admin_id, username FROM Admin');
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Server error while fetching admins', details: error.message });
  }
});

// Получение всех пользователей
router.get('/users', auth(['admin']), async (req, res) => {
  try {
    const result = await pool.query('SELECT user_id, first_name, last_name, phone_number FROM Users');
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Server error while fetching users', details: error.message });
  }
});

// Добавление тоʻйхоны
router.post('/venues', auth(['admin']), async (req, res) => {
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
      'INSERT INTO Venue (name, district_id, address, capacity, price_per_seat, phone_number, status, created_by_admin_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *',
      [name, district_id, address, capacity, price_per_seat, phone_number, 'confirmed', req.user.id]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error.code === '23503') {
      return res.status(400).json({ error: 'Invalid foreign key (district_id or other)', details: error.message });
    }
    res.status(500).json({ error: 'Server error while creating venue', details: error.message });
  }
});

// Подтверждение тоʻйхоны
router.put('/venues/:id/confirm', auth(['admin']), async (req, res) => {
  try {
    const result = await pool.query(
      'UPDATE Venue SET status = $1 WHERE venue_id = $2 RETURNING *',
      ['confirmed', req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Venue not found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Server error while confirming venue', details: error.message });
  }
});

// Удаление тоʻйхоны
router.delete('/venues/:id', auth(['admin']), async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM Venue WHERE venue_id = $1 RETURNING *', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Venue not found' });
    }
    res.json({ message: 'Venue deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Server error while deleting venue', details: error.message });
  }
});

// Обновление тоʻйхоны
router.put('/venues/:id', auth(['admin']), async (req, res) => {
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
      'UPDATE Venue SET name = $1, district_id = $2, address = $3, capacity = $4, price_per_seat = $5, phone_number = $6 WHERE venue_id = $7 RETURNING *',
      [name, district_id, address, capacity, price_per_seat, phone_number, req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Venue not found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    if (error.code === '23503') {
      return res.status(400).json({ error: 'Invalid foreign key (district_id or other)', details: error.message });
    }
    res.status(500).json({ error: 'Server error while updating venue', details: error.message });
  }
});

// Добавление владельца тоʻйхоны
router.post('/owners', auth(['admin']), async (req, res) => {
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

// Привязка владельца к тоʻйхоне
router.put('/venues/:id/assign-owner', auth(['admin']), async (req, res) => {
  const { owner_id } = req.body;
  if (!owner_id) {
    return res.status(400).json({ error: 'Owner ID is required' });
  }
  try {
    const owner = await pool.query('SELECT * FROM Venue_Owner WHERE owner_id = $1', [owner_id]);
    if (owner.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid owner_id' });
    }
    const result = await pool.query(
      'UPDATE Venue SET owner_id = $1, created_by_admin_id = NULL WHERE venue_id = $2 RETURNING *',
      [owner_id, req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Venue not found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Server error while assigning owner', details: error.message });
  }
});

// Получение всех тоʻйхон
router.get('/venues', auth(['admin']), async (req, res) => {
  const { search, district_id, status, sort_by, order } = req.query;
  let query = 'SELECT v.*, d.name AS district_name FROM Venue v JOIN District d ON v.district_id = d.district_id';
  let conditions = [];
  let params = [];

  if (search) {
    conditions.push(`v.name ILIKE $${params.length + 1}`);
    params.push(`%${search}%`);
  }
  if (district_id) {
    conditions.push(`v.district_id = $${params.length + 1}`);
    params.push(district_id);
  }
  if (status) {
    conditions.push(`v.status = $${params.length + 1}`);
    params.push(status);
  }
  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
  }
  if (sort_by) {
    const validSorts = ['price_per_seat', 'capacity'];
    if (validSorts.includes(sort_by)) {
      query += ` ORDER BY v.${sort_by} ${order === 'desc' ? 'DESC' : 'ASC'}`;
    } else {
      return res.status(400).json({ error: 'Invalid sort_by parameter', validOptions: ['price_per_seat', 'capacity'] });
    }
  }

  try {
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Server error while fetching venues', details: error.message });
  }
});

// Получение одной тоʻйхоны
router.get('/venues/:id', auth(['admin']), async (req, res) => {
  try {
    const venue = await pool.query(
      'SELECT v.*, d.name AS district_name FROM Venue v JOIN District d ON v.district_id = d.district_id WHERE v.venue_id = $1',
      [req.params.id]
    );
    if (venue.rows.length === 0) {
      return res.status(404).json({ error: 'Venue not found' });
    }
    const photos = await pool.query('SELECT * FROM Venue_Photo WHERE venue_id = $1', [req.params.id]);
    const bookings = await pool.query(
      'SELECT b.*, u.first_name, u.last_name, u.phone_number FROM Booking b JOIN Users u ON b.user_id = u.user_id WHERE b.venue_id = $1',
      [req.params.id]
    );
    res.json({ ...venue.rows[0], photos: photos.rows, bookings: bookings.rows });
  } catch (error) {
    res.status(500).json({ error: 'Server error while fetching venue', details: error.message });
  }
});

// Получение всех владельцев
router.get('/owners', auth(['admin']), async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM Venue_Owner');
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Server error while fetching owners', details: error.message });
  }
});

// Получение всех бронирований
router.get('/bookings', auth(['admin']), async (req, res) => {
  const { date, venue_id, district_id, status, sort_by } = req.query;
  let query = `
    SELECT b.*, v.name AS venue_name, d.name AS district_name, u.first_name, u.last_name, u.phone_number
    FROM Booking b
    JOIN Venue v ON b.venue_id = v.venue_id
    JOIN District d ON v.district_id = d.district_id
    JOIN Users u ON b.user_id = u.user_id
  `;
  let conditions = [];
  let params = [];

  if (date) {
    conditions.push(`b.booking_date = $${params.length + 1}`);
    params.push(date);
  }
  if (venue_id) {
    conditions.push(`b.venue_id = $${params.length + 1}`);
    params.push(venue_id);
  }
  if (district_id) {
    conditions.push(`v.district_id = $${params.length + 1}`);
    params.push(district_id);
  }
  if (status) {
    conditions.push(`b.status = $${params.length + 1}`);
    params.push(status);
  }
  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
  }
  if (sort_by === 'date') {
    query += ' ORDER BY b.booking_date ASC';
  } else if (sort_by) {
    return res.status(400).json({ error: 'Invalid sort_by parameter', validOptions: ['date'] });
  }

  try {
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Server error while fetching bookings', details: error.message });
  }
});

// Отмена бронирования
router.delete('/bookings/:id', auth(['admin']), async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM Booking WHERE booking_id = $1 RETURNING *', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Booking not found' });
    }
    res.json({ message: 'Booking cancelled successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Server error while cancelling booking', details: error.message });
  }
});

module.exports = router;