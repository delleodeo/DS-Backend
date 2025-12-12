# Debugging Guide: Cloudinary Image Deletion on Product Delete

## Issue
When deleting a product, images are not being removed from Cloudinary storage.

## Implementation Summary

The system now includes automatic Cloudinary cleanup when products are deleted:

### 1. **Enhanced `deleteProductService()`** 
Located in `backend/modules/products/products.service.js`

**Process:**
1. Fetches product before deletion to access image URLs
2. Collects all image URLs (main product images + variant images)
3. Extracts Cloudinary `public_id` from each URL
4. Calls `deleteBatchFromCloudinary()` to remove images
5. Deletes product from database
6. Updates caches

### 2. **Improved `extractPublicIdFromUrl()`**
Located in `backend/modules/upload/upload.service.js`

**Handles:**
- Simple URLs: `https://res.cloudinary.com/demo/image/upload/sample.jpg` → `sample`
- URLs with versions: `https://res.cloudinary.com/demo/image/upload/v123456/sample.jpg` → `sample`
- URLs with folders: `https://res.cloudinary.com/demo/image/upload/products/temp/img.jpg` → `products/temp/img`
- URLs with transformations: `https://res.cloudinary.com/demo/image/upload/w_500,h_300/sample.jpg` → `sample`

**Tested:** ✓ All 11 test cases pass (run `node backend/test-cloudinary-url-extraction.js`)

### 3. **Enhanced Logging**
Both `deleteProductService()` and `deleteBatchFromCloudinary()` now include detailed console logging.

## Debugging Steps

### Step 1: Check Server Logs

When you delete a product, you should see console logs like:

```
[Product Delete] Starting deletion for product 64abc123...
[Product Delete] Found 3 main product images
[Product Delete] Found 2 variant images from 2 variants
[Product Delete] Total image URLs to process: 5
[Product Delete] Image URLs: [
  'https://res.cloudinary.com/demo/image/upload/v123/products/img1.jpg',
  'https://res.cloudinary.com/demo/image/upload/v123/products/img2.jpg',
  ...
]
[Product Delete] Extracted 5 public IDs: ['products/img1', 'products/img2', ...]
[Cloudinary Batch Delete] Attempting to delete 5 images: ['products/img1', ...]
[Cloudinary Delete] Deleting image with public_id: products/img1
[Cloudinary Delete] Successfully deleted: products/img1
...
[Product Delete] Cloudinary deletion result: 5/5 images deleted successfully
[Product Delete] Successfully deleted product 64abc123... from database
```

### Step 2: Verify Product Structure

Check if your product has images in the correct fields:

```javascript
// Expected product structure
{
  _id: "64abc123...",
  name: "Test Product",
  imageUrls: [  // Main product images - ARRAY
    "https://res.cloudinary.com/demo/image/upload/v123/products/main1.jpg",
    "https://res.cloudinary.com/demo/image/upload/v123/products/main2.jpg"
  ],
  option: [  // Variants
    {
      _id: "64def456...",
      label: "Red",
      imageUrl: "https://res.cloudinary.com/.../variant1.jpg",  // Variant image - STRING
      price: 100
    },
    {
      _id: "64ghi789...",
      label: "Blue",
      imageUrl: "https://res.cloudinary.com/.../variant2.jpg",
      price: 100
    }
  ]
}
```

### Step 3: Check for Common Issues

#### Issue 1: Images not in Cloudinary format
If images are stored locally or on a different CDN, they won't be deleted.

**Check:** Image URLs must contain `/upload/` segment
**Fix:** Ensure all products use Cloudinary URLs

#### Issue 2: Incorrect public_id extraction
If the URL format is different from expected patterns.

**Check:** Run the URL extraction test:
```bash
node backend/test-cloudinary-url-extraction.js
```

**Fix:** Add your URL format to the test and update `extractPublicIdFromUrl()` if needed

#### Issue 3: Cloudinary credentials missing/incorrect
If Cloudinary API credentials are not configured.

**Check:** Verify environment variables:
```bash
echo $env:CLOUDINARY_CLOUD_NAME
echo $env:CLOUDINARY_API_KEY
echo $env:CLOUDINARY_API_SECRET
```

