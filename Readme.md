# To'yxona Bron - Backend Dokumentatsiyasi

## 📋 Loyiha haqida

To'yxona Bron - to'yxonalarni bron qilish va boshqarish tizimi. Bu tizim orqali foydalanuvchilar to'yxonalarni ko'rish, bron qilish va to'lovlarni amalga oshirish imkoniyatiga ega bo'ladilar. To'yxona egalari o'z to'yxonalarini boshqarish, bronlarni tasdiqlash va oylik obuna to'lovlarini amalga oshirish imkoniyatiga ega. Adminlar esa butun tizimni nazorat qilish, to'yxonalarni tasdiqlash, komissiya va obuna to'lovlarini boshqarish imkoniyatiga ega.

## 🚀 O'rnatish va ishga tushirish

### Talablar

- Node.js (v14 yoki undan yuqori)
- npm yoki yarn
- PostgreSQL (v12 yoki undan yuqori)

### O'rnatish

1. Loyihani GitHub'dan yuklab oling:

```bash
git clone https://github.com/username/weddingvenues.git
cd weddingvenues
```

2. Backend bog'liqliklarni o'rnating:

```bash
npm install

# yoki

yarn install
```

3. `.env` faylini yarating va quyidagi o'zgaruvchilarni sozlang:

```
DB_USER=postgres
DB_HOST=localhost
DB_PORT=5432
DB_NAME=weddingvenues
DB_PASSWORD=your_password
PORT=8000
JWT_SECRET=your_secret_key
```

4. PostgreSQL ma'lumotlar bazasini yarating:

```bash
psql -U postgres
CREATE DATABASE weddingvenues;
\q
```

5. Ma'lumotlar bazasi sxemasini yarating va test ma'lumotlarini yuklang:

```bash
node scripts/reset-db.js
node scripts/seed.js
node scripts/add-payment-system.js
node scripts/add-subscription-system.js
```

6. Upload papkalarini yarating:

```bash
node scripts/create-upload-dirs.js
```

7. Backend serverni ishga tushiring:

```bash
npm run dev

# yoki

yarn dev
```

8. Server `http://localhost:8000` portida ishga tushadi.

## 🏗️ Loyiha tuzilishi

```
/
├── config/ # Konfiguratsiya fayllari
├── middleware/ # Middleware funksiyalari
├── routes/ # API yo'nalishlari
├── scripts/ # Skriptlar (ma'lumotlar bazasi, seed, va boshqalar)
├── uploads/ # Yuklangan fayllar
├── index.js # Asosiy fayl
└── package.json # Loyiha bog'liqliklari
```

## 📊 Ma'lumotlar bazasi sxemasi

### Jadvallar

1. **Users** - Foydalanuvchilar
2. **Admin** - Adminlar
3. **Venue_Owner** - To'yxona egalari
4. **Venue** - To'yxonalar
5. **Venue_Photo** - To'yxona rasmlari
6. **District** - Rayonlar
7. **Booking** - Bronlar
8. **Commission_Payment** - Komissiya to'lovlari
9. **Monthly_Subscription** - Oylik obuna to'lovlari

### Muhim jadvallar tuzilishi

#### Users

```sql
CREATE TABLE Users (
user_id SERIAL PRIMARY KEY,
first_name VARCHAR(100) NOT NULL,
last_name VARCHAR(100) NOT NULL,
phone_number VARCHAR(20) UNIQUE NOT NULL,
created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### Venue_Owner

```sql
CREATE TABLE Venue_Owner (
owner_id SERIAL PRIMARY KEY,
first_name VARCHAR(100) NOT NULL,
last_name VARCHAR(100) NOT NULL,
username VARCHAR(50) UNIQUE NOT NULL,
password VARCHAR(100) NOT NULL,
card_number VARCHAR(20) NOT NULL,
status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
subscription_expires_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP + INTERVAL '1 month'),
subscription_rate INTEGER DEFAULT 10,
created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### Venue

