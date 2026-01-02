const { MongoClient } = require('mongodb');
require('dotenv').config();

const uri = process.env.MONGO_URI || 'YOUR_ATLAS_CONNECTION_STRING'; // Replace with your Atlas connection string
const dbName = 'doros'; // Correct database name from Atlas

async function dropSlugIndex() {
  const client = new MongoClient(uri); // useUnifiedTopology is deprecated
  try {
    await client.connect();
    const db = client.db(dbName);
    let collections;
    try {
      collections = await db.listCollections({ name: 'products' }).toArray();
    } catch (e) {
      collections = undefined;
    }
    if (!collections || !Array.isArray(collections) || collections.length === 0) {
      console.log('Collection "products" does not exist in database:', dbName);
      return;
    }
    const collection = db.collection('products');
    const indexes = await collection.indexes();
    const slugIndex = indexes.find(idx => idx.key && idx.key.slug === 1);
    if (slugIndex) {
      await collection.dropIndex(slugIndex.name);
      console.log(`Dropped index: ${slugIndex.name}`);
    } else {
      console.log('No slug index found.');
    }
  } catch (err) {
    console.error('Error while dropping slug index:', err.message);
  } finally {
    await client.close();
  }
}

dropSlugIndex();