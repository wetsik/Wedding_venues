const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const pool = require("../config/db");
const auth = require("../middleware/auth");
const multer = require("multer");
const path = require("path");
const router = express.Router();

// Multer konfiguratsiyasi fayl yuklash uchun
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/receipts/");
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

// Получение всех подтверждённых тоʻйхон (yangilangan obuna logikasi bilan)
router.get("/venues", async (req, res) => {
  const { search, district_id, sort_by, order } = req.query;
  let query = `
    SELECT v.*, d.name AS district_name, vo.subscription_expires_at,
           CASE 
             WHEN vo.subscription_expires_at > CURRENT_TIMESTAMP THEN 'active'
             WHEN EXISTS (
               SELECT 1 FROM Booking b 
               WHERE b.venue_id = v.venue_id 
               AND b.user_id = $1 
               AND b.payment_status = 'confirmed'
               AND b.booking_date > CURRENT_DATE
             ) THEN 'user_booked'
             ELSE 'inactive'
           END as venue_status
    FROM Venue v 
    JOIN District d ON v.district_id = d.district_id 
    LEFT JOIN Venue_Owner vo ON v.owner_id = vo.owner_id
    WHERE v.status = 'confirmed' AND (
      vo.subscription_expires_at > CURRENT_TIMESTAMP OR 
      v.created_by_admin_id IS NOT NULL OR
      EXISTS (
        SELECT 1 FROM Booking b 
        WHERE b.venue_id = v.venue_id 
        AND b.user_id = $1 
        AND b.payment_status = 'confirmed'
        AND b.booking_date > CURRENT_DATE
      )
    )
  `;
  const params = [req.user?.id || 0];

  if (search) {
    query += ` AND v.name ILIKE $${params.length + 1}`;
    params.push(`%${search}%`);
  }
  if (district_id) {
    query += ` AND v.district_id = $${params.length + 1}`;
    params.push(district_id);
  }
  if (sort_by) {
    const validSorts = ["price_per_seat", "capacity"];
    if (validSorts.includes(sort_by)) {
      query += ` ORDER BY v.${sort_by} ${order === "desc" ? "DESC" : "ASC"}`;
    } else {
      return res.status(400).json({
        error: "Invalid sort_by parameter",
        validOptions: ["price_per_seat", "capacity"],
      });
    }
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

// Получение одной тоʻйхоны с информацией о владельце
router.get("/venues/:id", async (req, res) => {
  try {
    const venue = await pool.query(
      `SELECT v.*, d.name AS district_name, vo.card_number as owner_card_number, vo.subscription_expires_at,
              CASE 
                WHEN vo.subscription_expires_at > CURRENT_TIMESTAMP THEN 'active'
                WHEN EXISTS (
                  SELECT 1 FROM Booking b 
                  WHERE b.venue_id = v.venue_id 
                  AND b.user_id = $2 
                  AND b.payment_status = 'confirmed'
                  AND b.booking_date > CURRENT_DATE
                ) THEN 'user_booked'
                ELSE 'inactive'
              END as venue_status
       FROM Venue v 
       JOIN District d ON v.district_id = d.district_id 
       LEFT JOIN Venue_Owner vo ON v.owner_id = vo.owner_id
       WHERE v.venue_id = $1 AND v.status = 'confirmed'`,
      [req.params.id, req.user?.id || 0]
    );
    if (venue.rows.length === 0) {
      return res
        .status(404)
        .json({ error: "Venue not found or not confirmed" });
    }
    const photos = await pool.query(
      "SELECT * FROM Venue_Photo WHERE venue_id = $1",
      [req.params.id]
    );
    const bookings = await pool.query(
      "SELECT booking_date, status, number_of_seats FROM Booking WHERE venue_id = $1 AND payment_status = $2",
      [req.params.id, "confirmed"]
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

// Создание бронирования (yangilangan obuna cheklovi bilan)
router.post("/bookings", auth(["user"]), async (req, res) => {
  const { venue_id, booking_date, number_of_seats } = req.body;
  if (!venue_id || !booking_date || !number_of_seats) {
    return res.status(400).json({
      error: "Venue ID, booking date, and number of seats are required",
    });
  }
  try {
    const venue = await pool.query(
      `SELECT v.capacity, v.status, v.price_per_seat, vo.card_number as owner_card_number, vo.subscription_expires_at
       FROM Venue v 
       LEFT JOIN Venue_Owner vo ON v.owner_id = vo.owner_id
       WHERE v.venue_id = $1`,
      [venue_id]
    );
    if (venue.rows.length === 0 || venue.rows[0].status !== "confirmed") {
      return res
        .status(400)
        .json({ error: "Venue not found or not confirmed" });
    }

    // Obuna tekshiruvi
    const venueData = venue.rows[0];
    if (
      venueData.subscription_expires_at &&
      venueData.subscription_expires_at <= new Date()
    ) {
      // Foydalanuvchining mavjud bronini tekshirish
      const userBooking = await pool.query(
        `SELECT 1 FROM Booking 
         WHERE venue_id = $1 AND user_id = $2 AND payment_status = 'confirmed' AND booking_date > CURRENT_DATE`,
        [venue_id, req.user.id]
      );

      if (userBooking.rows.length === 0) {
        return res.status(400).json({
          error:
            "Bu to'yxona egasining obunasi tugagan. Yangi bron qilish mumkin emas.",
        });
      } else {
        return res.status(400).json({
          error:
            "Sizda bu to'yxonada mavjud bron bor, lekin yangi bron qilish mumkin emas (obuna tugagan).",
        });
      }
    }

    if (number_of_seats > venueData.capacity) {
      return res.status(400).json({
        error: `Requested seats (${number_of_seats}) exceed venue capacity (${venueData.capacity})`,
      });
    }
    const existingBooking = await pool.query(
      "SELECT * FROM Booking WHERE venue_id = $1 AND booking_date = $2 AND payment_status = $3",
      [venue_id, booking_date, "confirmed"]
    );
    if (existingBooking.rows.length > 0) {
      return res
        .status(400)
        .json({ error: "Venue is already booked for this date" });
    }

    const totalAmount = number_of_seats * venueData.price_per_seat;
    const bookingDateObj = new Date(booking_date);

    const result = await pool.query(
      `INSERT INTO Booking (venue_id, user_id, booking_date, number_of_seats, status, payment_status, booking_month, booking_year) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [
        venue_id,
        req.user.id,
        booking_date,
        number_of_seats,
        "pending",
        "pending",
        bookingDateObj.getMonth() + 1,
        bookingDateObj.getFullYear(),
      ]
    );

    res.status(201).json({
      ...result.rows[0],
      total_amount: totalAmount,
      owner_card_number: venueData.owner_card_number,
    });
  } catch (error) {
    if (error.code === "23503") {
      return res.status(400).json({
        error: "Invalid foreign key (venue_id or user_id)",
        details: error.message,
      });
    }
    res.status(500).json({
      error: "Server error while creating booking",
      details: error.message,
    });
  }
});

// To'lov chekini yuklash
router.post(
  "/bookings/:id/upload-receipt",
  auth(["user"]),
  upload.single("receipt"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "Receipt file is required" });
      }

      const booking = await pool.query(
        "SELECT * FROM Booking WHERE booking_id = $1 AND user_id = $2",
        [req.params.id, req.user.id]
      );

      if (booking.rows.length === 0) {
        return res
          .status(404)
          .json({ error: "Booking not found or not owned by you" });
      }

      if (booking.rows[0].payment_status !== "pending") {
        return res.status(400).json({
          error: "Payment receipt already uploaded or booking is not pending",
        });
      }

      const receiptUrl = `/uploads/receipts/${req.file.filename}`;

      const result = await pool.query(
        "UPDATE Booking SET payment_receipt_url = $1, payment_status = $2 WHERE booking_id = $3 RETURNING *",
        [receiptUrl, "paid", req.params.id]
      );

      res.json({
        message: "Receipt uploaded successfully",
        booking: result.rows[0],
      });
    } catch (error) {
      res.status(500).json({
        error: "Server error while uploading receipt",
        details: error.message,
      });
    }
  }
);

// Получение своих бронирований (yangilangan)
router.get("/bookings", auth(["user"]), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT b.*, v.name AS venue_name, d.name AS district_name, v.price_per_seat
       FROM Booking b 
       JOIN Venue v ON b.venue_id = v.venue_id 
       JOIN District d ON v.district_id = d.district_id 
       WHERE b.user_id = $1 
       ORDER BY b.created_at DESC`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({
      error: "Server error while fetching bookings",
      details: error.message,
    });
  }
});

// Отмена бронирования
router.delete("/bookings/:id", auth(["user"]), async (req, res) => {
  try {
    const result = await pool.query(
      "DELETE FROM Booking WHERE booking_id = $1 AND user_id = $2 AND payment_status IN ($3, $4) RETURNING *",
      [req.params.id, req.user.id, "pending", "paid"]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({
        error: "Booking not found, not owned by you, or already confirmed",
      });
    }
    res.json({ message: "Booking cancelled successfully" });
  } catch (error) {
    res.status(500).json({
      error: "Server error while cancelling booking",
      details: error.message,
    });
  }
});

// Регистрация пользователя
router.post("/register", async (req, res) => {
  const { first_name, last_name, phone_number } = req.body;
  if (!first_name || !last_name || !phone_number) {
    return res
      .status(400)
      .json({ error: "First name, last name, and phone number are required" });
  }
  try {
    const existing = await pool.query(
      "SELECT * FROM Users WHERE phone_number = $1",
      [phone_number]
    );
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: "Phone number already exists" });
    }
    const result = await pool.query(
      "INSERT INTO Users (first_name, last_name, phone_number) VALUES ($1, $2, $3) RETURNING *",
      [first_name, last_name, phone_number]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error.code === "23505") {
      return res
        .status(400)
        .json({ error: "Phone number already exists (database constraint)" });
    }
    res.status(500).json({
      error: "Server error while creating user",
      details: error.message,
    });
  }
});

// Логин пользователя
router.post("/login", async (req, res) => {
  const { phone_number } = req.body;
  if (!phone_number) {
    return res.status(400).json({ error: "Phone number is required" });
  }
  try {
    const result = await pool.query(
      "SELECT * FROM Users WHERE phone_number = $1",
      [phone_number]
    );
    if (result.rows.length === 0) {
      return res.status(401).json({ error: "Invalid phone number" });
    }
    const user = result.rows[0];
    const token = jwt.sign(
      { id: user.user_id, role: "user" },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );
    res.json({
      token,
      user: {
        id: user.user_id,
        first_name: user.first_name,
        last_name: user.last_name,
        phone_number: user.phone_number,
      },
    });
  } catch (error) {
    res
      .status(500)
      .json({ error: "Server error during login", details: error.message });
  }
});

module.exports = router;
