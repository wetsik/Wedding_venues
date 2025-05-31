const fs = require("fs");
const path = require("path");

function createUploadDirectories() {
  const directories = [
    "uploads",
    "uploads/receipts",
    "uploads/commission-receipts",
    "uploads/subscription-receipts",
  ];

  directories.forEach((dir) => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      console.log(`✅ Created directory: ${dir}`);
    } else {
      console.log(`ℹ️ Directory already exists: ${dir}`);
    }
  });

  console.log("📁 Upload directories setup complete!");
}

if (require.main === module) {
  createUploadDirectories();
}

module.exports = createUploadDirectories;
