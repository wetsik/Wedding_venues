const pool = require("../config/db")

async function addSubscriptionSystem() {
  try {
    console.log("📅 Oylik obuna tizimi qo'shilmoqda...")

    // Venue_Owner jadvaliga obuna ustunlarini qo'shish
    await pool.query(`
      ALTER TABLE Venue_Owner 
      ADD COLUMN IF NOT EXISTS subscription_expires_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP + INTERVAL '1 month'),
      ADD COLUMN IF NOT EXISTS subscription_rate INTEGER DEFAULT 10
    `)

    // Oylik obuna to'lovlari jadvali
    await pool.query(`
      CREATE TABLE IF NOT EXISTS Monthly_Subscription (
        subscription_id SERIAL PRIMARY KEY,
        owner_id INTEGER NOT NULL REFERENCES Venue_Owner(owner_id),
        month INTEGER NOT NULL,
        year INTEGER NOT NULL,
        total_bookings INTEGER NOT NULL DEFAULT 0,
        total_capacity INTEGER NOT NULL DEFAULT 0,
        subscription_amount INTEGER NOT NULL,
        receipt_url TEXT,
        status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'confirmed', 'rejected')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(owner_id, month, year)
      )
    `)

    // Admin jadvaliga oylik obuna foizini qo'shish
    await pool.query(`
      ALTER TABLE Admin 
      ADD COLUMN IF NOT EXISTS monthly_subscription_rate INTEGER DEFAULT 10
    `)

    // Booking jadvaliga oy va yil ustunlarini qo'shish
    await pool.query(`
      ALTER TABLE Booking 
      ADD COLUMN IF NOT EXISTS booking_month INTEGER,
      ADD COLUMN IF NOT EXISTS booking_year INTEGER
    `)

    // Mavjud bronlar uchun oy va yilni yangilash
    await pool.query(`
      UPDATE Booking 
      SET booking_month = EXTRACT(MONTH FROM booking_date),
          booking_year = EXTRACT(YEAR FROM booking_date)
      WHERE booking_month IS NULL OR booking_year IS NULL
    `)

    // Test ma'lumotlari yangilash
    console.log("🧪 Test ma'lumotlari yangilanmoqda...")

    // Admin obuna foizini yangilash
    await pool.query(`
      UPDATE Admin 
      SET monthly_subscription_rate = 10 
      WHERE username = 'superadmin'
    `)

    // Test owner obuna muddatini yangilash
    await pool.query(`
      UPDATE Venue_Owner 
      SET subscription_expires_at = CURRENT_TIMESTAMP + INTERVAL '1 month',
          subscription_rate = 10
      WHERE username = 'test_owner'
    `)

    console.log("✅ Oylik obuna tizimi muvaffaqiyatli qo'shildi!")
    console.log("📋 Yangi ustunlar:")
    console.log("   - Venue_Owner: subscription_expires_at, subscription_rate")
    console.log("   - Admin: monthly_subscription_rate")
    console.log("   - Booking: booking_month, booking_year")
    console.log("   - Monthly_Subscription: yangi jadval")
  } catch (error) {
    console.error("❌ Obuna tizimi qo'shishda xatolik:", error)
  } finally {
    await pool.end()
  }
}

// Agar fayl to'g'ridan-to'g'ri ishga tushirilsa
if (require.main === module) {
  addSubscriptionSystem()
}

module.exports = addSubscriptionSystem
