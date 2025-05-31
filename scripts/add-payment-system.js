const pool = require("../config/db");

async function addPaymentSystem() {
  try {
    console.log("💳 To'lov tizimi qo'shilmoqda...");

    // Booking jadvaliga to'lov ustunlarini qo'shish
    await pool.query(`
      ALTER TABLE Booking 
      ADD COLUMN IF NOT EXISTS payment_receipt_url TEXT,
      ADD COLUMN IF NOT EXISTS payment_status VARCHAR(20) DEFAULT 'pending'
    `);

    // Venue_Owner jadvaliga karta raqami va status qo'shish
    await pool.query(`
      ALTER TABLE Venue_Owner 
      ADD COLUMN IF NOT EXISTS card_number VARCHAR(20),
      ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'active'
    `);

    // Admin jadvaliga karta raqami qo'shish
    await pool.query(`
      ALTER TABLE Admin 
      ADD COLUMN IF NOT EXISTS card_number VARCHAR(20),
      ADD COLUMN IF NOT EXISTS commission_percentage INTEGER DEFAULT 10
    `);

    // Komissiya to'lovlari jadvali
    await pool.query(`
      CREATE TABLE IF NOT EXISTS Commission_Payment (
        payment_id SERIAL PRIMARY KEY,
        owner_id INTEGER NOT NULL REFERENCES Venue_Owner(owner_id),
        booking_id INTEGER NOT NULL REFERENCES Booking(booking_id),
        amount INTEGER NOT NULL,
        receipt_url TEXT,
        status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'rejected')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Booking status constraint yangilash
    await pool.query(`
      ALTER TABLE Booking 
      DROP CONSTRAINT IF EXISTS booking_status_check
    `);

    await pool.query(`
      ALTER TABLE Booking 
      ADD CONSTRAINT booking_status_check 
      CHECK (status IN ('pending', 'confirmed', 'cancelled'))
    `);

    await pool.query(`
      ALTER TABLE Booking 
      ADD CONSTRAINT payment_status_check 
      CHECK (payment_status IN ('pending', 'paid', 'confirmed', 'rejected'))
    `);

    // Test ma'lumotlari qo'shish
    console.log("🧪 Test ma'lumotlari qo'shilmoqda...");

    // Admin karta raqamini yangilash
    await pool.query(`
      UPDATE Admin 
      SET card_number = '8600123456789012', commission_percentage = 10 
      WHERE username = 'superadmin'
    `);

    // Test owner karta raqamini yangilash
    await pool.query(`
      UPDATE Venue_Owner 
      SET card_number = '8600987654321098' 
      WHERE username = 'test_owner'
    `);

    console.log("✅ To'lov tizimi muvaffaqiyatli qo'shildi!");
    console.log("📋 Yangi ustunlar:");
    console.log("   - Booking: payment_receipt_url, payment_status");
    console.log("   - Venue_Owner: card_number, status");
    console.log("   - Admin: card_number, commission_percentage");
    console.log("   - Commission_Payment: yangi jadval");
  } catch (error) {
    console.error("❌ To'lov tizimi qo'shishda xatolik:", error);
  } finally {
    await pool.end();
  }
}

// Agar fayl to'g'ridan-to'g'ri ishga tushirilsa
if (require.main === module) {
  addPaymentSystem();
}

module.exports = addPaymentSystem;
