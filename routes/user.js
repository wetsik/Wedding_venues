const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const auth = require('../middleware/auth');
const router = express.Router();

// Получение всех подтверждённых тоʻйхон
router.get('/venues', async (req, res) => {
  const { search, district_id, sort_by, order } = req.query;
  let query = 'SELECT v.*, d.name AS district_name FROM Venue v JOIN District d ON v.district_id = d.district_id WHERE v.status = $1';
  let params = ['confirmed'];

  if (search) {
    query += ` AND v.name ILIKE $${params.length + 1}`;
    params.push(`%${search}%`);
  }
  if (district_id) {
    query += ` AND v.district_id = $${params.length + 1}`;
    params.push(district_id);
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
router.get('/venues/:id', async (req, res) => {
  try {
    const venue = await pool.query(
      'SELECT v.*, d.name AS district_name FROM Venue v JOIN District d ON v.district_id = d.district_id WHERE v.venue_id = $1 AND v.status = $2',
      [req.params.id, 'confirmed']
    );
    if (venue.rows.length === 0) {
      return res.status(404).json({ error: 'Venue not found or not confirmed' });
    }
    const photos = await pool.query('SELECT * FROM Venue_Photo WHERE venue_id = $1', [req.params.id]);
    const bookings = await pool.query(
      'SELECT booking_date, status, number_of_seats FROM Booking WHERE venue_id = $1',
      [req.params.id]
    );
    res.json({ ...venue.rows[0], photos: photos.rows, bookings: bookings.rows });
  } catch (error) {
    res.status(500).json({ error: 'Server error while fetching venue', details: error.message });
  }
});

// Создание бронирования
router.post('/bookings', auth(['user']), async (req, res) => {
  const { venue_id, booking_date, number_of_seats } = req.body;
  if (!venue_id || !booking_date || !number_of_seats) {
    return res.status(400).json({ error: 'Venue ID, booking date, and number of seats are required' });
  }
  try {
    const venue = await pool.query('SELECT capacity, status FROM Venue WHERE venue_id = $1', [venue_id]);
    if (venue.rows.length === 0 || venue.rows[0].status !== 'confirmed') {
      return res.status(400).json({ error: 'Venue not found or not confirmed' });
    }
    if (number_of_seats > venue.rows[0].capacity) {
      return res.status(400).json({ error: `Requested seats (${number_of_seats}) exceed venue capacity (${venue.rows[0].capacity})` });
    }
    const existingBooking = await pool.query(
      'SELECT * FROM Booking WHERE venue_id = $1 AND booking_date = $2',
      [venue_id, booking_date]
    );
    if (existingBooking.rows.length > 0) {
      return res.status(400).json({ error: 'Venue is already booked for this date' });
    }
    const result = await pool.query(
      'INSERT INTO Booking (venue_id, user_id, booking_date, number_of_seats, status) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [venue_id, req.user.id, booking_date, number_of_seats, 'upcoming']
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error.code === '23503') {
      return res.status(400).json({ error: 'Invalid foreign key (venue_id or user_id)', details: error.message });
    }
    res.status(500).json({ error: 'Server error while creating booking', details: error.message });
  }
});

// Получение своих бронирований
router.get('/bookings', auth(['user']), async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT b.*, v.name AS venue_name, d.name AS district_name FROM Booking b JOIN Venue v ON b.venue_id = v.venue_id JOIN District d ON v.district_id = d.district_id WHERE b.user_id = $1',
      [req.user.id]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Server error while fetching bookings', details: error.message });
  }
});

// Отмена бронирования
router.delete('/bookings/:id', auth(['user']), async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM Booking WHERE booking_id = $1 AND user_id = $2 RETURNING *',
      [req.params.id, req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Booking not found or not owned by you' });
    }
    res.json({ message: 'Booking cancelled successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Server error while cancelling booking', details: error.message });
  }
});

// Регистрация пользователя
router.post('/register', async (req, res) => {
  const { first_name, last_name, phone_number } = req.body;
  if (!first_name || !last_name || !phone_number) {
    return res.status(400).json({ error: 'First name, last name, and phone number are required' });
  }
  try {
    const existing = await pool.query('SELECT * FROM Users WHERE phone_number = $1', [phone_number]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Phone number already exists' });
    }
    const result = await pool.query(
      'INSERT INTO Users (first_name, last_name, phone_number) VALUES ($1, $2, $3) RETURNING *',
      [first_name, last_name, phone_number]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error.code === '23505') {
      return res.status(400).json({ error: 'Phone number already exists (database constraint)' });
    }
    res.status(500).json({ error: 'Server error while creating user', details: error.message });
  }
});

// Логин пользователя
router.post('/login', async (req, res) => {
  const { phone_number } = req.body;
  if (!phone_number) {
    return res.status(400).json({ error: 'Phone number is required' });
  }
  try {
    const result = await pool.query('SELECT * FROM Users WHERE phone_number = $1', [phone_number]);
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid phone number' });
    }
    const user = result.rows[0];
    const token = jwt.sign({ id: user.user_id, role: 'user' }, process.env.JWT_SECRET, { expiresIn: '1h' });
    res.json({ token, user: { id: user.user_id, first_name: user.first_name, last_name: user.last_name, phone_number: user.phone_number } });
  } catch (error) {
    res.status(500).json({ error: 'Server error during login', details: error.message });
  }
});

module.exports = router;