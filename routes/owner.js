const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const pool = require("../config/db");
const auth = require("../middleware/auth");
const multer = require("multer");
const path = require("path");
const router = express.Router();

// Multer konfiguratsiyasi
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (req.route.path.includes("subscription")) {
      cb(null, "uploads/subscription-receipts/");
    } else {
      cb(null, "uploads/commission-receipts/");
    }
  },
  filename: (req, file, cb) => {
    cb(
      null,
      Date.now() +
        "-" +
        Math.round(Math.random() * 1e9) +
        path.extname(file.originalname)
    );
  },
});

const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Faqat rasm fayllari qabul qilinadi!"), false);
    }
  },
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
  },
});

// Регистрация владельца
router.post("/register", async (req, res) => {
  const { first_name, last_name, username, password, card_number } = req.body;
  if (!first_name || !last_name || !username || !password || !card_number) {
    return res
      .status(400)
      .json({ error: "All fields including card number are required" });
  }
  try {
    const existing = await pool.query(
      "SELECT * FROM Venue_Owner WHERE username = $1",
      [username]
    );
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: "Username already exists" });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await pool.query(
      "INSERT INTO Venue_Owner (first_name, last_name, username, password, card_number, status, subscription_expires_at) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *",
      [
        first_name,
        last_name,
        username,
        hashedPassword,
        card_number,
        "active",
        new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      ] // 1 oy bepul
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error.code === "23505") {
      return res
        .status(400)
        .json({ error: "Username already exists (database constraint)" });
    }
    res.status(500).json({
      error: "Server error while creating owner",
      details: error.message,
    });
  }
});

// Логин владельца
router.post("/login", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res
      .status(400)
      .json({ error: "Username and password are required" });
  }
  try {
    const result = await pool.query(
      "SELECT * FROM Venue_Owner WHERE username = $1",
      [username]
    );
    if (result.rows.length === 0) {
      return res.status(401).json({ error: "Invalid username or password" });
    }
    const owner = result.rows[0];
    const isValid = await bcrypt.compare(password, owner.password);
    if (!isValid) {
      return res.status(401).json({ error: "Invalid username or password" });
    }
    const token = jwt.sign(
      { id: owner.owner_id, role: "owner" },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );
    res.json({
      token,
      owner: {
        id: owner.owner_id,
        username: owner.username,
        first_name: owner.first_name,
        last_name: owner.last_name,
        status: owner.status,
        card_number: owner.card_number,
        subscription_expires_at: owner.subscription_expires_at,
      },
    });
  } catch (error) {
    res
      .status(500)
      .json({ error: "Server error during login", details: error.message });
  }
});

// Oylik obuna ma'lumotlarini olish
router.get("/subscription-info", auth(["owner"]), async (req, res) => {
  try {
    const currentDate = new Date();
    const currentMonth = currentDate.getMonth() + 1;
    const currentYear = currentDate.getFullYear();

    // Owner ma'lumotlarini olish
    const owner = await pool.query(
      "SELECT subscription_expires_at, subscription_rate FROM Venue_Owner WHERE owner_id = $1",
      [req.user.id]
    );

    if (owner.rows.length === 0) {
      return res.status(404).json({ error: "Owner not found" });
    }

    // Joriy oylik bronlarni hisoblash
    const bookings = await pool.query(
      `SELECT COUNT(*) as booking_count, SUM(v.capacity) as total_capacity
       FROM Booking b
       JOIN Venue v ON b.venue_id = v.venue_id
       WHERE v.owner_id = $1 AND b.booking_month = $2 AND b.booking_year = $3 AND b.payment_status = 'confirmed'`,
      [req.user.id, currentMonth, currentYear]
    );

    // Admin foizini olish
    const admin = await pool.query(
      "SELECT monthly_subscription_rate, card_number FROM Admin LIMIT 1"
    );

    const bookingData = bookings.rows[0];
    const adminData = admin.rows[0];
    const ownerData = owner.rows[0];

    // Obuna summasi = (jami sig'im / 100) * admin foizi * bronlar soni
    const subscriptionAmount = Math.round(
      (Number.parseInt(bookingData.total_capacity || 0) / 100) *
        (adminData.monthly_subscription_rate / 100) *
        Number.parseInt(bookingData.booking_count || 0)
    );

    // Joriy oylik obuna holatini tekshirish
    const currentSubscription = await pool.query(
      "SELECT * FROM Monthly_Subscription WHERE owner_id = $1 AND month = $2 AND year = $3",
      [req.user.id, currentMonth, currentYear]
    );

    res.json({
      subscription_expires_at: ownerData.subscription_expires_at,
      current_month: currentMonth,
      current_year: currentYear,
      booking_count: Number.parseInt(bookingData.booking_count || 0),
      total_capacity: Number.parseInt(bookingData.total_capacity || 0),
      subscription_amount: subscriptionAmount,
      admin_card_number: adminData.card_number,
      admin_rate: adminData.monthly_subscription_rate,
      current_subscription: currentSubscription.rows[0] || null,
      is_expired: new Date(ownerData.subscription_expires_at) <= currentDate,
    });
  } catch (error) {
    res.status(500).json({
      error: "Server error while fetching subscription info",
      details: error.message,
    });
  }
});

