const mongoose = require('mongoose');

mongoose.set('strictQuery', false);
// Fail requests quickly when the cluster is unreachable instead of buffering
// every query for the default 10 seconds.
mongoose.set('bufferTimeoutMS', 5000);

const RETRY_BASE_MS = 5000;
const RETRY_MAX_MS = 30000;

const connectDB = async (attempt = 1) => {
  try {
    await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 10000 });
    console.log('Connected to MongoDB...');
  } catch (err) {
    const delay = Math.min(RETRY_MAX_MS, RETRY_BASE_MS * attempt);
    console.error(
      `MongoDB connection error (attempt ${attempt}): ${err.message}. Retrying in ${delay / 1000}s...`
    );
    setTimeout(() => connectDB(attempt + 1), delay);
  }
};

mongoose.connection.on('disconnected', () => {
  console.warn('MongoDB disconnected; waiting for the driver to reconnect...');
});

mongoose.connection.on('reconnected', () => {
  console.log('MongoDB reconnected.');
});

module.exports = () => connectDB();
