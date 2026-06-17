const mongoose = require("mongoose");
const seedData = require("./seedData");

const connectDB = async () =>{
    try{
        await mongoose.connect(process.env.MONGO_URI);
        console.log("MongoDB connected");
        await seedData();
    } catch(error){
        console.error("MongoDB connection failed:",error.message);
        process.exit(1);
    }
};

module.exports = connectDB;