```sql
CREATE TABLE Venue (
venue_id SERIAL PRIMARY KEY,
name VARCHAR(200) NOT NULL,
district_id INTEGER REFERENCES District(district_id),
address TEXT NOT NULL,
capacity INTEGER NOT NULL,
price_per_seat INTEGER NOT NULL,
phone_number VARCHAR(20) NOT NULL,
status VARCHAR(20) DEFAULT 'unconfirmed' CHECK (status IN ('unconfirmed', 'confirmed', 'rejected')),
owner_id INTEGER REFERENCES Venue_Owner(owner_id),
created_by_admin_id INTEGER REFERENCES Admin(admin_id),
created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### Booking

```sql
CREATE TABLE Booking (
booking_id SERIAL PRIMARY KEY,
venue_id INTEGER REFERENCES Venue(venue_id) ON DELETE CASCADE,
user_id INTEGER REFERENCES Users(user_id),
booking_date DATE NOT NULL,
number_of_seats INTEGER NOT NULL,
status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'cancelled')),
payment_status VARCHAR(20) DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid', 'confirmed', 'rejected')),
payment_receipt_url TEXT,
booking_month INTEGER,
booking_year INTEGER,
created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### Monthly_Subscription

```sql
CREATE TABLE Monthly_Subscription (
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
);
```

## 🔐 Autentifikatsiya va avtorizatsiya

Loyiha JWT (JSON Web Token) asosida autentifikatsiya tizimidan foydalanadi. Autentifikatsiya `middleware/auth.js` fayli orqali boshqariladi.

### Foydalanuvchi turlari

1. **Admin** - Tizim administratori
2. **Owner** - To'yxona egasi
3. **User** - Oddiy foydalanuvchi

### Middleware

```javascript
// middleware/auth.js
const jwt = require("jsonwebtoken");

module.exports = (allowedRoles) => {
  return (req, res, next) => {
    try {
      const token = req.headers.authorization?.split(" ")[1];
      if (!token) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      if (!allowedRoles.includes(decoded.role)) {
        return res.status(403).json({ error: "Access denied" });
      }

      req.user = decoded;
      next();
    } catch (error) {
      res.status(401).json({ error: "Invalid token" });
    }
  };
};
```

## 🌐 API endpointlari

### Foydalanuvchi endpointlari

#### Autentifikatsiya

- `POST /user/register` - Foydalanuvchi ro'yxatdan o'tish
- `POST /user/login` - Foydalanuvchi login

#### To'yxonalar

- `GET /user/venues` - To'yxonalar ro'yxatini olish
- `GET /user/venues/:id` - To'yxona ma'lumotlarini olish

#### Bronlar

- `POST /user/bookings` - Yangi bron yaratish
- `GET /user/bookings` - Foydalanuvchining bronlarini olish
- `DELETE /user/bookings/:id` - Bronni bekor qilish
- `POST /user/bookings/:id/upload-receipt` - Bron uchun to'lov chekini yuklash

### To'yxona egasi endpointlari

#### Autentifikatsiya

- `POST /owner/register` - To'yxona egasi ro'yxatdan o'tish
- `POST /owner/login` - To'yxona egasi login

#### To'yxonalar

- `GET /owner/venues` - Eganing to'yxonalari ro'yxatini olish
- `GET /owner/venues/:id` - To'yxona ma'lumotlarini olish
- `POST /owner/venues` - Yangi to'yxona qo'shish
- `PUT /owner/venues/:id` - To'yxona ma'lumotlarini yangilash

#### Bronlar

- `GET /owner/bookings` - Eganing to'yxonalaridagi bronlarni olish
- `PUT /owner/bookings/:id/confirm-payment` - Bron to'lovini tasdiqlash yoki rad etish
- `DELETE /owner/bookings/:id` - Bronni bekor qilish

#### Komissiya to'lovlari

- `GET /owner/commission-payments` - Komissiya to'lovlarini olish
- `POST /owner/commission-payments/:id/upload-receipt` - Komissiya to'lovi chekini yuklash

#### Obuna

- `GET /owner/subscription-info` - Obuna ma'lumotlarini olish
- `GET /owner/subscriptions` - Obuna to'lovlari tarixini olish
- `POST /owner/create-subscription` - Yangi obuna to'lovini yaratish
- `POST /owner/subscription/:id/upload-receipt` - Obuna to'lovi chekini yuklash

### Admin endpointlari

#### Autentifikatsiya

- `POST /admin/login` - Admin login

#### To'yxonalar

- `GET /admin/venues` - To'yxonalar ro'yxatini olish
- `GET /admin/venues/:id` - To'yxona ma'lumotlarini olish
- `POST /admin/venues` - Yangi to'yxona qo'shish
- `PUT /admin/venues/:id` - To'yxona ma'lumotlarini yangilash
- `PUT /admin/venues/:id/confirm` - To'yxonani tasdiqlash
- `DELETE /admin/venues/:id` - To'yxonani o'chirish
- `PUT /admin/venues/:id/assign-owner` - To'yxonaga egani biriktirish

#### To'yxona egalari

