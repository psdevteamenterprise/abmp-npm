const fs = require('fs');
const path = require('path');

const csv = require('csv-parser');

const { containsNonEnglish } = require('../backend/daily-pull/utils');

/**
 * Finds URLs containing non-English characters in a CSV file and generates a JSON report
 * Usage: node scripts/find-non-english-urls.js <path-to-csv-file>
 */
function findNonEnglishUrls(csvFilePath) {
  // Validate command-line argument
  if (!csvFilePath) {
    console.error('Error: CSV file path is required');
    console.error('Usage: node scripts/find-non-english-urls.js <path-to-csv-file>');
    process.exit(1);
  }

  // Validate file exists and is readable
  if (!fs.existsSync(csvFilePath)) {
    console.error(`Error: File not found: ${csvFilePath}`);
    process.exit(1);
  }

  const nonEnglishUrls = [];
  let totalMembers = 0;
  let headersValidated = false;
  let headers = null;
  let urlColumnName = null;
  let memberIdColumnName = null;

  return new Promise((resolve, reject) => {
    fs.createReadStream(csvFilePath)
      .pipe(csv())
      .on('headers', receivedHeaders => {
        headers = receivedHeaders;
        // Validate required columns exist - normalize by removing quotes, trimming, and lowercasing
        const normalizedHeaders = headers.map(h => {
          let normalized = String(h).trim();
          // Remove all quotes (single and double) from the string
          normalized = normalized.replace(/["']/g, '');
          return normalized.toLowerCase().trim();
        });

        // Find the actual column names for url and memberId
        const urlIndex = normalizedHeaders.indexOf('url');
        const memberIdIndex = normalizedHeaders.indexOf('memberid');

        if (urlIndex === -1 || memberIdIndex === -1) {
          console.error('Error: CSV must contain "url" and "memberId" columns (case-insensitive)');
          console.error(`Found columns: ${headers.join(', ')}`);
          console.error(`Normalized columns: ${normalizedHeaders.join(', ')}`);
          process.exit(1);
        }

        // Store the actual column names (with original casing/quotes)
        urlColumnName = headers[urlIndex];
        memberIdColumnName = headers[memberIdIndex];
        headersValidated = true;
      })
      .on('data', row => {
        // Validate headers on first data row if headers event didn't fire
        if (!headersValidated) {
          headers = Object.keys(row);
          // Normalize by removing quotes, trimming, and lowercasing
          const normalizedHeaders = headers.map(h => {
            let normalized = String(h).trim();
            // Remove all quotes (single and double) from the string
            normalized = normalized.replace(/["']/g, '');
            return normalized.toLowerCase().trim();
          });

          const urlIndex = normalizedHeaders.indexOf('url');
          const memberIdIndex = normalizedHeaders.indexOf('memberid');

          if (urlIndex === -1 || memberIdIndex === -1) {
            console.error(
              'Error: CSV must contain "url" and "memberId" columns (case-insensitive)'
            );
            console.error(`Found columns: ${headers.join(', ')}`);
            console.error(`Normalized columns: ${normalizedHeaders.join(', ')}`);
            process.exit(1);
          }

          // Store the actual column names
          urlColumnName = headers[urlIndex];
          memberIdColumnName = headers[memberIdIndex];
          headersValidated = true;
        }

        totalMembers++;

        // Get URL and memberId using the actual column names from headers
        const url = row[urlColumnName];
        const memberId = row[memberIdColumnName];

        // Skip rows with missing URL or memberId
        if (!url || !memberId) {
          return;
        }

        const trimmedUrl = url.trim();
        const trimmedMemberId = memberId.trim();

        // Check if URL contains non-English characters
        if (containsNonEnglish(trimmedUrl)) {
          nonEnglishUrls.push({
            url: trimmedUrl,
            memberId: trimmedMemberId,
          });
        }
      })
      .on('error', error => {
        console.error('Error reading CSV file:', error.message);
        reject(error);
      })
      .on('end', () => {
        if (!headersValidated) {
          console.error('Error: Could not read CSV headers');
          process.exit(1);
        }

        // Sort by URL (ascending)
        nonEnglishUrls.sort((a, b) => a.url.localeCompare(b.url));

        // Generate report
        const report = {
          totalMembers: totalMembers,
          totalNonEnglishUrls: nonEnglishUrls.length,
          nonEnglishUrls: nonEnglishUrls,
          summary: {
            percentage:
              totalMembers > 0 ? ((nonEnglishUrls.length / totalMembers) * 100).toFixed(2) : '0.00',
          },
        };

        // Generate output filename
        const csvDir = path.dirname(csvFilePath);
        const csvBasename = path.basename(csvFilePath, path.extname(csvFilePath));
        const outputPath = path.join(
          csvDir,
          `${csvBasename}-non-english-urls-report_with-dashes.json`
        );

        // Write JSON report
        fs.writeFileSync(outputPath, JSON.stringify(report, null, 2), 'utf8');

        console.log('\n=== Non-English URLs Report ===');
        console.log(`Total members processed: ${totalMembers}`);
        console.log(`URLs with non-English characters: ${nonEnglishUrls.length}`);
        console.log(`Percentage: ${report.summary.percentage}%`);
        console.log(`\nReport saved to: ${outputPath}`);
        if (nonEnglishUrls.length > 0) {
          console.log(`\nFirst 10 URLs with non-English characters:`);
          nonEnglishUrls.slice(0, 10).forEach((item, index) => {
            console.log(`  ${index + 1}. "${item.url}" (memberId: ${item.memberId})`);
          });
        } else {
          console.log('\nNo URLs with non-English characters found.');
        }

        resolve(report);
      });
  });
}

// Run if executed directly
if (require.main === module) {
  const csvFilePath = process.argv[2];
  findNonEnglishUrls(csvFilePath).catch(error => {
    console.error('Fatal error:', error.message);
    process.exit(1);
  });
}

module.exports = { findNonEnglishUrls };
