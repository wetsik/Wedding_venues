const bcrypt = require("bcrypt");
const pool = require("../config/db");

async function seedDatabase() {
  try {
    console.log("🌱 Database seeding boshlandi...");

    // Districts ma'lumotlarini kiritish
    console.log("📍 Districts qo'shilmoqda...");
    const districts = [
      "Bektemir",
      "Chilonzor",
      "Mirobod",
      "Mirzo Ulug'bek",
      "Olmazor",
      "Sergeli",
      "Shayxontohur",
      "Uchtepa",
      "Yakkasaroy",
      "Yangihayon",
      "Yunusobod",
    ];

    // Avval mavjud districts borligini tekshirish
    const existingDistricts = await pool.query("SELECT COUNT(*) FROM District");
    if (existingDistricts.rows[0].count == 0) {
      for (const district of districts) {
        await pool.query("INSERT INTO District (name) VALUES ($1)", [district]);
      }
      console.log("✅ Districts muvaffaqiyatli qo'shildi");
    } else {
      console.log("ℹ️ Districts allaqachon mavjud");
    }

    // Super Admin yaratish
    console.log("👤 Super Admin yaratilmoqda...");
    const adminUsername = "superadmin";
    const adminPassword = "admin123";

    // Avval admin borligini tekshirish
    const existingAdmin = await pool.query(
      "SELECT * FROM Admin WHERE username = $1",
      [adminUsername]
    );

    if (existingAdmin.rows.length === 0) {
      // Parolni hash qilish
      const saltRounds = 10;
      const hashedPassword = await bcrypt.hash(adminPassword, saltRounds);

      await pool.query(
        "INSERT INTO Admin (username, password) VALUES ($1, $2)",
        [adminUsername, hashedPassword]
      );

      console.log("✅ Super Admin yaratildi:");
      console.log(`   Username: ${adminUsername}`);
      console.log(`   Password: ${adminPassword}`);
    } else {
      console.log("ℹ️ Super Admin allaqachon mavjud");
    }

    // Test ma'lumotlari (ixtiyoriy)
    console.log("🧪 Test ma'lumotlari qo'shilmoqda...");

    // Test venue owner
    const testOwnerUsername = "test_owner";
    const testOwnerPassword = "owner123";
    const existingOwner = await pool.query(
      "SELECT * FROM Venue_Owner WHERE username = $1",
      [testOwnerUsername]
    );

    if (existingOwner.rows.length === 0) {
      const hashedOwnerPassword = await bcrypt.hash(testOwnerPassword, 10);
      await pool.query(
        "INSERT INTO Venue_Owner (first_name, last_name, username, password, card_number) VALUES ($1, $2, $3, $4, $5)",
        ["Test", "Owner", testOwnerUsername, hashedOwnerPassword, "0000-0000-0000-0000"]
      );
      console.log("✅ Test Owner yaratildi:");
      console.log(`   Username: ${testOwnerUsername}`);
      console.log(`   Password: ${testOwnerPassword}`);
    }

    // Test user
    const testUserPhone = "+998901234567";
    const existingUser = await pool.query(
      "SELECT * FROM Users WHERE phone_number = $1",
      [testUserPhone]
    );

    if (existingUser.rows.length === 0) {
      await pool.query(
        "INSERT INTO Users (first_name, last_name, phone_number) VALUES ($1, $2, $3)",
        ["Test", "User", testUserPhone]
      );
      console.log("✅ Test User yaratildi:");
      console.log(`   Phone: ${testUserPhone}`);
    }

    console.log("🎉 Database seeding muvaffaqiyatli yakunlandi!");
    console.log("\n📋 Login ma'lumotlari:");
    console.log("=".repeat(40));
    console.log("SUPER ADMIN:");
    console.log(`Username: ${adminUsername}`);
    console.log(`Password: ${adminPassword}`);
    console.log("=".repeat(40));
    console.log("TEST OWNER:");
    console.log(`Username: ${testOwnerUsername}`);
    console.log(`Password: ${testOwnerPassword}`);
    console.log("=".repeat(40));
    console.log("TEST USER:");
    console.log(`Phone: ${testUserPhone}`);
    console.log("=".repeat(40));
  } catch (error) {
    console.error("❌ Seeding xatosi:", error);
  } finally {
    await pool.end();
  }
}

// Agar fayl to'g'ridan-to'g'ri ishga tushirilsa
if (require.main === module) {
  seedDatabase();
}

module.exports = seedDatabase;
