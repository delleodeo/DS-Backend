// Script to list all indexes for all collections in the 'doros' database
const { MongoClient } = require('mongodb');
require('dotenv').config();

const uri = process.env.MONGO_URI || 'YOUR_ATLAS_CONNECTION_STRING';
const dbName = 'doros';

async function listAllIndexes() {
  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db(dbName);
    const collections = await db.listCollections().toArray();
    for (const coll of collections) {
      const collection = db.collection(coll.name);
      const indexes = await collection.indexes();
      console.log(`\nCollection: ${coll.name}`);
      indexes.forEach(idx => {
        console.log(`  Index name: ${idx.name}, keys: ${JSON.stringify(idx.key)}`);
      });
    }
  } catch (err) {
    console.error('Error listing indexes:', err.message);
  } finally {
    await client.close();
  }
}

listAllIndexes();
