const { MongoClient } = require('mongodb');
require('dotenv').config();

const uri = process.env.MONGO_URI || 'YOUR_ATLAS_CONNECTION_STRING';
const dbName = 'doros';

async function dropCategorySlugIndex() {
  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db(dbName);
    let collections;
    try {
      collections = await db.listCollections({ name: 'categories' }).toArray();
    } catch (e) {
      collections = undefined;
    }
    if (!collections || !Array.isArray(collections) || collections.length === 0) {
      console.log('Collection "categories" does not exist in database:', dbName);
      return;
    }
    const collection = db.collection('categories');
    const indexes = await collection.indexes();
    const slugIndex = indexes.find(idx => idx.key && idx.key.slug === 1);
    if (slugIndex) {
      await collection.dropIndex(slugIndex.name);
      console.log(`Dropped index: ${slugIndex.name}`);
    } else {
      console.log('No slug index found on categories.');
    }
  } catch (err) {
    console.error('Error while dropping slug index:', err.message);
  } finally {
    await client.close();
  }
}

dropCategorySlugIndex();