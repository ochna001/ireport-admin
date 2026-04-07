# PDF Media Embedding Feature

## Overview

Final incident reports now automatically include embedded images and video thumbnails in a separate "Evidence/Media Attachments" section at the end of the PDF.

## Features

### **Automatic Media Detection**

The system automatically detects and embeds media from:
- `incident.media_urls` - Media uploaded with the initial report
- `finalReport.report_details.media_urls` - Media added during final report creation

### **Supported Media Types**

#### **Images** (Embedded directly)
- `.jpg`, `.jpeg`
- `.png`
- `.gif`
- `.bmp`
- `.webp`
- `.svg`

#### **Videos** (Thumbnail generated from first frame)
- `.mp4`
- `.mov`
- `.avi`
- `.webm`
- `.mkv`
- `.m4v`

#### **Other Files**
- URL is displayed but file is not embedded
- Useful for documents, audio files, etc.

## PDF Structure

### **Main Report Pages**
1. **Header** - Agency-specific colored header with incident info
2. **Incident Information** - ID, reporter, location, status, dates
3. **Initial Report Description** - Original incident description
4. **Final Report Details** - Agency-specific report fields
   - PNP: Narrative, suspects, victims, evidence count
   - BFP: Fire location, class, damage, casualties
   - PDRRMO: Emergency type, patients, response details
   - MDRRMO: Disaster type, damage assessment, narrative

### **Evidence/Media Section** (New Page)
For each media file:
- **Item Number** - Sequential numbering (1, 2, 3...)
- **Media Type** - Image, Video, or File
- **URL** - Full clickable URL (blue text)
- **Embedded Content**:
  - **Images**: Full image embedded (scaled to fit)
  - **Videos**: Thumbnail from first frame + "(Video thumbnail - first frame)" label
  - **Other**: "[File could not be loaded]" placeholder

## How It Works

### **Image Embedding**
```typescript
1. Load image from URL
2. Convert to base64 data URL using canvas
3. Compress to JPEG (80% quality)
4. Calculate dimensions to fit within max bounds
5. Embed in PDF using jsPDF.addImage()
```

### **Video Thumbnail Generation**
```typescript
1. Load video element with URL
2. Seek to 1 second mark (better frame than 0)
3. Capture frame to canvas
4. Convert to base64 JPEG
5. Embed in PDF like an image
6. Add "(Video thumbnail - first frame)" label
```

### **Automatic Pagination**
- Media section starts on a new page
- Automatically adds new pages when content exceeds page height
- Each media item gets adequate spacing

## Usage

### **Export PDF with Media**

In the Incident Detail page:

1. Click **"Export PDF"** button in the Final Report card
2. System automatically:
   - Generates main report pages
   - Detects all media URLs
   - Loads images asynchronously
   - Generates video thumbnails
   - Embeds everything in PDF
   - Saves complete PDF file

### **What Users See**

**During Export**:
- Brief loading time (depends on number of media files)
- Larger files take longer to load

**In PDF**:
- Professional report with all evidence embedded
- Images displayed at readable size
- Video thumbnails show preview of content
- URLs provided for reference/verification

## Technical Details

### **Image Processing**
- **Max Width**: Page width - 2 × margin (~180mm)
- **Max Height**: 80mm per image
- **Aspect Ratio**: Preserved during scaling
- **Format**: JPEG at 80% quality
- **CORS**: `crossOrigin = 'anonymous'` for external images

### **Video Processing**
- **Seek Time**: 1 second (configurable)
- **Thumbnail Format**: JPEG at 80% quality
- **Same dimensions as images**
- **Fallback**: Shows error message if video can't load

### **Error Handling**
- **Image Load Failure**: Shows "[Image could not be loaded]"
- **Video Load Failure**: Shows "[Video could not be loaded]"
- **Network Issues**: Gracefully handles timeouts
- **CORS Issues**: Logs error and shows placeholder

## Limitations

### **CORS Restrictions**
Images/videos from external domains may fail to load if:
- Server doesn't allow cross-origin requests
- No `Access-Control-Allow-Origin` header

**Solution**: Use Supabase Storage URLs which support CORS.

### **File Size**
- Large PDFs (many high-res images) may take time to generate
- Browser memory limits apply (~100-200 images max)

**Recommendation**: Compress images before upload.

### **Video Limitations**
- Only first frame is captured (not animated)
- Some video codecs may not work in browser
- Large videos may timeout during thumbnail generation

## Examples

### **PDF with 3 Images**
```
Page 1: Main Report
Page 2: Evidence Section
  1. Image
     https://storage.supabase.co/.../photo1.jpg
     [Embedded image 150mm × 100mm]
  
  2. Image
     https://storage.supabase.co/.../photo2.jpg
     [Embedded image 180mm × 120mm]

Page 3: Evidence Section (continued)
  3. Image
     https://storage.supabase.co/.../photo3.jpg
     [Embedded image 160mm × 90mm]
```

### **PDF with Mixed Media**
```
Page 2: Evidence Section
  1. Image
     [Embedded photo of incident scene]
  
  2. Video
     [Thumbnail from video]
     (Video thumbnail - first frame)
  
  3. Image
     [Embedded photo of damage]
```

## Benefits

### **For Officers**
- ✅ Complete evidence package in one PDF
- ✅ No need to download media separately
- ✅ Professional presentation for reports
- ✅ Easy to share with other agencies

### **For Administrators**
- ✅ Comprehensive incident documentation
- ✅ Visual evidence included automatically
- ✅ Reduced manual work
- ✅ Better record keeping

### **For Legal/Court Use**
- ✅ All evidence in single document
- ✅ URLs provided for verification
- ✅ Timestamped and dated
- ✅ Professional format

## Troubleshooting

### **Images Not Showing**
1. Check if URL is accessible
2. Verify CORS headers on image server
3. Try opening URL in browser
4. Check browser console for errors

### **Videos Not Generating Thumbnails**
1. Verify video format is supported
2. Check if video is accessible
3. Try shorter video (< 100MB)
4. Check browser console for errors

### **PDF Export Fails**
1. Check browser console for errors
2. Reduce number of media files
3. Compress large images
4. Try exporting without media first

### **Slow Export**
- **Cause**: Loading many large images
- **Solution**: 
  - Compress images before upload
  - Limit media files per report
  - Use faster internet connection

## Future Enhancements

### **Planned**
- [ ] Progress indicator during export
- [ ] Option to exclude media from PDF
- [ ] Configurable image quality/size
- [ ] Multiple video frames (not just first)
- [ ] PDF compression for smaller files

### **Possible**
- [ ] OCR for text extraction from images
- [ ] Image enhancement/filters
- [ ] Watermarking
- [ ] Digital signatures
- [ ] Encrypted PDFs

---

**Feature Status**: ✅ **Production Ready**

The media embedding feature is fully implemented and ready for use. All media types are supported with graceful fallbacks for errors.
