exports.uploadImages = async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) 
        return res.status(400).json({ error: 'No images uploaded.' });

    const uploadedImages = req.files.map(file => ({
      url: file.path,           
      public_id: file.filename, 
    }));

    return res.status(200).json({
      message: 'Images uploaded successfully.',
      images: uploadedImages,
    });
  } catch (err) {
    console.error('[Upload Error]', err);
    return res.status(500).json({ error: 'Something went wrong during upload.' });
  }
};
