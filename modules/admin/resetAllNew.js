const cron = require("node-cron");
const Admin = require("./admin.model.js");

const resetAllNew = async() => {
    // const admin = new Admin();
    // await admin.save()
  cron.schedule("0 0 * * *", async () => {
    console.log("Resetting daily metrics...");
    await Admin.updateOne(
      {},
      {
        $set: {
          newProductsCount: 0,
          newShopsCount: 0,
          newUsersCount: 0,
          newOrdersCount: 0,
        },
      }
    );
  });
};

module.exports = {resetAllNew}
