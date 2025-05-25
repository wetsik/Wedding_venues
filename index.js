const express = require('express');
const cors = require('cors');
const adminRoutes = require('./routes/admin');
const ownerRoutes = require('./routes/owner');
const userRoutes = require('./routes/user');

const app = express();

app.use(cors());
app.use(express.json());

app.use('/api/admin', adminRoutes);
app.use('/api/owner', ownerRoutes);
app.use('/api/user', userRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});