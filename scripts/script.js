const pool = require("../config/db");

async function resetDatabase() {
  try {
    console.log("🗑️ Database tozalanmoqda...");

    // Jadvallarni tartib bilan o'chirish (foreign key constraints tufayli)
    await pool.query("DROP TABLE IF EXISTS Booking CASCADE");
    await pool.query("DROP TABLE IF EXISTS Venue_Photo CASCADE");
    await pool.query("DROP TABLE IF EXISTS Venue CASCADE");
    await pool.query("DROP TABLE IF EXISTS Users CASCADE");
    await pool.query("DROP TABLE IF EXISTS Venue_Owner CASCADE");
    await pool.query("DROP TABLE IF EXISTS Admin CASCADE");
    await pool.query("DROP TABLE IF EXISTS District CASCADE");

    console.log("✅ Eski jadvallar o'chirildi");

    // Jadvallarni qayta yaratish
    console.log("🏗️ Jadvallar yaratilmoqda...");

    // Districts jadvali
    await pool.query(`
      CREATE TABLE District (
        district_id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL UNIQUE
      )
    `);

    // Admin jadvali
    await pool.query(`
      CREATE TABLE Admin (
        admin_id SERIAL PRIMARY KEY,
        username VARCHAR(50) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Venue_Owner jadvali
    await pool.query(`
      CREATE TABLE Venue_Owner (
        owner_id SERIAL PRIMARY KEY,
        first_name VARCHAR(100) NOT NULL,
        last_name VARCHAR(100) NOT NULL,
        username VARCHAR(50) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Users jadvali
    await pool.query(`
      CREATE TABLE Users (
        user_id SERIAL PRIMARY KEY,
        first_name VARCHAR(100) NOT NULL,
        last_name VARCHAR(100) NOT NULL,
        phone_number VARCHAR(20) NOT NULL UNIQUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Venue jadvali
    await pool.query(`
      CREATE TABLE Venue (
        venue_id SERIAL PRIMARY KEY,
        name VARCHAR(200) NOT NULL,
        district_id INTEGER NOT NULL REFERENCES District(district_id),
        address TEXT NOT NULL,
        capacity INTEGER NOT NULL CHECK (capacity > 0),
        price_per_seat INTEGER NOT NULL CHECK (price_per_seat > 0),
        phone_number VARCHAR(20) NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'unconfirmed' CHECK (status IN ('confirmed', 'unconfirmed')),
        owner_id INTEGER REFERENCES Venue_Owner(owner_id),
        created_by_admin_id INTEGER REFERENCES Admin(admin_id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT venue_owner_check CHECK (
          (owner_id IS NOT NULL AND created_by_admin_id IS NULL) OR
          (owner_id IS NULL AND created_by_admin_id IS NOT NULL)
        )
      )
    `);

    // Venue_Photo jadvali
    await pool.query(`
      CREATE TABLE Venue_Photo (
        photo_id SERIAL PRIMARY KEY,
        venue_id INTEGER NOT NULL REFERENCES Venue(venue_id) ON DELETE CASCADE,
        photo_url TEXT NOT NULL,
        is_main BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Booking jadvali
    await pool.query(`
      CREATE TABLE Booking (
        booking_id SERIAL PRIMARY KEY,
        venue_id INTEGER NOT NULL REFERENCES Venue(venue_id),
        user_id INTEGER NOT NULL REFERENCES Users(user_id),
        booking_date DATE NOT NULL,
        number_of_seats INTEGER NOT NULL CHECK (number_of_seats > 0),
        status VARCHAR(20) NOT NULL DEFAULT 'upcoming' CHECK (status IN ('upcoming', 'completed', 'cancelled')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(venue_id, booking_date)
      )
    `);

    console.log("✅ Jadvallar muvaffaqiyatli yaratildi");
  } catch (error) {
    console.error("❌ Database reset xatosi:", error);
  } finally {
    await pool.end();
  }
}

// Agar fayl to'g'ridan-to'g'ri ishga tushirilsa
if (require.main === module) {
  resetDatabase();
}

module.exports = resetDatabase;