**Fix:** Set credentials in `.env` file

#### Issue 4: Cloudinary deletion fails silently
Images exist but deletion returns "not found"

**Check:** Look for logs like:
```
[Cloudinary Delete] Image not found: products/img1
```

**Possible causes:**
- Image was already deleted
- Wrong `public_id` format
- Image is in a different folder than expected

### Step 4: Manual Testing

#### Test 1: Check a specific product's images

```javascript
// In MongoDB or via API
db.products.findOne({ _id: ObjectId("YOUR_PRODUCT_ID") })
```

Note down the `imageUrls` and `option[].imageUrl` values.

#### Test 2: Test URL extraction manually

Add logging to see what public_id is extracted:

```javascript
const testUrl = "YOUR_CLOUDINARY_URL_HERE";
const publicId = extractPublicIdFromUrl(testUrl);
console.log(`URL: ${testUrl}`);
console.log(`Extracted public_id: ${publicId}`);
```

#### Test 3: Test Cloudinary deletion directly

```javascript
// In upload.service.js or a test file
const { deleteBatchFromCloudinary } = require('./modules/upload/upload.service.js');

deleteBatchFromCloudinary(['products/test_image'])
  .then(result => console.log('Result:', result))
  .catch(error => console.error('Error:', error));
```

### Step 5: Check Cloudinary Dashboard

1. Log into [Cloudinary Console](https://cloudinary.com/console)
2. Go to Media Library
3. Before deleting: Note the image public_ids
4. Delete a product
5. Refresh Media Library
6. Verify images are gone

### Step 6: Check API Response

When you delete a product via the API, check the response:

```bash
DELETE /api/products/:id
```

Expected response:
```json
{
  "message": "Product deleted"
}
```

Check server console for detailed logs.

## Troubleshooting

### Problem: No logs appear when deleting

**Cause:** The `deleteProductService()` is not being called
**Solution:** 
- Verify you're calling the correct endpoint: `DELETE /api/products/:id`
- Check the route configuration in `products.routes.js`
- Check if there's middleware blocking the request

### Problem: Logs show "0 images to process"

**Cause:** Product has no images or they're stored in wrong field
**Solution:**
- Check product structure in database
- Verify images are in `imageUrls` array (not `imageUrl`)
- Verify variants have images in `option[].imageUrl`

### Problem: Logs show "Failed to extract public_id"

**Cause:** URL format not recognized
**Solution:**
- Check the actual URL format in logs
- Update `extractPublicIdFromUrl()` to handle that format
- Add test case to verify

### Problem: Cloudinary returns "not found"

**Cause:** Image already deleted or wrong public_id
**Solution:**
- Check Cloudinary Media Library to see actual public_id
- Compare with extracted public_id in logs
- Verify the image exists before deletion

### Problem: Deletion succeeds but images remain

**Cause:** Wrong Cloudinary account/credentials
**Solution:**
- Verify environment variables match the account where images are stored
- Check if images are in a different Cloudinary account

## Testing Checklist

- [ ] Run URL extraction test: `node backend/test-cloudinary-url-extraction.js`
- [ ] Check Cloudinary credentials in `.env`
- [ ] Create a test product with images
- [ ] Note the image public_ids from Cloudinary dashboard
- [ ] Delete the product via API
- [ ] Check server console logs for deletion details
- [ ] Verify images removed from Cloudinary dashboard
- [ ] Test with product that has variants
- [ ] Test with product that has both main images and variant images
- [ ] Test with product that has no images
- [ ] Verify database cleanup (product removed)
- [ ] Verify cache invalidation

## Quick Test Script

Save this as `backend/test-product-delete.js`:

```javascript
const mongoose = require('mongoose');
const { deleteProductService } = require('./modules/products/products.service.js');

async function testProductDelete() {
  await mongoose.connect(process.env.MONGODB_URI);
  
  // Replace with actual product ID
  const productId = 'YOUR_PRODUCT_ID_HERE';
  
  console.log(`Testing deletion of product: ${productId}`);
  const result = await deleteProductService(productId);
  
  console.log('Deletion result:', result);
  
  await mongoose.disconnect();
}

testProductDelete().catch(console.error);
```

Run: `node backend/test-product-delete.js`
