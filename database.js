const mongoose = require('mongoose');

mongoose.set('strictQuery', false);

module.exports = () => {
  mongoose
    .connect(process.env.MONGO_URI)
    .then(() => console.log('Connected to MongoDB...'))
    .catch((err) => console.error('MongoDB connection error:', err.message));
};
