import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outputPath = path.join(__dirname, '..', 'google-ads-api-design-doc.pdf');

const doc = new PDFDocument({ margin: 60, size: 'A4' });
const stream = fs.createWriteStream(outputPath);
doc.pipe(stream);

// Note at top (red)
doc.fillColor('#cc0000').fontSize(10).font('Helvetica-Oblique')
  .text('Note: Our tool is externally accessible at https://app.ghostpost.co.il — screenshots/mockups are included below.', { align: 'left' });

doc.moveDown(1.5);

// Company Name
doc.fillColor('#000000').font('Helvetica-Bold').fontSize(12)
  .text('Company Name: ', { continued: true })
  .font('Helvetica').text('Ghost Post');

doc.moveDown(1);

// Business Model
doc.font('Helvetica-Bold').text('Business Model: ', { continued: true })
  .font('Helvetica').text(
    'Ghost Post is a SaaS platform for SEO content management. We help businesses manage their website content, track keyword rankings, and optimize for search engines. We do not run Google Ads campaigns or manage ads for anyone. We only use the Google Ads API to retrieve keyword search volume data for our users\' SEO keyword research.'
  );

doc.moveDown(1);

// Tool Access/Use
doc.font('Helvetica-Bold').text('Tool Access/Use: ', { continued: true })
  .font('Helvetica').text(
    'Our tool is used by our platform\'s customers (businesses and content managers) to track keyword rankings and plan content strategy. Users log into our platform at https://app.ghostpost.co.il and view a keywords dashboard that displays search volume, ranking position, clicks, and impressions for their tracked keywords. The search volume data is fetched from the Google Ads Keyword Planner API using our platform\'s own MCC account credentials. Individual users do not need a Google Ads account — all API calls are made server-side using our platform\'s single set of credentials.'
  );

doc.moveDown(1);

// Tool Design
doc.font('Helvetica-Bold').text('Tool Design: ', { continued: true })
  .font('Helvetica').text(
    'When a user adds keywords to track (either manually or through our AI-powered site interview), our backend server sends those keywords to the Google Ads API\'s GenerateKeywordIdeas endpoint to retrieve real monthly search volume data. The results are cached in our MongoDB database for 30 days to minimize API calls. Our UI pulls from this cache to display search volume on the keywords dashboard. Users can also click a "Refresh Search Volume" button to re-fetch updated data.'
  );

doc.moveDown(0.5);
doc.font('Helvetica').text(
  'We batch keywords in groups of up to 20 per API request and cache all results for 30 days per keyword + country + language combination. Estimated daily API usage is under 50 requests.'
);

doc.moveDown(1);

// API Services Called
doc.font('Helvetica-Bold').text('API Services Called:');
doc.moveDown(0.3);
doc.font('Helvetica').fontSize(11)
  .list([
    'Retrieve keyword search volume metrics via KeywordPlanIdeaService (GenerateKeywordIdeas)\nhttps://developers.google.com/google-ads/api/reference/rpc/v23/KeywordPlanIdeaService'
  ], { bulletRadius: 2, textIndent: 15, bulletIndent: 10 });

doc.moveDown(0.3);
doc.font('Helvetica').fontSize(12)
  .text('This is the only API service we use. We do not call any other Google Ads API services.');

doc.moveDown(1.5);

// Tool Mockups
doc.font('Helvetica-Bold').text('Tool Mockups:');
doc.moveDown(0.5);
doc.font('Helvetica').text(
  'Below is a screenshot of our keywords dashboard where the search volume data is displayed. The "VOLUME" column displays the average monthly search volume retrieved from the Google Ads Keyword Planner API. The "Refresh Volume" button in the top-right triggers a fresh API call. Additional columns (Position, Clicks, Impressions, CTR) come from Google Search Console, a separate integration.'
);

doc.moveDown(0.8);

// Embed the real screenshot
const screenshotPath = path.join(__dirname, 'keywords-screenshot.png');
if (fs.existsSync(screenshotPath)) {
  doc.image(screenshotPath, { width: 475, align: 'center' });
} else {
  doc.fillColor('#cc0000').font('Helvetica-Oblique').fontSize(10)
    .text('[Screenshot not found — place keywords-screenshot.png in the scripts/ folder]');
}

doc.moveDown(1);

// Legend
doc.fillColor('#666666').font('Helvetica-Oblique').fontSize(9);
doc.text('Volume = Google Ads Keyword Planner API (GenerateKeywordIdeas)');
doc.text('Position, Clicks, Impressions, CTR = Google Search Console API (separate integration)');

// Finalize
doc.end();

stream.on('finish', () => {
  console.log('PDF created:', outputPath);
});