// Oylik obuna to'lovini yaratish
router.post("/create-subscription", auth(["owner"]), async (req, res) => {
  try {
    const currentDate = new Date();
    const currentMonth = currentDate.getMonth() + 1;
    const currentYear = currentDate.getFullYear();

    // Mavjud obuna borligini tekshirish
    const existing = await pool.query(
      "SELECT * FROM Monthly_Subscription WHERE owner_id = $1 AND month = $2 AND year = $3",
      [req.user.id, currentMonth, currentYear]
    );

    if (existing.rows.length > 0) {
      return res
        .status(400)
        .json({ error: "Subscription for this month already exists" });
    }

    // Joriy oylik bronlarni hisoblash
    const bookings = await pool.query(
      `SELECT COUNT(*) as booking_count, SUM(v.capacity) as total_capacity
       FROM Booking b
       JOIN Venue v ON b.venue_id = v.venue_id
       WHERE v.owner_id = $1 AND b.booking_month = $2 AND b.booking_year = $3 AND b.payment_status = 'confirmed'`,
      [req.user.id, currentMonth, currentYear]
    );

    // Admin foizini olish
    const admin = await pool.query(
      "SELECT monthly_subscription_rate FROM Admin LIMIT 1"
    );

    const bookingData = bookings.rows[0];
    const adminData = admin.rows[0];

    // Obuna summasi = (jami sig'im / 100) * admin foizi * bronlar soni
    const subscriptionAmount = Math.round(
      (Number.parseInt(bookingData.total_capacity || 0) / 100) *
        (adminData.monthly_subscription_rate / 100) *
        Number.parseInt(bookingData.booking_count || 0)
    );

    if (subscriptionAmount === 0) {
      return res.status(400).json({
        error: "No bookings found for this month, subscription amount is 0",
      });
    }

    // Obuna yaratish
    const result = await pool.query(
      `INSERT INTO Monthly_Subscription (owner_id, month, year, total_bookings, total_capacity, subscription_amount, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [
        req.user.id,
        currentMonth,
        currentYear,
        Number.parseInt(bookingData.booking_count || 0),
        Number.parseInt(bookingData.total_capacity || 0),
        subscriptionAmount,
        "pending",
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({
      error: "Server error while creating subscription",
      details: error.message,
    });
  }
});

// Obuna to'lov chekini yuklash
router.post(
  "/subscription/:id/upload-receipt",
  auth(["owner"]),
  upload.single("receipt"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "Receipt file is required" });
      }

      const subscription = await pool.query(
        "SELECT * FROM Monthly_Subscription WHERE subscription_id = $1 AND owner_id = $2 AND status = $3",
        [req.params.id, req.user.id, "pending"]
      );

      if (subscription.rows.length === 0) {
        return res
          .status(404)
          .json({ error: "Subscription not found or already processed" });
      }

      const receiptUrl = `/uploads/subscription-receipts/${req.file.filename}`;

      await pool.query(
        "UPDATE Monthly_Subscription SET receipt_url = $1, status = $2 WHERE subscription_id = $3",
        [receiptUrl, "paid", req.params.id]
      );

      res.json({ message: "Subscription receipt uploaded successfully" });
    } catch (error) {
      res.status(500).json({
        error: "Server error while uploading receipt",
        details: error.message,
      });
    }
  }
);

// Obuna to'lovlarini olish
router.get("/subscriptions", auth(["owner"]), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT ms.*, a.card_number as admin_card_number
       FROM Monthly_Subscription ms
       CROSS JOIN Admin a
       WHERE ms.owner_id = $1
       ORDER BY ms.year DESC, ms.month DESC`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({
      error: "Server error while fetching subscriptions",
      details: error.message,
    });
  }
});

// Owner'ning o'z to'yxonalarini olish (barcha statuslarda)
router.get("/venues", auth(["owner"]), async (req, res) => {
  const { search, status, sort_by, order } = req.query;
  let query = `
    SELECT v.*, d.name AS district_name 
    FROM Venue v 
    JOIN District d ON v.district_id = d.district_id 
    WHERE v.owner_id = $1
  `;
  const params = [req.user.id];

  if (search) {
    query += ` AND v.name ILIKE $${params.length + 1}`;
    params.push(`%${search}%`);
  }
  if (status) {
    query += ` AND v.status = $${params.length + 1}`;
    params.push(status);
  }
  if (sort_by) {
    const validSorts = ["price_per_seat", "capacity", "created_at"];
    if (validSorts.includes(sort_by)) {
      query += ` ORDER BY v.${sort_by} ${order === "desc" ? "DESC" : "ASC"}`;
    } else {
      return res
        .status(400)
        .json({ error: "Invalid sort_by parameter", validOptions: validSorts });
    }
  } else {
    query += ` ORDER BY v.created_at DESC`;
  }

  try {
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({
      error: "Server error while fetching venues",
      details: error.message,
    });
  }
});

// Owner'ning bitta to'yxonasini olish
router.get("/venues/:id", auth(["owner"]), async (req, res) => {
  try {
    const venue = await pool.query(
      `SELECT v.*, d.name AS district_name 
       FROM Venue v 
       JOIN District d ON v.district_id = d.district_id 
       WHERE v.venue_id = $1 AND v.owner_id = $2`,
      [req.params.id, req.user.id]
    );
    if (venue.rows.length === 0) {
      return res
        .status(404)
        .json({ error: "Venue not found or not owned by you" });
    }
    const photos = await pool.query(
      "SELECT * FROM Venue_Photo WHERE venue_id = $1",
      [req.params.id]
    );
    const bookings = await pool.query(
      `SELECT b.*, u.first_name, u.last_name, u.phone_number 
       FROM Booking b 
       JOIN Users u ON b.user_id = u.user_id 
       WHERE b.venue_id = $1
       ORDER BY b.booking_date DESC`,
      [req.params.id]
    );
    res.json({
      ...venue.rows[0],
      photos: photos.rows,
      bookings: bookings.rows,
    });
  } catch (error) {
    res.status(500).json({
      error: "Server error while fetching venue",
      details: error.message,
    });
  }
});

// Получение бронирований для своей тоʻйхоны (yangilangan)
router.get("/bookings", auth(["owner"]), async (req, res) => {
  const { date, status, payment_status } = req.query;
  let query = `
    SELECT b.*, v.name AS venue_name, d.name AS district_name, u.first_name, u.last_name, u.phone_number, v.price_per_seat
    FROM Booking b
    JOIN Venue v ON b.venue_id = v.venue_id
    JOIN District d ON v.district_id = d.district_id
    JOIN Users u ON b.user_id = u.user_id
    WHERE v.owner_id = $1
  `;
  const params = [req.user.id];

  if (date) {
    query += ` AND b.booking_date = $${params.length + 1}`;
    params.push(date);
  }
  if (status) {
    query += ` AND b.status = $${params.length + 1}`;
    params.push(status);
  }
  if (payment_status) {
    query += ` AND b.payment_status = $${params.length + 1}`;
    params.push(payment_status);
  }

  query += ` ORDER BY b.created_at DESC`;

  try {
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({
      error: "Server error while fetching bookings",
      details: error.message,
    });
  }
});

// To'lov chekini tasdiqlash yoki rad etish
router.put(
  "/bookings/:id/confirm-payment",
  auth(["owner"]),
  async (req, res) => {
    const { action } = req.body; // 'confirm' or 'reject'

    if (!action || !["confirm", "reject"].includes(action)) {
      return res
        .status(400)
        .json({ error: "Action must be 'confirm' or 'reject'" });
    }

    try {
      // Bronning owner'ga tegishli ekanligini tekshirish
      const booking = await pool.query(
        `SELECT b.*, v.price_per_seat, a.commission_percentage, a.card_number as admin_card_number
       FROM Booking b 
       JOIN Venue v ON b.venue_id = v.venue_id 
       CROSS JOIN Admin a
       WHERE b.booking_id = $1 AND v.owner_id = $2 AND b.payment_status = 'paid'`,
        [req.params.id, req.user.id]
      );

      if (booking.rows.length === 0) {
        return res.status(404).json({
          error:
            "Booking not found, not owned by you, or payment not submitted",
        });
      }

      const bookingData = booking.rows[0];

      if (action === "confirm") {
        // To'lovni tasdiqlash
        await pool.query(
          "UPDATE Booking SET payment_status = $1, status = $2 WHERE booking_id = $3",
          ["confirmed", "confirmed", req.params.id]
        );

        // Komissiya to'lovini yaratish
        const totalAmount =
          bookingData.number_of_seats * bookingData.price_per_seat;
        const commissionAmount = Math.round(
          (totalAmount * bookingData.commission_percentage) / 100
        );

        await pool.query(
          `INSERT INTO Commission_Payment (owner_id, booking_id, amount, status) 
         VALUES ($1, $2, $3, 'pending')`,
          [req.user.id, req.params.id, commissionAmount]
        );

        res.json({
          message: "Payment confirmed successfully",
          commission_amount: commissionAmount,
          admin_card_number: bookingData.admin_card_number,
        });
      } else {
        // To'lovni rad etish
        await pool.query(
          "UPDATE Booking SET payment_status = $1 WHERE booking_id = $2",
          ["rejected", req.params.id]
        );

        res.json({ message: "Payment rejected successfully" });
      }
    } catch (error) {
      res.status(500).json({
        error: "Server error while processing payment",
        details: error.message,
      });
    }
  }
);

// Komissiya to'lovlarini olish
router.get("/commission-payments", auth(["owner"]), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT cp.*, b.booking_date, v.name as venue_name, u.first_name, u.last_name, a.card_number as admin_card_number
       FROM Commission_Payment cp
       JOIN Booking b ON cp.booking_id = b.booking_id
       JOIN Venue v ON b.venue_id = v.venue_id
       JOIN Users u ON b.user_id = u.user_id
       CROSS JOIN Admin a
       WHERE cp.owner_id = $1
       ORDER BY cp.created_at DESC`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({
      error: "Server error while fetching commission payments",
      details: error.message,
    });
  }
});

// Komissiya to'lov chekini yuklash
router.post(
  "/commission-payments/:id/upload-receipt",
  auth(["owner"]),
  upload.single("receipt"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "Receipt file is required" });
      }

      const commission = await pool.query(
        "SELECT * FROM Commission_Payment WHERE payment_id = $1 AND owner_id = $2 AND status = $3",
        [req.params.id, req.user.id, "pending"]
      );

      if (commission.rows.length === 0) {
        return res
          .status(404)
          .json({ error: "Commission payment not found or already processed" });
      }

      const receiptUrl = `/uploads/commission-receipts/${req.file.filename}`;

      await pool.query(
        "UPDATE Commission_Payment SET receipt_url = $1 WHERE payment_id = $2",
        [receiptUrl, req.params.id]
      );

      res.json({ message: "Commission receipt uploaded successfully" });
    } catch (error) {
      res.status(500).json({
        error: "Server error while uploading receipt",
        details: error.message,
      });
    }
  }
);

// Owner profilini yangilash
router.put("/profile", auth(["owner"]), async (req, res) => {
  const { first_name, last_name, card_number } = req.body;

  try {
    const result = await pool.query(
      "UPDATE Venue_Owner SET first_name = $1, last_name = $2, card_number = $3 WHERE owner_id = $4 RETURNING *",
      [first_name, last_name, card_number, req.user.id]
    );

    res.json({
      message: "Profile updated successfully",
      owner: result.rows[0],
    });
  } catch (error) {
    res.status(500).json({
      error: "Server error while updating profile",
      details: error.message,
    });
  }
});

// Добавление тоʻйхоны
router.post("/venues", auth(["owner"]), async (req, res) => {
  const { name, district_id, address, capacity, price_per_seat, phone_number } =
    req.body;
  if (
    !name ||
    !district_id ||
    !address ||
    !capacity ||
    !price_per_seat ||
    !phone_number
  ) {
    return res.status(400).json({ error: "All fields are required" });
  }
  try {
    const district = await pool.query(
      "SELECT * FROM District WHERE district_id = $1",
      [district_id]
    );
    if (district.rows.length === 0) {
      return res.status(400).json({ error: "Invalid district_id" });
    }
    const result = await pool.query(
      "INSERT INTO Venue (name, district_id, address, capacity, price_per_seat, phone_number, status, owner_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *",
      [
        name,
        district_id,
        address,
        capacity,
        price_per_seat,
        phone_number,
        "unconfirmed",
        req.user.id,
      ]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error.code === "23503") {
      return res.status(400).json({
        error: "Invalid foreign key (district_id or other)",
        details: error.message,
      });
    }
    res.status(500).json({
      error: "Server error while creating venue",
      details: error.message,
    });
  }
});

// Обновление тоʻйхоны
router.put("/venues/:id", auth(["owner"]), async (req, res) => {
  const { name, district_id, address, capacity, price_per_seat, phone_number } =
    req.body;
  if (
    !name ||
    !district_id ||
    !address ||
    !capacity ||
    !price_per_seat ||
    !phone_number
  ) {
    return res.status(400).json({ error: "All fields are required" });
  }
  try {
    const district = await pool.query(
      "SELECT * FROM District WHERE district_id = $1",
      [district_id]
    );
    if (district.rows.length === 0) {
      return res.status(400).json({ error: "Invalid district_id" });
    }
    const result = await pool.query(
      "UPDATE Venue SET name = $1, district_id = $2, address = $3, capacity = $4, price_per_seat = $5, phone_number = $6 WHERE venue_id = $7 AND owner_id = $8 RETURNING *",
      [
        name,
        district_id,
        address,
        capacity,
        price_per_seat,
        phone_number,
        req.params.id,
        req.user.id,
      ]
    );
    if (result.rows.length === 0) {
      return res
        .status(404)
        .json({ error: "Venue not found or not owned by you" });
    }
    res.json(result.rows[0]);
  } catch (error) {
    if (error.code === "23503") {
      return res.status(400).json({
        error: "Invalid foreign key (district_id or other)",
        details: error.message,
      });
    }
    res.status(500).json({
      error: "Server error while updating venue",
      details: error.message,
    });
  }
});

// Отмена бронирования
router.delete("/bookings/:id", auth(["owner"]), async (req, res) => {
  try {
    const result = await pool.query(
      "DELETE FROM Booking WHERE booking_id = $1 AND venue_id IN (SELECT venue_id FROM Venue WHERE owner_id = $2) RETURNING *",
      [req.params.id, req.user.id]
    );
    if (result.rows.length === 0) {
      return res
        .status(404)
        .json({ error: "Booking not found or not associated with your venue" });
    }
    res.json({ message: "Booking cancelled successfully" });
  } catch (error) {
    res.status(500).json({
      error: "Server error while cancelling booking",
      details: error.message,
    });
  }
});

module.exports = router;