- `GET /admin/owners` - To'yxona egalari ro'yxatini olish
- `POST /admin/owners` - Yangi to'yxona egasini qo'shish
- `PUT /admin/owners/:id/status` - To'yxona egasi statusini o'zgartirish

#### Bronlar

- `GET /admin/bookings` - Barcha bronlarni olish
- `DELETE /admin/bookings/:id` - Bronni bekor qilish

#### Komissiya to'lovlari

- `GET /admin/commission-payments` - Komissiya to'lovlarini olish
- `PUT /admin/commission-payments/:id/confirm` - Komissiya to'lovini tasdiqlash
- `PUT /admin/commission-payments/:id/reject` - Komissiya to'lovini rad etish

#### Obuna to'lovlari

- `GET /admin/subscription-payments` - Obuna to'lovlarini olish
- `PUT /admin/subscription-payments/:id/confirm` - Obuna to'lovini tasdiqlash
- `PUT /admin/subscription-payments/:id/reject` - Obuna to'lovini rad etish

## 📁 Fayl yuklash

Loyiha fayl yuklash uchun `multer` kutubxonasidan foydalanadi. Fayllar `uploads` papkasiga saqlanadi.

### Fayl turlari

- `uploads/receipts/` - Bron to'lovlari cheklari
- `uploads/commission-receipts/` - Komissiya to'lovlari cheklari
- `uploads/subscription-receipts/` - Obuna to'lovlari cheklari

### Multer konfiguratsiyasi

```javascript
const storage = multer.diskStorage({
destination: (req, file, cb) => {
if (req.route.path.includes("subscription")) {
cb(null, "uploads/subscription-receipts/");
} else {
cb(null, "uploads/receipts/");
}
},
filename: (req, file, cb) => {
cb(null, Date.now() + "-" + Math.round(Math.random() \* 1e9) + path.extname(file.originalname));
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
fileSize: 5 _ 1024 _ 1024, // 5MB
},
});
```

## 🔄 Oylik obuna tizimi

Oylik obuna tizimi to'yxona egalarining to'yxonalarini foydalanuvchilarga ko'rsatish uchun oylik to'lov qilishini ta'minlaydi.

### Obuna holatlari

- **Faol** - To'yxona egasining obunasi faol, to'yxonalari foydalanuvchilarga ko'rinadi
- **Tugagan** - Obuna tugagan, to'yxonalar faqat egasiga ko'rinadi
- **Foydalanuvchi broni bor** - Obuna tugagan bo'lsa ham, foydalanuvchi bronlagan to'yxonalar ko'rinadi, lekin yangi bron qilish mumkin emas

### Obuna to'lovi hisoblash

Obuna to'lovi quyidagi formula asosida hisoblanadi:

```
Obuna to'lovi = (Jami sig'im / 100) _ Admin foizi _ Bronlar soni
```

### Obuna to'lovi jarayoni

1. To'yxona egasi oylik obuna to'lovini yaratadi
2. Admin karta raqamiga to'lov qiladi
3. To'lov chekini yuklaydi
4. Admin to'lovni tasdiqlaydi
5. To'yxona egasining obuna muddati 1 oyga uzaytiriladi

## 🧪 Test ma'lumotlari

Tizimni test qilish uchun quyidagi ma'lumotlardan foydalanishingiz mumkin:

### Admin

- Username: superadmin
- Password: admin123

### To'yxona egasi

- Username: test_owner
- Password: owner123

### Foydalanuvchi

- Telefon: +998901234567

## 🐛 Xatolarni bartaraf etish

### Ma'lumotlar bazasi muammolari

1. PostgreSQL xizmatining ishga tushganligini tekshiring
2. `.env` faylidagi ma'lumotlar bazasi ma'lumotlari to'g'ri sozlanganligini tekshiring
3. Ma'lumotlar bazasi sxemasi to'g'ri yaratilganligini tekshiring

### Fayl yuklash muammolari

1. `uploads` papkasi mavjudligini tekshiring
2. `uploads` papkasiga yozish huquqlari mavjudligini tekshiring
3. Multer konfiguratsiyasini tekshiring

### JWT muammolari

1. `.env` faylidagi `JWT_SECRET` to'g'ri sozlanganligini tekshiring
2. Token muddati tugaganligini tekshiring

## 📝 Eslatmalar

- Loyiha Node.js va Express.js asosida qurilgan
- Ma'lumotlar bazasi sifatida PostgreSQL ishlatilgan
- Autentifikatsiya uchun JWT ishlatilgan
- Fayl yuklash uchun Multer ishlatilgan
